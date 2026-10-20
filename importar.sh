#!/usr/bin/env bash
# Carga en n8n las credenciales y el workflow con los datos de configuracion.json.
# Uso:  sudo bash importar.sh                        primera vez, o para actualizar credenciales
#       sudo bash importar.sh --actualizar-workflow  reemplaza el workflow (se pierden cambios hechos a mano)
#                                                    úsalo también si cambias ia.proveedor (gemini/openai)
set -euo pipefail

KIT="$(cd "$(dirname "$0")" && pwd)"
cd "$KIT"
WORKFLOW_ID="agenteCitasWa001"

paso() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
error() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || error "Ejecuta el script con sudo."
[ -f .env ] || error "No encuentro .env. Ejecuta primero instalar.sh."
if [ ! -f configuracion.json ]; then
  error "Falta configuracion.json. Créalo con: cp configuracion.plantilla.json configuracion.json y llénalo."
fi
chmod 600 configuracion.json
set -a
# shellcheck disable=SC1091
. ./.env
set +a

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

paso "1/3 Validando configuracion.json"
python3 lib/preparar.py configuracion.json workflow "$TMP"
chmod 644 "$TMP"/*.json

paso "2/3 Importando credenciales"
# Si Google Calendar ya estaba conectado, se conserva la sesión (si no, reimportar la borraría).
if docker compose exec -T -u node n8n n8n export:credentials --id=citasGoogleCal01 --decrypted \
     --output=/tmp/google-actual.json >/dev/null 2>&1 \
   && docker compose cp n8n:/tmp/google-actual.json "$TMP/google-actual.json" >/dev/null 2>&1; then
  python3 lib/conservar_google.py "$TMP/credenciales.json" "$TMP/google-actual.json"
fi
docker compose exec -T -u root n8n rm -f /tmp/google-actual.json
docker compose cp "$TMP/credenciales.json" n8n:/tmp/credenciales.json
docker compose exec -T -u node n8n n8n import:credentials --input=/tmp/credenciales.json
docker compose exec -T -u root n8n rm -f /tmp/credenciales.json

paso "3/3 Importando el workflow"
if docker compose exec -T -u node n8n n8n list:workflow 2>/dev/null | grep -q "^${WORKFLOW_ID}|" \
  && [ "${1:-}" != "--actualizar-workflow" ]; then
  echo "El workflow ya existe y no se reemplazó."
  echo "Para reemplazarlo con la configuración nueva: sudo bash importar.sh --actualizar-workflow"
else
  docker compose cp "$TMP/workflow.json" n8n:/tmp/workflow.json
  docker compose exec -T -u node n8n n8n import:workflow --input=/tmp/workflow.json
  docker compose exec -T -u root n8n rm -f /tmp/workflow.json
  echo "Workflow importado. Queda sin publicar hasta que pulses Publish en n8n."
fi

cat <<EOF

Siguientes pasos en ${EDITOR_URL:-https://${DOMINIO}}:
  1. Credentials > Google Calendar (citas) > Sign in with Google.
  2. Abre el workflow "Agente de citas WhatsApp + Google Calendar" y revisa el nodo Configuración.
  3. Pulsa Publish cuando la plantilla recordatorio_cita esté aprobada (bash meta.sh plantillas).
EOF
