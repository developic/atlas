#!/bin/sh
# Production entrypoint: VAD server + Next app side by side.
#
# The VAD server backgrounds; the Next server takes PID 1 via exec so the
# container stops when it stops. If the VAD process dies, the app keeps
# serving (voice input degrades to the browser VAD error path, not a crash).
# Publish both ports (`-p 8080:8080 -p 8081:8081`); the browser reaches the
# VAD server directly at NEXT_PUBLIC_VAD_URL (default wss://<host>:8081 —
# plain ws needs TLS here only when the page itself is HTTPS).
bun scripts/vad-server.mjs &
VAD_PID=$!
sleep 2
if ! kill -0 $VAD_PID 2>/dev/null; then
  echo "warning: vad-server exited during startup; continuing with the app only" >&2
fi
exec bun server.js
