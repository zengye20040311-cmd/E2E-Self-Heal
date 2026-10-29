<a id="ai-driven-e2e-test-self-healing-engine--design"></a>

# AI 驱动的 E2E 测试自动修复引擎：设计

> 本文为最初的设计草案。面向使用者的文档位于仓库根目录 `README.md`。
> 本文描述早期的简化流程；当前实现还包含历史修复复用、影子回放和拒绝判断等节点，详见 [实际工作流与逐文件分析](new_info/workflow-analysis.zh-CN.md)。

<a id="1-시스템-아키텍처-및-데이터-흐름"></a>

## 1. 系统架构与数据流

整个系统由四层组成：CLI 接口（用户启动）、AST 分析器（数据整理）、LangGraph 智能体（判断与循环）以及测试运行器（验证工具）。

<a id="2-세부-컴포넌트-설계"></a>

## 2. 组件详细设计

<a id="21-전처리-모듈-data-preprocessor"></a>

### 2.1. 数据预处理模块

将输入数据抽象化，以节省大模型上下文并降低幻觉风险。

- 错误日志解析器（Error Log Parser）：从完整 Playwright 日志中抽取 `Error:`、失败行号，以及堆栈顶部的核心失败原因，例如 `locator.click: Timeout 5000ms waiting for selector...`。
- JSX 差异语法树分析器（Diff-JSX AST Analyzer）：解析前端 `git diff` 中的 JSX／TSX 区域，将变更前后的 DOM 节点转换成轻量 JSON 对象。

```json
{
  "file": "components/SubmitButton.tsx",
  "previous": {
    "tag": "button",
    "attributes": { "id": "old-id", "className": "btn" }
  },
  "current": {
    "tag": "button",
    "attributes": { "id": "new-id", "className": "btn" }
  }
}
```

<a id="22-langgraph-상태-정의-state-definition"></a>

### 2.2. LangGraph 状态定义

智能体之间共享的状态应支持不可变更新与执行追踪，使用 Python `TypedDict` 定义。

```python
from typing import TypedDict, List, Dict

class AgentState(TypedDict):
    test_script_path: str         # 待修复测试文件的路径
    original_code: str            # 最初的测试脚本代码
    current_code: str             # 当前循环修改后的测试脚本代码
    error_log: str                # 最新的 Playwright 错误日志
    dom_diff_context: List[Dict]  # 经 AST 解析得到的 DOM 变化
    analysis_report: str          # 诊断节点生成的失败原因报告
    patch_instructions: Dict      # 补丁生成节点给出的行号与替换代码
    loop_count: int               # 防止无限循环的计数器，最多 3 次
    is_success: bool              # 测试是否通过
```

<a id="23-에이전트-노드-및-흐름-제어-nodes--conditional-edges"></a>

### 2.3. 智能体节点与条件路由

最初的 LangGraph 设计通过三个节点和一条条件边管理控制流。

<a id="node-1-diagnoser-분석-노드"></a>

#### 节点 1：问题诊断（Diagnoser）

- 输入：`error_log`、`dom_diff_context`、`current_code`。
- 逻辑：将日志中的选择器失败位置与实际 DOM 变化对应起来，推断失败原因。
- 输出：更新 `analysis_report`。

<a id="node-2-patch-generator-수정-노드"></a>

#### 节点 2：生成补丁（Patch Generator）

- 输入：`analysis_report`、`current_code`。
- 逻辑：使用 NVIDIA NIM 等兼容 OpenAI 的结构化输出能力，要求以严格 JSON 返回目标行和替换代码，避免任意重写文件。
- 输出：修改 `current_code` 并记录 `patch_instructions`。

<a id="node-3-test-runner-실행-노드"></a>

#### 节点 3：运行测试（Test Runner）

- 输入：`current_code`。
- 逻辑：将候选代码写入文件系统，通过子进程执行 `npx playwright test <path>`。
- 输出：成功时设置 `is_success = True`；失败时刷新 `error_log` 并执行 `loop_count += 1`。

<a id="conditional-edge-router-분기-로직"></a>

#### 条件边：流程路由（Router）

- `is_success == True` 或 `loop_count >= 3` 时转到结束节点。
- `is_success == False` 且 `loop_count < 3` 时重新进入诊断节点。

<a id="3-핵심-한계-및-제어-대책"></a>

## 3. 核心限制与控制措施

<a id="코드-왜곡-가드레일-code-integrity"></a>

### 代码完整性保护

为防止模型任意改变测试的业务逻辑或断言，补丁生成节点必须在提示词和输出契约中明确限制：只能修复失败的定位器（选择器）及优化等待条件。

<a id="비결정적-출력-통제"></a>

### 非确定性输出控制

Python 端通过 `try-except` 处理模型 API 延迟和异常。JSON 解析失败时，将问题反馈给补丁生成节点，配合内部重试机制处理。

<a id="4-로드맵-두-가지-모드-heal--review"></a>

## 4. 路线图：修复与审查两种模式

**动机。** 自动改测试虽然快，但可能被视为掩盖选择器失效根因的取巧办法。社区提出“一个 PR 审查机器人胜过许多自动修复工具”的反馈，因此在同一诊断引擎上增加第二种输出模式。

- **`heal` 模式（默认）：** 修复失效选择器或等待条件，重新执行测试，直到通过或耗尽预算。基础循环为 `Diagnoser → Patch Generator → Selector Verifier → Test Runner`。
- **`review` 模式：** 不修改测试。诊断失败原因并输出源码层面的建议，例如用稳定 `data-testid` 替代易变 `className`，或使用 `getByRole` 等可访问性定位器。CI 包装层可以把建议发布成 GitHub PR 行内评论。

**设计。** `review` 使用独立的轻量状态图 `Diagnoser → Reviewer → END`，图内没有补丁、验证、测试执行或循环。审查节点通过结构化输出返回 `ReviewFinding` 列表。每条建议都关联到变更源文件及行号，行号来自 diff 的 `@@` hunk 信息，供 CI 准确挂载评论。需要区分：该图不执行测试，但 CLI 在未提供 `--log` 时可以先运行测试收集失败。

**边界。** CLI 核心负责诊断和生成建议，CI 包装层只负责发布评论，不包含修复逻辑。CLI 输出机器可读的 `ReviewReport` JSON 及 `has_findings` 字段，工作流据此分支。示例见 [`ci/github-review-bot.example.yml`](../ci/github-review-bot.example.yml)。
