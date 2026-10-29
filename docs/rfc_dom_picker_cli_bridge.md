<a id="rfc-chrome-extension--cli-bridge-for-pinpoint-healing"></a>

# RFC：用于定点修复的 Chrome 扩展与 CLI 桥接方案

> 状态：设计提案。当前 CLI 已支持 `--selector-hint`，但本文提出的浏览器扩展、本地桥接服务和 `bridge start/stop` 命令尚不能据此视为已交付能力。性能数字是目标值，不是实测保证。

<a id="1-summary"></a>

## 1. 概述

本 RFC 提议在 Chrome 扩展与 `e2e-healer` CLI 之间建立轻量、安全的桥接。开发者可以直接在本地页面上选中失效 UI 元素，生成稳定选择器，并通过 CLI 针对相应组件／测试进行有限范围的修复。核心引擎继续以 CLI 为中心，扩展只提供可视化入口。

<a id="2-motivation"></a>

## 2. 动机

目前 `e2e-healer` 以测试文件或测试套件为单位运行。即使开发者已明确知道某次局部 UI 重构破坏了哪个组件，仍需运行完整测试文件，或手动找到失败选择器。这带来三个问题：

- **浪费 token：** 诊断节点重新推导开发者已知的上下文。
- **耗时：** 实际只坏了一次交互，却要执行整个套件或测试文件。
- **反馈不连贯：** 开发者需要在看见问题的浏览器与执行修复的终端之间切换。

可视化选择器希望通过以下方式减少阻力：

- 在浏览器中直接指向失败元素。
- 生成稳定、优先考虑可访问性的选择器，优先使用 `data-testid`、ARIA 角色或文本，减少对脆弱 CSS／XPath 的依赖。
- 将 CLI 修复范围缩小到单个组件／测试，降低模型调用成本和耗时。
- 保持 CLI 核心及 CI 兼容性；扩展只是可选的开发者界面。

<a id="3-goals-and-non-goals"></a>

## 3. 目标与不包含的范围

<a id="31-goals"></a>

### 3.1 目标

- 将单个选择器故障的修复时间从分钟级缩短到秒级。
- 相比完整文件修复，平均 token 消耗至少降低 60%。
- CLI 保持唯一的修复逻辑来源，扩展不包含独立修复逻辑。
- 在共享机器上默认安全：仅监听回环地址、令牌认证、不保存请求级持久状态。

<a id="32-non-goals"></a>

### 3.2 不包含的范围

- 扩展不直接运行或编排 Playwright。
- 扩展不直接调用模型服务。
- 桥接仅用于本地开发，不面向远程或 CI。
- 第一版不支持多用户或跨机器桥接。

<a id="4-architecture-overview"></a>

## 4. 架构概览

```text
Chrome 扩展                   本地桥接服务                  e2e-healer CLI
元素选择与选择器预览  ←HTTP→  localhost:9821，Node.js  ←→   限定范围修复
                             通过标准输入传递目标信息

用户点击元素 → 生成选择器 → 预览稳定性
                         ↓
             令牌认证、仅回环地址的进程间通信
                         ↓
             CLI 读取选择器与测试路径并执行修复
```

<a id="41-key-principles"></a>

### 4.1 关键原则

- **CLI 优先：** 扩展只调用 CLI，不直接修改测试。
- **仅回环地址：** 桥接只监听 `127.0.0.1`，不接受外部网络连接。
- **令牌保护：** 每个请求携带 CLI 生成的会话级 Bearer 令牌，健康检查例外见后文。
- **限定范围：** CLI 接收单个测试文件和选择器提示，不扫描整个套件。
- **轻量无状态：** 桥接进程可随时重启；摘要和补丁等持久结果由 CLI 写盘，不保存在桥接进程中。

<a id="42-component-responsibilities"></a>

