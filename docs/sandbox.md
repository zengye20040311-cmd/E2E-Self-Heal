<a id="sandbox-and-permission-model"></a>

# 沙箱与权限模型

状态：初始策略已在 `app/sandbox.py` 实现。

本项目会自动修改 Playwright 测试文件，因此默认原则是：只读取诊断所需上下文，只写入选定的修复目标，只执行明确的测试或验证命令。

<a id="goals"></a>

## 目标

- 让本地与 CI 执行可预测。
- 防止意外修改源码、配置、密钥、CI 工作流和发布文件。
- 让每个写入位置都能追溯到失败测试或生成的运行时产物。
- 保持统一入口：本地和 CI 都调用 `e2e-healer`。

<a id="default-access-policy"></a>

## 默认访问策略

| 操作 | 默认允许 | 拒绝或需显式开启 |
| --- | --- | --- |
| 读取 | 目标测试、`--log`、`--diff`、`git diff`、`test-results/`、diff 中涉及的源文件 | `.env`、密钥文件、私有凭据、无关的用户主目录文件 |
| 写入 | 正在修复的失败测试、预览模式恢复写入、临时选择器验证辅助文件 | `.env`、`.git/`、`.github/`、`pyproject.toml`、锁文件、CI／Action 文件和目标测试以外的源码 |
| 执行 | `git diff`、`E2E_HEALER_PLAYWRIGHT_CMD`、`E2E_HEALER_NODE_CMD` | 任意 shell 命令，以及依赖 shell 展开或命令串联的字符串 |

<a id="path-rules"></a>

## 路径规则

访问检查之前应先解析路径。

- 默认工作区根目录为当前工作目录。
- 严格模式下，读写路径经 `Path.resolve()` 后必须仍在工作区内；本地默认的 relaxed 模式允许显式目标位于根目录外，但仍执行写入 glob 和禁止规则。自动扫描发现的测试目标另有工作区约束。
- 应拒绝通过符号链接逃出工作区的路径。
- 写入目标必须是普通文件。即使解析后的目标符合沙箱策略，也拒绝符号链接文件和含符号链接的父目录。原文件权限在原子替换后保留；新文件默认采用私有 `0600` 权限，除非有其他明确规则。拒绝 FIFO、socket、目录和其他非普通文件。
- 不应修改 `.git/`、`.venv/`、`node_modules/` 和构建输出等目录。
- 修复循环只能写入 CLI 指定或从失败日志识别出的测试文件。

<a id="suggested-configuration"></a>

## 建议配置

以下环境变量由 `app.config.Settings` 实现：

```text
E2E_HEALER_SANDBOX_MODE=strict      # strict：严格；relaxed：宽松；off：关闭
E2E_HEALER_WORKSPACE_ROOT=.         # 默认相对于进程当前工作目录解析
E2E_HEALER_WRITE_GLOBS=*.spec.js,*.spec.jsx,*.spec.ts,*.spec.tsx,*.test.js,*.test.jsx,*.test.ts,*.test.tsx,**/*.spec.js,**/*.spec.jsx,**/*.spec.ts,**/*.spec.tsx,**/*.test.js,**/*.test.jsx,**/*.test.ts,**/*.test.tsx
E2E_HEALER_DENY_GLOBS=.env*,.git/**,.github/**,node_modules/**,.venv/**
E2E_HEALER_ALLOW_TEMP_HELPER=true   # 允许选择器检查生成临时 .mjs 辅助文件
```

建议模式：

- `strict`：GitHub Action 使用。检查工作区、写入 glob、禁止 glob 和命令参数。
- `relaxed`：本地开发默认值。检查写入 glob、禁止 glob 和命令参数，但不要求每个显式指定的测试 fixture 都位于工作区根目录内。
- `off`：调试用退出通道；设计上应给出警告。

<a id="implementation-notes"></a>

## 实现说明

`app/sandbox.py` 提供小型检查函数：

- `assert_read_allowed(path: Path) -> None`
- `assert_write_allowed(path: Path, reason: str) -> None`
- `assert_command_allowed(argv: list[str]) -> None`

这些检查在读取文本、原子写入、创建选择器辅助文件及启动子进程前执行。子进程应避免启用 shell；目前用 `shlex.split()` 拆分命令，使命令串联不被 shell 解释。

这里是应用层文件与命令策略，不是操作系统级容器隔离；它不会自动撤销用户测试对外部业务系统产生的副作用。

<a id="test-checklist"></a>

## 测试检查清单

- 严格模式下拒绝用 `../` 写出工作区。
- 拒绝解析到工作区外的符号链接。
- 拒绝写入 `.env`、`.github/`、`.git/` 和锁文件。
- 允许修复指定的 `*.spec.ts` 或 `*.test.tsx`。
- 允许预览模式恢复原目标文件。
- 保留已有权限，失败替换不应改变内容或权限。
- 拒绝工作区内及逃逸型符号链接写入目标，包括符号链接父目录。
- 拒绝目录、FIFO、socket 等已有非普通文件。
- 允许创建并清理选择器验证辅助文件。
- 确保全套修复模式不修改未被报告为失败的测试文件。
