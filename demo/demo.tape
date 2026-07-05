# VHS tape for recording the agentburn demo GIF
# Install VHS: https://github.com/charmbracelet/vhs
# Run: vhs demo/demo.tape

Output demo/demo.gif
Output demo/demo.mp4

Set Shell "bash"
Set FontSize 16
Set Width 1000
Set Height 600
Set Theme "Dracula"
Set TypingSpeed 50ms
Set Padding 24

# Show the prompt
Type "# agentburn — token burn reporter for Claude Code"
Enter
Sleep 500ms

# Default report
Type "node dist/cli.js --dir test/fixtures"
Enter
Sleep 2s

# Scroll through output
Sleep 1s

# Sessions list
Type "node dist/cli.js sessions --dir test/fixtures"
Enter
Sleep 2s

# Doctor
Type "node dist/cli.js doctor --dir test/fixtures"
Enter
Sleep 2s

# JSON output
Type "node dist/cli.js --dir test/fixtures --json | head -20"
Enter
Sleep 2s

# Done
Type "echo 'Done! 100% local — no data leaves your machine.'"
Enter
Sleep 1s
