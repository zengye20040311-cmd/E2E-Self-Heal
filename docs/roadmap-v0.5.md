<a id="e2e-self-heal--v05-roadmap-v05-preview"></a>

# E2E-Self-Heal：v0.5 路线图（`v0.5-preview`）

> **✅ 历史计划，已归档。** 本文最初用于推动影子测试。运行时及修复图中的 `shadow_verifier` 已交付；原归档说明将这些工作与 `--shadow` 入口统一记为自 `0.4.0` 起实现。需要区分：当前不带参数的 `--shadow` 仍只执行占位生命周期，完整回放依赖底层调用或修复图节点。
>
> **后续路线图的统一依据是 [`../roadmap.en.md`](../roadmap.en.md)。** 影子测试扩展工作通过 `I*` 接口和 `shadow-extensions` 里程碑跟踪。
>
> 以下为原规划内容的中文译文，保留当时的工作划分与状态，不代表所有条目仍待开发。
>
> 本文规划 `v0.5-preview` 里程碑，主题是**交付影子测试**，也是首次面向外部贡献者开放的版本。高风险核心由维护者负责，外围工作开放认领。术语可能随实现调整，职责划分保持稳定。

<a id="where-we-are-through-v04"></a>

## 当前基础：截至 v0.4

核心自动修复循环已交付：`Diagnoser → Patch Generator → Selector Verifier → Test Runner`，由条件路由控制，直到测试通过或预算耗尽；另有只读 `review` 模式。完整设计见 [`design.md`](design.md)，版本历史见 [`CHANGELOG.md`](../CHANGELOG.md)。

大部分**影子测试**组件也已在 v0.4 阶段加入。影子测试用采集的网络快照重放测试，减少对真实后端的依赖，目标是提供快速、可重复、尽量避免外部副作用的补丁验证。完整管线见 [`shadow-testing.md`](shadow-testing.md)。下表保留原规划记录：

| 组件 | 模块 | 当时记录的状态 |
| --- | --- | --- |
| 轨迹解析器 | `app/shadow/trace_parser.py` | 已实现 |
| 快照存储 | `app/shadow/snapshot_store.py` | 已实现 |
| 模拟响应注入器 | `app/shadow/injector.py` | 已实现，当时还需完善异步路由 |
| 快照匹配器 | `app/shadow/matcher.py` | 已实现 |
| 匹配评分器 | `app/shadow/scoring.py` | 已实现 |
| 请求规范化器 | `app/shadow/normalizer.py` | 已实现 |
| 工作区 | `app/shadow/workspace.py` | 已实现 |
| **运行时编排** | `app/shadow/runtime.py` | **已实现**：组合工作区、存储、注入器及 Playwright 执行 |

这些组件已接入可运行回放和修复图：`app/nodes/shadow_verifier.py` 在真实测试执行前，用已有快照验证候选补丁。当前异步注入及若干扩展也已实现，详见现有代码；不要把归档表格当作新的待办清单。

<a id="v05-theme--ship-shadow-testing"></a>

## v0.5 主题：交付影子测试

把现有组件组合成确定性的回放能力，并在较慢、易受环境影响的真实测试之前验证候选补丁。选择器验证器已能检查真实 DOM；影子测试在完整执行前增加网络响应更稳定的关卡。原计划的目标结构如下：

```text
已有组件                    运行时编排                     修复图
轨迹解析器 ─┐                                         补丁生成
快照存储   ─┤                  影子运行时                   ↓
模拟注入器 ─┼──────────→ 组合组件并对快照执行测试 ───→ 影子验证
匹配／评分 ─┤                                             ↓ 通过
规范化器   ─┤                                         选择器验证
工作区     ─┘                                             ↓
                                                      真实测试执行
```

<a id="maintainer-owned-core-not-up-for-grabs"></a>

## 维护者负责的核心

这些部分风险较高、耦合紧密，由维护者主导。列出它们是为避免与进行中的工作冲突；贡献者应先协调，再提交针对这些核心的 PR。

