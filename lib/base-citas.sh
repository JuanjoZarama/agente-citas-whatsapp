#!/usr/bin/env bash
# Crea la base 'citas' y la tabla de contactos si no existen.
# Lo usan instalar.sh e instalar-local.sh; requiere .env cargado y Postgres arriba.
set -euo pipefail

for _ in $(seq 1 60); do
  docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d n8n >/dev/null 2>&1 && break
  sleep 2
done
if ! docker compose exec -T postgres psql -U "$POSTGRES_USER" -d n8n -tAc \
  "SELECT 1 FROM pg_database WHERE datname = 'citas'" | grep -q 1; then
  docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d n8n -c "CREATE DATABASE citas"
fi
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d citas <<'SQL'
CREATE TABLE IF NOT EXISTS contactos (
  telefono       TEXT PRIMARY KEY,
  nombre         TEXT,
  ultimo_msg_id  TEXT,
  bot_pausado    BOOLEAN NOT NULL DEFAULT false,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL
echo "Base 'citas' y tabla 'contactos' listas."
