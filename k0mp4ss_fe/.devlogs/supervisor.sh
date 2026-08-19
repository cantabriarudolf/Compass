#!/usr/bin/env bash
# Supervisor del dev server de Next.js.
# Reinicia el server automáticamente si muere (ej: OOM kill), manteniéndolo vivo.

APP_DIR="/home/rishidipons/Documents/Proyectos/Compass/k0mp4ss_fe/apps/web"
LOG="$APP_DIR/../.devlogs/dev.log"
SUPV_LOG="$APP_DIR/../.devlogs/supervisor.log"
HEALTH_URL="http://localhost:3000"
MAX_RESTARTS=50

restart_count=0
while [ "$restart_count" -lt "$MAX_RESTARTS" ]; do
  restart_count=$((restart_count + 1))
  echo "[$(date '+%F %T')] Iniciando dev server (intento $restart_count)..." >> "$SUPV_LOG"
  NODE_OPTIONS="--max-old-space-size=2048" npm run dev > "$LOG" 2>&1 &
  SERVER_PID=$!
  echo "[$(date '+%F %T')] PID del server: $SERVER_PID" >> "$SUPV_LOG"

  # Esperar a que responda (hasta 120s)
  ready=0
  for _ in $(seq 1 40); do
    code=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" --max-time 3)
    if [ "$code" = "200" ]; then
      ready=1
      echo "[$(date '+%F %T')] Server respondiendo HTTP 200." >> "$SUPV_LOG"
      break
    fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      echo "[$(date '+%F %T')] Server murió antes de estar listo (OOM?)." >> "$SUPV_LOG"
      break
    fi
    sleep 3
  done

  # Mantener vivo mientras el proceso exista
  while kill -0 "$SERVER_PID" 2>/dev/null; do
    sleep 5
  done

  echo "[$(date '+%F %T')] Server terminó (salida $?). Reiniciando..." >> "$SUPV_LOG"
  sleep 2
done

echo "[$(date '+%F %T')] Supervisor alcanzó el máximo de reinicios." >> "$SUPV_LOG"