| 工作项 | 位置 | 难度 |
| --- | --- | --- |
| 运行时编排：组合工作区、存储、注入器和 Playwright，构成真实 `run_shadow()` | `app/shadow/runtime.py` | 高 |
| 修复图集成：在真实测试前通过影子验证步骤检查补丁 | `app/graph.py`、`app/nodes/` | 高 |
| `--shadow` 的 CLI 与配置：录制／回放选择和快照选择 | `app/cli.py`、`app/config.py` | 中 |

<a id="contributor-track--shadow-extension-points-help-wanted"></a>

## 贡献者方向：影子测试扩展点

这些工作基于已有 `I*` 接口，见 [`app/shadow/interfaces.py`](../app/shadow/interfaces.py)。原计划希望每项足够独立，首次贡献可以在约一小时的集中开发中完成，无需修改编排核心；对应 [`shadow-testing.md`](shadow-testing.md) 的扩展点。

| 想法 | 对应接口 | 难度 | 标签 |
| --- | --- | --- | --- |
| 额外输入格式：HAR 解析器 | `ITraceParser` | 中 | `help wanted` |
| 更丰富的匹配：头／请求体、查询规范化、模糊／有序匹配 | `SnapshotMatcher` | 中 | `help wanted` |
| 测试用内存存储、内容寻址存储 | `ISnapshotStore` | 低至中 | `help wanted` |
| 未命中策略：严格、放行真实请求、录制并增补 | `IMockInjector` | 中 | `help wanted` |
| 完善并测试注入器异步路由 | `IMockInjector` | 中 | `good first issue` |
| HTTP 之外的快照：localStorage、cookies、时钟等 `*Snapshot` | `app/shadow/schemas.py` | 高，拓展目标 | `help wanted` |

各阶段边界都由 Pydantic 模型验证，新实现只要遵守数据契约，就能减少对其他阶段的影响。以上多项已存在实现，例如 HAR、内存／内容寻址存储、未命中策略、cookies 和 localStorage；时钟回放等仍应以当前代码为准。

<a id="community--dx-track-good-first-issue"></a>

## 社区与开发体验方向

| 想法 | 位置 | 难度 |
| --- | --- | --- |
| 真正可运行的 React＋Vite 演示环境（[#3](https://github.com/Lee-Dongwook/E2E-Self-Heal/issues/3)） | `examples/` | 中 |
| 在回放入口完善后编写“录制轨迹→回放”快速入门 | `docs/` | 低 |
| 更新 [`shadow-testing.md`](shadow-testing.md) 的状态，轨迹解析器已实现，不再是未来计划 | `docs/shadow-testing.md` | 低 |

原规划时，韩文、日文、简体中文 README 已齐备，因此 v0.5 未再征集这些语言的翻译。

<a id="deferred-to-post-v05"></a>

## 延后到 v0.5 之后

为聚焦主题，原计划把以下内容留到后续：

- **失败时页面快照采集**与交互／导航后的选择器验证。选择器验证器只打开入口页检查；当前已另外实现 ARIA 失败快照读取，但它不等于自动重演导航后的选择器验证。
- ~~**多模型提供商适配**~~：已在 **`0.4.0` 交付**，通过 `E2E_HEALER_LLM_PROVIDER` 选择 OpenAI／Anthropic／Ollama／NVIDIA NIM，不再延后。

<a id="guardrails-unchanged"></a>

## 保持不变的修改边界

补丁生成器仍只修复失败选择器和等待条件，不修改断言或测试逻辑。提示词、输出契约及代码校验共同约束这一点。影子测试改变网络返回内容，不改变测试目的，也不扩大补丁可触及的范围。所有贡献都应保持这条约束。

<a id="how-to-contribute"></a>

## 如何贡献

先阅读 [`CONTRIBUTING.md`](../CONTRIBUTING.md)，在 Issue 下留言认领，避免重复工作。原计划用 [`good first issue`](https://github.com/Lee-Dongwook/E2E-Self-Heal/labels/good%20first%20issue) 和 [`help wanted`](https://github.com/Lee-Dongwook/E2E-Self-Heal/labels/help%20wanted) 标签，并在 **`v0.5-preview`** 里程碑内按低／低至中／中／高难度组织。每项工作应独立于维护者核心；实际认领前应查看当前 Issue 状态。
