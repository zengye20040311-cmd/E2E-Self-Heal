# README 演示动图的 VHS 录制脚本。生成命令：vhs docs/demo.tape
# 输出 docs/demo.gif。使用 docs/demo.sh 的同名模拟函数，
# 无需密钥、服务或网络即可生成固定演示内容。

Output docs/demo.gif

Set Shell bash
Set FontSize 20
Set Width 1200
Set Height 720
Set Padding 26
Set Theme "Dracula"
Set TypingSpeed 55ms

# 加载固定演示函数，然后清屏隐藏准备过程。
Hide
Type "source docs/demo.sh"
Enter
Type "clear"
Enter
Show

Sleep 600ms
Type "npx playwright test"
Sleep 400ms
Enter
Sleep 1.8s

Type "e2e-healer example.spec.ts --app-url http://localhost:4173"
Sleep 400ms
Enter
Sleep 3.5s
Sleep 1s
