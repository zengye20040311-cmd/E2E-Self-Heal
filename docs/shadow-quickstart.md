# 影子测试快速入门：已停止提供

本地 `main` 已移除影子测试与网络快照回放功能，包括 `--shadow` 入口、网络录制解析、快照存储、请求匹配和回放运行时。

删减前的完整实现与中文文档保存在本地分支 `backup/before-shadow-removal`。可通过 `git show backup/before-shadow-removal:<文件路径>` 查看旧文件；该分支尚未推送远程。

当前核心验证流程为：

```text
错误日志＋DOM／ARIA 信息＋Git 差异
                ↓
LangGraph 诊断 → 生成补丁 → AST 修改范围检查
                ↓
真实 DOM 定位器唯一性检查 → 重新执行 Playwright 测试
                ↓
通过则保留补丁；否则有限重试或拒绝并恢复文件
```

失败时的 ARIA 页面信息、业务断言、重试／超时限制、pytest 与 GitHub Actions 回归均保留。共用脱敏模块已迁至 `app/redaction.py`。

旧 JSON 报告中的 `shadow_score`、历史阶段名及拒绝标记仅为读取兼容而保留；当前运行不会执行回放，也不会发出新的影子验证阶段。

原文锚点保留如下，供已有链接继续定位：

<a id="shadow-testing--quickstart"></a>
<a id="1-capture-a-trace"></a>
<a id="2-parse-the-trace-and-store-the-snapshot"></a>
<a id="offline-replay-policy"></a>
<a id="3-replay-the-test-with-e2e-healer---shadow"></a>
<a id="4-read-the-result"></a>
<a id="see-also"></a>
