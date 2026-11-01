#!/usr/bin/env bash
# ==============================================================================
# Persian Streams - Local Server & Cloudflare Tunnel Runner
# ==============================================================================
# این اسکریپت سرور لوکال (server.js) را روی سیستم شما اجرا کرده و در صورت
# وجود cloudflared، یک تانل پابلیک کلودفلر (بدون محدودیت تعداد ریکوئست) ایجاد می‌کند.
# ==============================================================================

set -e

PORT=${PORT:-8000}
BASE_URL=${BASE_URL:-"https://film2med.top"}

echo "--------------------------------------------------------"
echo "🚀 Starting Persian Streams Local Server on port ${PORT}..."
echo "🌐 Media Provider BASE_URL: ${BASE_URL}"
echo "--------------------------------------------------------"

# 1. Start Node.js server in the background
PORT=$PORT BASE_URL=$BASE_URL node server.js &
SERVER_PID=$!

cleanup() {
  echo ""
  echo "🛑 Stopping local server (PID: ${SERVER_PID})..."
  kill -TERM "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  echo "✅ Stopped."
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Give the server a moment to start
sleep 2

if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "❌ Error: Failed to start server.js. Check the logs above."
  exit 1
fi

echo "✅ Server is running locally at: http://localhost:${PORT}/manifest.json"

# 2. Check for Cloudflare Tunnel (cloudflared)
if command -v cloudflared &> /dev/null; then
  echo ""
  echo "📡 Starting Cloudflare Quick Tunnel (Free & Unlimited Requests)..."
  echo "🔗 A public https://*.trycloudflare.com link will appear below:"
  echo "--------------------------------------------------------"
  cloudflared tunnel --protocol http2 --url "http://127.0.0.1:${PORT}"
else
  echo ""
  echo "⚠️ cloudflared is not installed on this system."
  echo "💡 To expose this server publicly with zero request limits:"
  echo "   1) Install cloudflared:"
  echo "      curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb"
  echo "      sudo dpkg -i cloudflared.deb"
  echo "   2) Run this script again: ./start-local.sh"
  echo ""
  echo "⏳ Keeping server alive on port ${PORT}. Press Ctrl+C to stop..."
  wait "$SERVER_PID"
fi
