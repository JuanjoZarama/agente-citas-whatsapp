#!/usr/bin/env bash
# Respalda las bases de datos (n8n y citas), los datos de n8n y el .env.
# Guarda 14 días. instalar.sh lo programa todos los días a las 3:00 a. m.
# Uso manual: sudo bash respaldo.sh
set -euo pipefail

KIT="$(cd "$(dirname "$0")" && pwd)"
cd "$KIT"
set -a
# shellcheck disable=SC1091
. ./.env
set +a

DESTINO="${DESTINO_RESPALDOS:-/var/backups/agente-citas}"
FECHA="$(date +%Y-%m-%d_%H%M)"
mkdir -p "$DESTINO"
chmod 700 "$DESTINO"

docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc n8n > "$DESTINO/n8n_$FECHA.dump"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc citas > "$DESTINO/citas_$FECHA.dump"
docker run --rm -v agente-citas_n8n_data:/datos:ro -v "$DESTINO":/respaldo alpine \
  tar czf "/respaldo/n8n_data_$FECHA.tar.gz" -C /datos .
cp .env "$DESTINO/env_$FECHA"
chmod 600 "$DESTINO"/*

find "$DESTINO" -type f -mtime +14 -delete
echo "$(date '+%F %T') Respaldo listo en $DESTINO"