### 4.2 组件职责

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| Chrome 扩展 | 元素选择、候选选择器、交互界面、结果展示 | 测试执行、打补丁、模型调用 |
| 本地桥接 | 认证、请求校验、启动进程、转发结果 | 选择器生成逻辑、修复逻辑 |
| `e2e-healer` CLI | 诊断、生成及应用补丁、重跑、报告 | 浏览器界面、元素选择 |

<a id="5-methodology"></a>

## 5. 执行方法

本节描述一次浏览器点击如何变成经过验证的文件补丁，以及每个阶段的依据。

<a id="51-selector-candidate-generation-extension"></a>

### 5.1 生成候选选择器：扩展端

开发者启用选择器并点击元素后，扩展遍历当前 DOM 节点及祖先，按以下优先级生成候选：

1. `data-testid`／`data-test`／`data-cy` 属性，稳定性最高。
2. ARIA 角色加可访问名称，例如 `role=button[name="Submit"]`。
3. 可见文本：先精确匹配，再考虑规范化或部分匹配。
4. 结构型 CSS，例如 `nth-of-type` 或类名列表，仅作最后回退。

每个候选根据以下信息获得 **0.0～1.0 的启发式稳定性分数**：

- 属性是否易变，例如是否像自动生成的 `css-1a2b3c`。
- 在当前 DOM 快照中是否唯一。
- 若扩展在之前会话见过该组件，可参考历史变更频率。

默认只向桥接发送最高分候选；开发者可在提交前从界面覆盖选择。

<a id="52-request-validation-bridge"></a>

### 5.2 请求校验：桥接端

收到 `/heal` 后，必须先完成以下检查，再启动 CLI：

1. 用恒定时间比较校验当前会话 Bearer 令牌。
2. 检查 `Host` 为 `127.0.0.1` 或 `localhost`。
3. 检查 `test_path` 解析后是工作区内的真实文件，且不匹配 `DENY_GLOBS`。
4. 检查 `selector_hint.type` 属于允许枚举。
5. 首次发现错误立即返回相应 4xx，错误类别见第 6.2 节。

全部通过后才能创建 CLI 子进程。

<a id="53-scoped-heal-execution-cli"></a>

### 5.3 限定范围修复：CLI 端

提案将带提示的修复设计为区别于普通套件运行的模式：

1. **跳过失败文件扫描。** 已给出目标测试和选择器，不必重新发现目标。
2. **注入选择器提示。** 在 `dom_diff_context` 中增加最高优先级的合成条目，让诊断节点直接利用已知目标。
3. **限制迭代。** 提案希望提示型修复默认只用 1 次循环，并在必要时增加最后一次尝试；原草案将套件默认描述为 3～5 次。当前实现的 `max_loops` 实际限制为 1～3，且传入 hint 不会自动改为单次。
4. **单独重跑。** 应用补丁后只重跑指定测试文件，不执行整套测试，先验证局部修复。

<a id="54-verification-and-reporting"></a>

### 5.4 验证与报告

只有单独重跑通过，才报告 `"healed"`。按提案设计，首次失败后把新的失败证据补充到上下文，执行第二次也是最后一次尝试；仍失败则返回 `"failed"` 和最后已知差异。不得无限重试，也不得在没有明确开发者操作时擅自扩大为全套扫描。

<a id="55-why-this-reduces-cost"></a>

### 5.5 降低成本的原因

完整文件修复需要失败扫描、完整 DOM 变化上下文构造、多候选搜索和多轮迭代。提案希望提示型修复减少前两项开销，将第三项缩到单个候选，从而达到第 8 节约 70% token 和约 60% 时间节省目标。这些属于待基准验证的预期，不代表当前 `--selector-hint` 已跳过所有 diff 处理。

<a id="6-messaging-protocol"></a>

## 6. 通信协议

<a id="61-transport"></a>

### 6.1 传输

