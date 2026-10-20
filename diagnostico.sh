#!/usr/bin/env bash
# Muestra qué pasó en las últimas ejecuciones del agente (errores y respuestas de herramientas).
# Uso:  sudo bash diagnostico.sh        últimas 8 ejecuciones
#       sudo bash diagnostico.sh 20     últimas 20
set -euo pipefail
cd "$(dirname "$0")"
[ "$(id -u)" -eq 0 ] || { echo "Ejecuta con sudo: sudo bash diagnostico.sh"; exit 1; }
set -a
# shellcheck disable=SC1091
. ./.env
set +a
N="${1:-8}"
[[ "$N" =~ ^[0-9]+$ ]] || { echo "El número de ejecuciones debe ser un entero."; exit 1; }
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d n8n -At -c "
  SELECT json_build_object('id', e.id, 'status', e.status, 'mode', e.mode,
                           'started', e.\"startedAt\", 'data', d.data)
  FROM execution_entity e JOIN execution_data d ON d.\"executionId\" = e.id
  ORDER BY e.id DESC LIMIT $N" | python3 lib/diagnostico.py
