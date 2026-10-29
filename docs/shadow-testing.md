<a id="shadow-testing--architecture"></a>

# 影子测试：架构

> **状态：已实现组件的设计参考。** 轨迹解析器、快照存储、注入器、匹配器和运行时均已有实现，且通过 `shadow_verifier` 接入修复图。原设计记录将这条管线记为 `0.4.0` 已交付。当前需区分：自动采集／选取快照的 CLI 体验尚未完整开放，裸 `--shadow` 仍是占位入口；下面说明组件职责、数据契约及[扩展点](#extension-points)。

<a id="motivation"></a>

## 动机

核心修复循环 `Diagnoser → Patch Generator → Selector Verifier → Test Runner` 会对真实应用执行真实 Playwright 测试，见 [`design.md`](design.md)。这种验证直接，但每次都访问后端，受网络和环境影响，可能因与待修复选择器无关的原因失败。

**影子测试（Shadow Testing）** 是补充验证方式：将一次已录制的 Playwright 轨迹解析成应用网络行为快照，通过请求拦截把记录响应返回给浏览器，再在这个环境副本中运行测试。目标是在候选补丁验证时减少真实服务访问，使运行更可重复。它不改变测试的断言或修复允许范围。

<a id="pipeline-overview"></a>

## 管线概览

```text
Playwright 轨迹：录制的请求、响应、时序
                │
                ▼
轨迹解析器：网络交互 → 快照对象
                │
                ▼
快照存储：以 JSON 保存／加载 ShadowSnapshot
                │
                ▼
模拟注入器：拦截请求、匹配并返回快照响应
                │
                ▼
影子运行时：工作区与组件编排
                │
                ▼
Playwright 执行：对重放响应运行原测试
```

数据沿管线单向流动。每个阶段消费前一阶段的产物，将其转换成更明确的结构，类似核心预处理器将原始数据抽象后交给模型。阶段间交换 [`app/shadow/schemas.py`](../app/shadow/schemas.py) 定义的 Pydantic 对象，而非未经解释的轨迹字节。

<a id="stages"></a>

## 各阶段职责

<a id="1-playwright-trace-input"></a>

### 1. Playwright 轨迹：输入

**作用：** 提供原材料，记录真实运行时页面发出的请求、接收的响应、头、请求／响应体及顺序。

**输出：** 磁盘上的轨迹文件路径。

录制是引擎之外的步骤，例如普通 Playwright 的 `--trace on`。把文件路径交给后续管线前，尚未解析任何轨迹内容。

<a id="2-trace-parser"></a>

### 2. 轨迹解析器

**作用：** 遍历轨迹，抽取每次网络交互，形成类型明确的请求／响应对，丢弃回放不需要的信息。

**输入：** 轨迹文件路径。

**输出：** `list[NetworkSnapshot]`，每项包含 `CapturedRequest` 和 `CapturedResponse`。调用方将列表包装成 `ShadowSnapshot` 后再持久化。

**当前实现与契约：** [`PlaywrightTraceParser`](../app/shadow/trace_parser.py) 实现 [`ITraceParser`](../app/shadow/interfaces.py)，读取 `trace.zip` 的 `resource-snapshot`／HAR 条目，并直接返回网络快照列表。[`HarTraceParser`](../app/shadow/har_parser.py) 对独立 HAR 1.x 导出实现同一接口。下游存储与回放无需关心采集格式。该层类似修复链路的日志解析器，避免把庞大、嘈杂的原始输入直接传下去。

<a id="3-snapshot-store"></a>

### 3. 快照存储

**作用：** 确定性地保存并加载快照，将录制时间与回放时间解耦，使一次录制可复用于多次验证。

**输入：** `ShadowSnapshot` 或通过验证的字典，以及 `snapshot_id`。

**输出：** 保存时生成工作区 `snapshots/` 下的 JSON；读取时返回校验后的 `ShadowSnapshot`。

**当前实现：** [`SnapshotStore`](../app/shadow/snapshot_store.py)，原追踪项 #48。主要性质包括：

- **稳定序列化：** 使用 `json.dumps(..., sort_keys=True, indent=2)`，方便差异比较与缓存。
- **读写双向校验：** 字典写入前及文件读取后均按 `ShadowSnapshot` 校验。无效或损坏数据使用 `SnapshotStoreError` 系列异常，包括 `SnapshotNotFoundError`、`SnapshotCorruptionError`。
- **防止路径穿越：** 当前实现对完整 `snapshot_id` 计算 SHA-256 作为文件名，并检查保存键与对象内 ID 一致。原设计中只取 `Path(snapshot_id).name` 的描述已不适用于当前代码。

<a id="4-mock-injector"></a>

### 4. 模拟响应注入器

**作用：** 把记录响应提供给浏览器。在 Playwright `Page`／`BrowserContext` 上拦截请求，与快照匹配，并返回录制响应，使被测应用可以在不访问对应真实后端的情况下运行。

**输入：** 页面／上下文及 `NetworkSnapshot` 集合，或已构建的 `SnapshotMatcher`。

**输出：** 运行时满足／中止的请求，以及 `unmatched_requests` 等观测信息。

**当前实现：** [`MockInjector`](../app/shadow/injector.py) 与 [`SnapshotMatcher`](../app/shadow/matcher.py)，原追踪项 #43。

- **同步和异步 API：** 根据 Playwright 路由方法支持相应注册方式。
- **加权匹配：** 当前不再只是“方法＋完整 URL，再退回方法＋路径”的两层规则；还使用同源检查、查询／头／请求体规范化、置信度门槛和稳定排序。
- **重复响应：** 等价重复请求按已录制序列消耗响应，队列耗尽后不无限重用旧响应。
- **未命中策略：** 默认严格中止并记录 `network_mock_no_match`；也支持显式放行真实网络或录制并增补。离线策略不允许后两者。
- **二进制响应：** 当 `CapturedResponse.is_base64` 为真时，解码后再返回浏览器。

<a id="5-shadow-runtime"></a>

### 5. 影子运行时

**作用：** 承载一次回放，管理临时工作区、缓存、持久快照，并把存储、注入器与 Playwright 执行连接起来。

**输入：** 快照 ID／快照集合及测试路径。

**输出：** 为测试准备好的回放环境、执行结果及清理后的产物。

**当前实现：** [`ShadowWorkspace`](../app/shadow/workspace.py) 校验相对且不重叠的产物目录；通过所有权标记认领新目录或空目录；拒绝危险根目录、未认领目录和路径逃逸；创建 `base_dir/{cache,snapshots,tmp}`。清理时重新验证所有权，按策略只删除 `cache/` 和 `tmp/`，保留根目录和持久快照。

[`ShadowRuntime`](../app/shadow/runtime.py) 提供生命周期管理，`run_shadow(test_path, snapshot_id)` 负责装配回放，并由修复图的 `shadow_verifier` 节点调用。[`replay_bridge.py`](../app/shadow/replay_bridge.py) 生成临时 Node fixture，通过认证的本地回环控制接口把浏览器请求交给 Python 匹配。没有对应快照时，修复图会跳过影子验证。

<a id="6-playwright-execution-output"></a>

### 6. Playwright 执行：输出

**作用：** 实际运行测试。测试仍由 Playwright 驱动，但受拦截的网络请求使用模拟响应；严格模式下未命中就中止。

**输入：** 测试文件与已连接的影子运行环境。

**输出：** 通过／失败结果，以及未匹配请求、日志等产物。

沿用子进程运行测试的方式：执行 `npx playwright test <path>`，捕获日志，并限制执行超时。影子测试改变网络返回内容，不改变测试目的。网络回放不等于对任意测试代码的全面隔离，仍应按当前拦截范围和策略评估外部访问与副作用。

<a id="component--code-map"></a>

## 组件与代码对应关系

| 阶段 | `interfaces.py` 中的接口 | 具体组件 | 状态 |
| --- | --- | --- | --- |
| 轨迹解析 | `ITraceParser` | `PlaywrightTraceParser`（`trace_parser.py`）与 `HarTraceParser`（`har_parser.py`） | ✅ 已实现 |
| 快照存储 | `ISnapshotStore` | `SnapshotStore`（`snapshot_store.py`） | ✅ 已实现，#48 |
| 模拟注入 | `IMockInjector` | `MockInjector` 与 `SnapshotMatcher` | ✅ 已实现，#43 |
| 影子运行时 | `IShadowRuntime`／`IShadowWorkspace` | `ShadowRuntime`（`runtime.py`）与 `ShadowWorkspace`（`workspace.py`） | ✅ 已实现 |
| 修复图验证节点 | — | `shadow_verifier`（`app/nodes/shadow_verifier.py`） | ✅ 已接入，有快照才回放 |
| 数据交换模型 | — | `ShadowSnapshot`、`NetworkSnapshot`、`CapturedRequest`、`CapturedResponse` | ✅ 已实现 |

依赖 `I*` 接口而非具体类，可以替换各阶段实现。

<a id="data-flow-contract"></a>

## 数据流契约

阶段间交换经过校验的模型对象：

```text
轨迹文件 ─解析→ list[NetworkSnapshot]
                    └─ request: CapturedRequest { method, url, headers, body }
                    └─ response: CapturedResponse { status, headers, body, is_base64 }

调用方包装 → ShadowSnapshot { snapshot_id, metadata, network_snapshots[] }
ShadowSnapshot ─保存／读取磁盘 JSON→ ShadowSnapshot
network_snapshots[] ─注入→ SnapshotMatcher
CapturedRequest ─匹配→ CapturedResponse ─返回→ route.fulfill(...)
```

**重复 HTTP 头。** `headers` 类型为 `dict[str, str]`，但 HTTP 允许同名头重复出现，因此解析器按 Playwright 的响应读取与 `route.fulfill(headers=...)` 约定合并：

- `Set-Cookie` 多值用换行连接；回放时 Playwright 可将各行恢复为独立头。
- 其他重复头用 `, ` 合并，与 RFC 9110 §5.3 的约定相符。
- 头名称按大小写无关方式分组，保留首次拼写；值维持原顺序，保留相同重复值，合并时忽略空值。

持久快照会对整个 `Set-Cookie` 值脱敏，因此不能靠保存的网络响应头重放原始 cookie 值；浏览器 cookies 状态是另一类快照。重复头合并仍影响实时采集，以及 `Link`、`Vary` 等字段。

边界采用 Pydantic 校验，结构错误会尽量在解析、存储或匹配时以明确异常暴露，避免以静默坏响应的形式进入 Playwright；这不表示 schema 能证明所有业务内容正确。

<a id="extension-points"></a>

## 扩展点

可在下列接口后继续扩展；部分原计划项已实现，应查看现有代码再认领工作：

- **更多轨迹格式：** 实现 `ITraceParser.parse`，在已支持的 Playwright trace.zip 和独立 HAR 之外增加格式，输出仍为 `list[NetworkSnapshot]`。
- **匹配策略：** 在已有加权、头／请求体约束、查询规范化和有序响应机制上扩展，不必重写注入器。
- **存储后端：** 默认使用文件系统 `SnapshotStore`；内存及内容寻址实现也已存在，远程／对象存储可继续在 `ISnapshotStore` 后替换。默认回放尚未自动选择内容寻址后端。
- **HTTP 之外的状态：** 已有 cookies、localStorage 和时钟模型。cookies／localStorage 已能转换为 Playwright storageState；时钟目前只有 schema，WebSocket 帧等仍可扩展。
- **运行时编排：** 修复图已有调用路径，可继续完善快照选择、录制与回放 CLI、错误处理及审查模式的集成体验。
- **未命中策略：** 已支持 strict、lenient、record-and-augment；可以在现有配置及反馈机制上扩展。

<a id="non-goals-for-this-document"></a>

## 本文不包含的范围

- 本文是参考说明，不通过文档本身引入新模块、函数或 schema；实现位于 `app/shadow/` 和 `app/nodes/`。
- 失败时自动生成完整影子快照的端到端体验、尚未接入的时钟等非 HTTP 回放不应仅凭组件存在就视为交付。核心已有的 ARIA 失败快照读取是诊断证据，与完整影子网络／浏览器状态采集不同。

<a id="references"></a>

## 参考资料

- 影子模块 [`app/shadow/`](../app/shadow/)：[`interfaces.py`](../app/shadow/interfaces.py)、[`schemas.py`](../app/shadow/schemas.py)、[`snapshot_store.py`](../app/shadow/snapshot_store.py)、[`injector.py`](../app/shadow/injector.py)、[`matcher.py`](../app/shadow/matcher.py)、[`workspace.py`](../app/shadow/workspace.py)。
- 核心设计：[`docs/design.md`](design.md)。
- Playwright 追踪与请求拦截：https://playwright.dev/。