- **协议：** TCP 上的 HTTP/1.1。
- **监听：** `127.0.0.1:9821`，仅回环，可通过拟议配置 `E2E_HEALER_BRIDGE_PORT` 修改。
- **认证：** `Authorization` 中的 Bearer 令牌。拟由 `e2e-healer bridge start` 生成，显示到 stdout 并写入 `~/.e2e-healer/bridge-token`。
- **内容类型：** `application/json`。

<a id="62-endpoints"></a>

### 6.2 接口

<a id="post-heal"></a>

#### `POST /heal`

为单个组件启动限定范围修复。

**请求体：**

```json
{
  "test_path": "tests/login.spec.ts",
  "selector_hint": {
    "type": "role",
    "value": "button[name=\"Submit\"]",
    "original": "#old-submit-btn",
    "confidence": 0.95
  },
  "app_url": "http://localhost:4173",
  "dry_run": false
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `test_path` | string | ✅ | 包含失败选择器的测试文件相对路径 |
| `selector_hint` | object | ✅ | 扩展生成的稳定选择器 |
| `selector_hint.type` | string | ✅ | `role`、`testid`、`text`、`css` 之一 |
| `selector_hint.value` | string | ✅ | 新生成的选择器值 |
| `selector_hint.original` | string | ✅ | 原失效选择器，用于差异上下文 |
| `selector_hint.confidence` | float | ❌ | 生成器给出的 0.0～1.0 稳定性分数 |
| `app_url` | string | ❌ | 覆盖 `E2E_HEALER_APP_URL` |
| `dry_run` | boolean | ❌ | 预览结果，不保留最终文件修改；当前 CLI 可能临时写入候选并验证 |

**成功响应：200 OK。**

```json
{
  "status": "healed",
  "loop_count": 1,
  "patch_applied": true,
  "new_selector": "role=button[name=\"Submit\"]",
  "summary_path": "/tmp/e2e-healer-summary-abc123.json"
}
```

**修复失败响应：200 OK。**

```json
{
  "status": "failed",
  "loop_count": 2,
  "patch_applied": false,
  "last_diagnosis": "No matching element found for candidate selector after DOM re-scan.",
  "summary_path": "/tmp/e2e-healer-summary-def456.json"
}
```

**错误响应：**

| 状态码 | 含义 |
| --- | --- |
| 401 | Bearer 令牌无效或过期 |
| 400 | 请求格式错误或缺少字段 |
| 404 | 找不到测试文件 |
| 422 | 选择器提示无效、无法解析，或路径不符合策略 |
| 500 | CLI 内部错误 |

<a id="get-health"></a>

#### `GET /health`

检查服务存活。桥接运行时返回 `200 {"status": "ok"}`。未认证调用者也能获得同样的最少信息；存活检查不要求令牌，其他接口均要求。

<a id="post-stop"></a>

#### `POST /stop`

优雅关闭桥接服务，需要有效 Bearer 令牌。已开始的 `/heal` 请求可以完成；开始关闭后，新请求返回 `503`。

<a id="63-cli-invocation"></a>

### 6.3 CLI 调用

扩展不直接调用 CLI，而是请求桥接，再由桥接启动：

```bash
e2e-healer heal <test_path> \
  --selector-hint '<json>' \
  --app-url <app_url> \
  [--dry-run] \
  --json
