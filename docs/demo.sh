# 由 docs/demo.tape 加载，以固定输出生成 docs/demo.gif；不访问网络或密钥。
# 定义同名模拟函数，重现 README 演示中已验证的修复输出。
# 保持各环境中的动图内容一致。重新生成命令：vhs docs/demo.tape

PS1='$ '

_c() { printf '%b\n' "$1"; }  # 输出文本并解释 \033 颜色转义

# 模拟 npx playwright test 的选择器失效输出。
npx() {
  _c ''
  _c '  \033[31m✘\033[0m  example.spec.ts:7 › submits the form'
  _c '     \033[31mTimeoutError\033[0m: page.click: Timeout 3000ms exceeded.'
  _c "       - waiting for locator('#submit-btn')"
  _c ''
}

# 模拟 e2e-healer CLI：诊断→生成补丁→验证→重跑。
e2e-healer() {
  sleep 0.4; _c '  \033[36mdiagnoser\033[0m         #submit-btn → id renamed (from git diff)'
  sleep 0.5; _c '  \033[36mpatch_generator\033[0m   instruction_count=1'
  sleep 0.4; _c "  \033[36mselector_verify\033[0m   '#submit' resolves to \033[32m1 element\033[0m in live DOM ✓"
  sleep 0.5; _c '  \033[36mtest_runner\033[0m       \033[32mpassed\033[0m   loop_count=0'
  _c ''
  _c '  \033[31m- await page.click("#submit-btn");\033[0m'
  _c '  \033[32m+ await page.click("#submit");\033[0m   \033[2m(assertion left untouched)\033[0m'
  _c ''
  _c '  \033[1;32m✔ fixed after 0 loop(s)\033[0m'
}
