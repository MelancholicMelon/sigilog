#!/usr/bin/env bash
# SigiLog dev launcher — starts relay + UI in tmux, opens a scenario shell.
# Usage: ./launch.sh

REPO="$(cd "$(dirname "$0")" && pwd)"
SESSION="sigilog"

# Kill stale session and any leftover processes on the ports
tmux kill-session -t "$SESSION" 2>/dev/null
pkill -f "relay/server.js" 2>/dev/null
lsof -ti :8080 | xargs kill -9 2>/dev/null
lsof -ti :3000 | xargs kill -9 2>/dev/null
sleep 1

# New detached session — pane 0
tmux new-session -d -s "$SESSION" -x 220 -y 60

# Pane 0 (top): relay server
tmux send-keys -t "$SESSION:0.0" "cd '$REPO/ui/infra' && node relay/server.js" Enter

# Pane 1 (middle): UI dev server
tmux split-window -v -t "$SESSION:0.0"
tmux send-keys -t "$SESSION:0.1" "cd '$REPO/ui' && npm run dev" Enter

# Pane 2 (bottom): scenario shell — run agents manually here
tmux split-window -v -t "$SESSION:0.1"
tmux send-keys -t "$SESSION:0.2" "cd '$REPO'" Enter
tmux send-keys -t "$SESSION:0.2" "echo '  Ready. To run scenario: python protocol/agents/runner.py start'" Enter
tmux send-keys -t "$SESSION:0.2" "echo '  Or use the UI button at http://localhost:3000/?feed=real'" Enter

# Even out pane heights
tmux select-layout -t "$SESSION" even-vertical

# Focus relay pane
tmux select-pane -t "$SESSION:0.0"

# Attach
tmux attach-session -t "$SESSION"