```

`--selector-hint` 已在 Issue #119 实现，接收 JSON 选择器提示并将其注入 `dom_diff_context` 作为高优先级诊断上下文，减少重新推导目标的工作。

<a id="7-security-model"></a>

## 7. 安全模型

<a id="71-loopback-binding"></a>

### 7.1 仅监听回环地址

服务只绑定 `127.0.0.1`，拒绝 `Host` 不是 `127.0.0.1` 或 `localhost` 的请求。提案将其作为 DNS 重绑定防护的一部分。

<a id="72-per-session-bearer-token"></a>

### 7.2 每次会话独立的 Bearer 令牌

- 拟在执行 `e2e-healer bridge start` 时生成 32 字节密码学随机令牌，采用十六进制表示。
- 写入 `~/.e2e-healer/bridge-token`，权限设为 `0600`。
- 每次重启桥接都轮换。
- 不写入运行日志，不放入接口响应。
- 用恒定时间比较减少计时侧信道。

启动时如何向开发者提供令牌见第 6.1 节；这里的“不写日志”指运行日志，不包含该拟议的一次性显示。

<a id="73-path-validation"></a>

### 7.3 路径校验

传给 CLI 前，用沙箱 `WRITE_GLOBS` 和 `DENY_GLOBS` 校验所有 `test_path`。路径在工作区外，或经过符号链接解析后逃逸时，返回 `422`。

<a id="74-no-persistent-state"></a>

### 7.4 不保存请求级持久状态

每次 `/heal` 独立。桥接不持久保存请求中的选择器和日志；认证令牌只在当前会话中有效，按上述规则管理。

<a id="75-threat-model-summary"></a>

### 7.5 威胁模型摘要

| 威胁 | 缓解措施 |
| --- | --- |
| 恶意网站通过桥接读写本地文件 | 回环绑定、Host 检查和 Bearer 令牌 |
| 日志泄露令牌 | 不记录令牌，不放入响应体 |
| 路径穿越工作区 | 写入／禁止 glob 检查，检查前解析符号链接 |
| 本地其他进程猜测令牌 | 32 字节随机值、`0600` 权限、每会话轮换 |
| 重启后重用旧令牌 | 每次 bridge start 轮换，立即使旧令牌失效 |

<a id="8-performance-expectations"></a>

## 8. 性能预期

预计选择器提示可比完整文件修复节省约 70% token 和约 60% 修复时间，主要来自减少扫描和迭代。第 10.2 节需要用基准验证这些目标；实际收益取决于组件复杂度和 DOM 大小。

<a id="9-extension-responsibilities"></a>

## 9. 扩展职责

Chrome 扩展负责：

- 可视化元素选择覆盖层。
- 按本提案优先级生成稳定选择器：`data-testid` → ARIA 角色 → 可见文本 → CSS。
- 发送前显示稳定性分数。
- 就地展示成功、失败和代码差异。
- 管理桥接连接状态及令牌更新。

扩展不负责修改测试文件、运行 Playwright、调用模型或保存 API 密钥。

<a id="10-rollout-plan"></a>

## 10. 交付计划

<a id="101-phasing"></a>

### 10.1 分阶段交付

1. **阶段 1：桥接与 CLI 参数。** 在功能开关后交付 `bridge start/stop` 与提示参数；扩展开发前先用 curl／Postman 验证。
2. **阶段 2：最小可用扩展。** 元素覆盖层、单候选生成、`/heal` 调用和结果展示。
3. **阶段 3：加固。** 置信度评分、界面多候选回退、`/stop` 生命周期及错误状态体验。
4. **阶段 4：正式发布。** 移除功能开关，更新根 README，发布 Chrome Web Store。

<a id="102-validation"></a>

### 10.2 验证

- 用固定的代表性失败 fixture 比较提示型与完整文件修复，验证第 8 节 token／时间目标。
- 阶段 2 对外测试前，人工审查第 7 节威胁模型。

<a id="11-open-questions"></a>

## 11. 待讨论问题

1. 是否通过 WebSocket 向扩展流式回传进度？
2. 扩展是否还应支持 `review` 模式？
3. 如何处理 monorepo 等多根工作区？
4. 发现 Playwright 项目时自动启动桥接，还是要求显式运行 `e2e-healer bridge start`？

<a id="12-future-work"></a>

## 12. 后续工作

- 使用同一桥接协议开发 VS Code 扩展。
- 跟踪多次修复之间的选择器历史。
- 接入 PR 审查机器人，在测试失败前提供定位器建议。
- 接入影子测试，提前验证候选选择器。
