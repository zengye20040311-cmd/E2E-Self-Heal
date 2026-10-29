<a id="shadow-testing--quickstart"></a>

# 影子测试：快速入门

> **状态：** 轨迹解析、快照存储、模拟注入及回放运行时已有实现。`e2e-healer --shadow` 下的录制／回放选择和快照选择参数仍未完整开放，原计划见 [#81](https://github.com/Lee-Dongwook/E2E-Self-Heal/issues/81)。第 1～2 步可按示例执行；第 3 步区分当前占位命令与拟议参数。完整架构见 [`docs/shadow-testing.md`](shadow-testing.md)。

影子测试使用应用网络交互的**录制快照**重放 Playwright 测试，以减少对真实后端的依赖，目标是让验证更快、更稳定。

<a id="1-capture-a-trace"></a>

## 1. 录制轨迹

先用普通 Playwright 追踪功能录制目标测试：

```sh
npx playwright test tests/login.spec.ts --trace on
```

Playwright 将轨迹写入 `test-results/<test-name>/trace.zip`。这一步只是正常测试录制，尚未启用影子回放。

<a id="2-parse-the-trace-and-store-the-snapshot"></a>

## 2. 解析轨迹并保存快照

使用 [`PlaywrightTraceParser`](../app/shadow/trace_parser.py) 解析，然后通过 [`SnapshotStore`](../app/shadow/snapshot_store.py) 持久化：

```sh
uv run python - <<'PY'
from pathlib import Path

from app.shadow.schemas import ShadowSnapshot
from app.shadow.snapshot_store import SnapshotStore
from app.shadow.trace_parser import PlaywrightTraceParser
from app.shadow.workspace import ShadowWorkspace

trace_path = Path("test-results/login-should-succeed/trace.zip")
snapshot_id = "login-happy-path"

network_snapshots = PlaywrightTraceParser().parse(trace_path)
snapshot = ShadowSnapshot(snapshot_id=snapshot_id, network_snapshots=network_snapshots)

store = SnapshotStore(ShadowWorkspace())
store.save_snapshot(snapshot_id, snapshot)
print(f"saved {len(network_snapshots)} network interactions as '{snapshot_id}'")
PY
```

JSON 快照写入 `.shadow_workspace/snapshots/<快照 ID 的 SHA-256>.json`，目录设置来自 [`ShadowConfig`](../app/shadow/config.py)。序列化结果稳定且易于比较；对相同轨迹重复生成时内容应一致。

首次使用时，`ShadowWorkspace` 通过带版本的所有权标记认领新目录或空目录。它拒绝文件系统根目录、用户主目录、仓库根目录，以及没有标记的非空目录，防止误将无关目录设为工作区。旧版创建但没有标记的工作区需要先移开或清空，再重新认领。

快照会持久保留：`ON_SUCCESS` 与 `ALWAYS` 清理只删除 `cache/` 和 `tmp/`，保留工作区根目录及 `snapshots/`；`NEVER` 保留全部三类目录。

<a id="offline-replay-policy"></a>

### 离线回放策略

将 `offline=True` 与 `miss_policy="strict"` 配合使用。未匹配请求会被中止，不放行到真实服务，也不为补录而访问网络。离线模式不允许搭配 `lenient` 或 `record-and-augment`；后两者只应在明确允许真实流量时使用。这里限制的是受回放拦截的请求，不应理解为对任意测试代码的操作系统级隔离。

<a id="3-replay-the-test-with-e2e-healer---shadow"></a>

## 3. 使用 `e2e-healer --shadow` 回放测试

当前单独运行 `--shadow` 只检查最小运行时的初始化与关闭：

```sh
uv run e2e-healer --shadow
```

实际输出仍保留程序原文：

```text
╭──────────────── Shadow Testing ────────────────╮
│ Shadow Testing runtime is under development —   │
│ no shadow logic runs yet.                       │
╰──────────────────────────────────────────────────╯
```

含义是“影子测试入口仍在开发，目前未执行回放逻辑”。底层 [`run_shadow(test_path, snapshot_id)`](../app/shadow/runtime.py) 已接收测试路径和快照 ID；以下是 #81 的**拟议 CLI 形式，当前不能作为可用命令复制运行**：

```sh
# 拟议形式，实际参数名须等待 #81 确定
uv run e2e-healer --shadow tests/login.spec.ts --snapshot-id login-happy-path
```

完整底层回放会启动无头 Chromium，通过 [`MockInjector`](../app/shadow/injector.py) 匹配快照响应，再运行测试。正常修复图中的 `shadow_verifier` 已可调用这条底层路径；它按测试文件名的 stem 查找已有快照，未找到则跳过。上面手动保存的 `login-happy-path` 是独立示例 ID，不会自动与名为 login.spec.ts 的测试关联。

<a id="4-read-the-result"></a>

## 4. 读取结果

回放返回 [`ShadowRunResult`](../app/shadow/schemas.py)：

| 字段 | 含义 |
| --- | --- |
| `is_success` | Playwright 测试进程是否以 `0` 退出 |
| `matched_count` | 用快照响应成功满足的请求数 |
| `missed_count` | 无匹配快照的请求数，严格模式会中止并记录 `network_mock_no_match` |
| `score` | 已匹配请求的平均相似度分数；当前评分器使用加权分值，不保证在 0～1 之间 |
| `missed_requests` | 实际未匹配的 `CapturedRequest` 列表，供排查 |

原设计中的面板示例如下，数字仅为展示：

```text
╭──────────────── Shadow Testing ────────────────╮
│ passed | matched=12 missed=0 score=0.97         │
╰──────────────────────────────────────────────────╯
```

`missed_count` 大于零，通常说明本次测试访问了录制未覆盖的请求，例如新接口、变化过大的参数，或重复响应队列已耗尽。可以重新录制，或检查 `missed_requests` 中具体漏配的调用。

<a id="see-also"></a>

## 延伸阅读

- [`docs/shadow-testing.md`](shadow-testing.md)：完整架构、各阶段契约和扩展点。
- [`docs/roadmap-v0.5.md`](roadmap-v0.5.md)：影子测试历史规划及组件状态。
