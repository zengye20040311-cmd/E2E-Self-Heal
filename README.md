# E2E-Self-Heal

基于 Python 3.13、LangGraph 和 Playwright 的 E2E 测试自修复工具，用于处理 UI 变更引起的定位器失效和等待问题。

## 已实现功能

- **自动修复闭环**：解析失败日志，结合 Git diff、JSX/TSX 代码上下文和 ARIA 失败快照，完成诊断、补丁生成与测试重跑；支持单文件、目录及整个测试套件。
- **选择器验证**：配置应用 URL 后，在真实 DOM 中检查新选择器是否唯一匹配；验证失败则回滚候选补丁并重试，验证工具不可用时交由测试重跑判断。
- **修复安全约束**：通过补丁规则和 AST 结构检查，只允许修改定位器或等待条件，保护断言、测试意图及业务逻辑；支持路径沙箱、最多 3 次重试及失败恢复原文件。
- **拒绝与只读诊断**：对目标歧义、证据不足、疑似产品回归等情况输出拒绝原因；`review` 模式提供源码修复建议，不修改文件。
- **历史修复复用**：保存已验证的本地修复，优先匹配历史方案，并再次执行安全检查和测试；可用 `--no-memory` 关闭。
- **人工辅助与结果输出**：支持 `--selector-hint` 指定候选定位器、`--dry-run` 运行后恢复原文件，以及包含执行路径、候选补丁、验证结果和脱敏证据的 JSON 报告。
- **多模型后端**：支持 NVIDIA NIM、OpenAI、Anthropic、Ollama、DeepSeek 和 OrcaRouter，通过环境变量或 `.env` 配置。
- **CI 与评测**：提供 GitHub Action、修复 PR/评审工作流示例及可选 Slack 通知；支持接入检查、工作流生成、上下文 token 对比和安全场景评测（重复运行、并行执行、基线比较与门禁）。

## 快速使用

需要 Python 3.13+、uv，以及已安装浏览器的 Node.js Playwright 项目。

```powershell
uv sync
Copy-Item .env.example .env
# 编辑 .env，配置模型后端、模型名称及所需密钥

uv run e2e-healer init                          # 检查当前项目是否就绪
uv run e2e-healer tests/login.spec.ts           # 修复单个测试文件
uv run e2e-healer                              # 扫描并修复整个套件
uv run e2e-healer tests/login.spec.ts --dry-run # 预览修复，结束后恢复原文件
uv run e2e-healer review tests/login.spec.ts --log playwright.log --json
```

可通过 `--root` 指定 Playwright 项目根目录，通过 `--diff` / `--diff-base` 提供变更上下文，通过 `--app-url` 启用真实 DOM 验证。

## 配套模块

- [examples](examples/README.md)：可运行的 React + Vite 示例及定位器漂移、等待、歧义和产品回归场景。
- [Playwright Reporter](integrations/playwright-reporter/README.md)：原型集成，收集失败测试并调用 `review`，汇总诊断报告。
- [Web/API](product/README.md)：早期产品层，已有健康检查、版本接口及结果校验/存储逻辑；上传接口目前因鉴权尚未接入而默认拒绝请求。
- [配置示例](.env.example)、[沙箱说明](docs/sandbox.md)和 [CI 示例](ci/github-workflow.example.yml)。
