<a id="releasing"></a>

# 版本发布

本项目使用同一个标签向两个渠道发布：

- **PyPI：** `e2e-healer` CLI，对应 `ai-driven-e2e` 包；发布 GitHub Release 时，由 [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) 上传。
- **GitHub Marketplace：** 从同一个 Release 发布根目录的组合式 Action（[`action.yml`](../action.yml)）。

<a id="one-time-setup-console-tasks"></a>

## 一次性设置：网页控制台操作

以下操作需要分别在相应网页控制台中完成一次。

<a id="1-pypi-trusted-publishing-oidc--no-api-token"></a>

### 1. PyPI 可信发布：使用 OIDC，无需 API 令牌

`publish.yml` 使用[可信发布](https://docs.pypi.org/trusted-publishers/)，不保存 PyPI 令牌或密钥。在 PyPI 中配置：

1. 登录 [pypi.org](https://pypi.org/)，进入 **Your projects → Publishing**；对于全新包名，进入 **Account → Publishing → Add a pending publisher**。
2. 添加 **GitHub** 可信发布者，填写：
   - **Owner（所有者）：** `Lee-Dongwook`
   - **Repository（仓库）：** `E2E-Self-Heal`
   - **Workflow name（工作流名称）：** `publish.yml`
   - **Environment（环境）：** `pypi`
3. 确认包名 `ai-driven-e2e` 可用，或已属于你的账户。

<a id="2-github-pypi-environment"></a>

### 2. GitHub 的 `pypi` 环境

`publish.yml` 在 `environment: pypi` 下运行。前往 **Settings → Environments → New environment → `pypi`** 创建环境，并按需要配置审查人及保护规则。

<a id="2b-testpypi-rehearsal-recommended"></a>

### 2b. TestPyPI 发布演练（推荐）

[`publish-testpypi.yml`](../.github/workflows/publish-testpypi.yml) 支持手动发布到 [TestPyPI](https://test.pypi.org/)，让正式发布之前有一次演练。首次使用时：

- 在 [test.pypi.org](https://test.pypi.org/) 添加可信发布者：仓库 `Lee-Dongwook/E2E-Self-Heal`、工作流 `publish-testpypi.yml`、环境 `testpypi`。
- 在 GitHub 创建名为 `testpypi` 的环境。

然后从 **Actions → publish-testpypi → Run workflow** 运行，并验证安装：

```bash
pip install --index-url https://test.pypi.org/simple/ \
  --extra-index-url https://pypi.org/simple/ ai-driven-e2e
```

<a id="3-marketplace-action"></a>

### 3. Marketplace 的 Action 发布

- 仓库必须公开；根目录 `action.yml` 需要包含 `name`、`description`、`branding`，本项目已配置。
- Action 名称 `E2E Self-Heal` 必须在 Marketplace 中唯一。
- 首次发布前，接受 **GitHub Marketplace Developer Agreement**（开发者协议）。

<a id="per-release-checklist"></a>

## 每次发布的检查清单

1. 本地 `make check && make test` 通过，`main` 的 CI 也通过。可以先通过 **Actions → publish-testpypi** 演练。然后在[本地安全基准测试命令](../docs-site/docs/reference/safety-benchmark.mdx#run-it-locally)中增加 `--enforce-gates`。退出码 `1` 表示发布门禁失败，应停止发布。`insufficient_sample` 不阻止发布，表示该比例指标的不同场景样本数不足；报告 **Needs** 列、JSON 的 `scenarios_needed` 以及 stderr 最后一行会说明缺口。
2. 更新 `pyproject.toml` 中的 `version`，并同步更新 **两个**锁文件 `uv.lock` 和 `product/api/uv.lock` 中 `ai-driven-e2e` 的版本。API 将核心作为可编辑路径依赖，因此也记录其版本；不一致会导致 API CI 的 `uv sync --locked` 失败。如果本地 `uv` 会额外重写锁文件的 `revision`，只修改必要的版本行。随后将 [`CHANGELOG.md`](../CHANGELOG.md) 的 `## [Unreleased]` 章节改为新版本并填写当天日期。
3. 提交后创建并推送标签：`git tag -a vX.Y.Z -m "..."`，然后执行 `git push origin main --follow-tags`。
4. 更新可移动主版本标签，方便 Action 用户固定到 `@vX`：`git tag -f -a v0 -m "..." vX.Y.Z && git push origin v0 --force`。
5. 为 `vX.Y.Z` 创建 **GitHub Release**，勾选 **Publish to Marketplace** 后发布。发布 Release 会触发 `publish.yml` 上传 PyPI。
6. 验证 `pip install ai-driven-e2e==X.Y.Z` 安装成功，且 Marketplace 页面已上线。

<a id="version-policy"></a>

## 版本规则

采用语义化版本。`0.x` 为 alpha 阶段，次版本也可能包含不兼容变化，生产环境应固定精确版本。可移动标签 `v0` 为方便使用而跟随最新 `0.x`。
