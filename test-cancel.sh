#!/bin/bash

# 長めのタスクでセッションを作成
echo "Creating new session..."
RESPONSE=$(curl -s -X POST http://localhost:3100/sessions/new \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Please read all JavaScript files in the src/ directory and give me a detailed summary of each file."}')

echo "Response: $RESPONSE"

# セッションIDを抽出
SESSION_ID=$(echo $RESPONSE | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
echo "Session ID: $SESSION_ID"

# 少し待つ
echo "Waiting 2 seconds..."
sleep 2

# セッションをキャンセル
echo "Cancelling session..."
curl -s -X POST "http://localhost:3100/sessions/$SESSION_ID/cancel" | jq .

echo "Done."
