#!/usr/bin/env bash
# Instala el agente de citas en un VPS Ubuntu (22.04 o 24.04) recién creado.
# Uso:  sudo bash instalar.sh n8n.tudominio.com tucorreo@ejemplo.com
# Se puede ejecutar varias veces: conserva .env y los datos existentes.
set -euo pipefail

DOMINIO="${1:-}"
CORREO="${2:-}"
ZONA="${ZONA_HORARIA:-America/Bogota}"
VERSION_N8N="${N8N_VERSION:-2.43.6}"
KIT="$(cd "$(dirname "$0")" && pwd)"
cd "$KIT"

paso() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33mAVISO: %s\033[0m\n' "$*"; }
error() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || error "Ejecuta el script con sudo: sudo bash instalar.sh $*"
if [ -z "$DOMINIO" ] || [ -z "$CORREO" ]; then
  error "Uso: sudo bash instalar.sh n8n.tudominio.com tucorreo@ejemplo.com"
fi

paso "1/8 Revisando que $DOMINIO apunte a este servidor"
IP_SERVIDOR="$(curl -fsS --max-time 10 https://api.ipify.org || true)"
IP_DOMINIO="$(getent ahostsv4 "$DOMINIO" | awk 'NR==1 {print $1}' || true)"
echo "IP del servidor: ${IP_SERVIDOR:-desconocida} | IP del dominio: ${IP_DOMINIO:-sin resolver}"
if [ -n "$IP_SERVIDOR" ] && [ "$IP_SERVIDOR" != "$IP_DOMINIO" ]; then
  aviso "El dominio todavía no apunta a este servidor. HTTPS no funcionará hasta que el registro A propague."
  read -r -p "¿Continuar de todos modos? [s/N] " RESP
  [[ "$RESP" =~ ^[sS]$ ]] || exit 1
fi

paso "2/8 Instalando Docker (si falta)"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || error "Docker Compose no quedó instalado."

paso "3/8 Memoria de intercambio (swap) de 2 GB, si el servidor no tiene"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap activado."
else
  echo "El servidor ya tiene swap."
fi

paso "4/8 Firewall: solo SSH, HTTP y HTTPS"
if command -v ufw >/dev/null 2>&1; then
  PUERTO_SSH="$(echo "${SSH_CONNECTION:-}" | awk '{print $4}')"
  ufw allow OpenSSH >/dev/null
  if [ -n "$PUERTO_SSH" ]; then ufw allow "${PUERTO_SSH}/tcp" >/dev/null; fi
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
  echo "Firewall activo."
else
  aviso "No hay ufw; revisa que los puertos 80 y 443 estén abiertos en el panel del proveedor."
fi

paso "5/8 Archivo .env con contraseñas generadas"
if [ ! -f .env ]; then
  umask 077
  cat > .env <<EOF
DOMINIO=$DOMINIO
CORREO_SSL=$CORREO
ZONA_HORARIA=$ZONA
N8N_VERSION=$VERSION_N8N
POSTGRES_USER=n8n
POSTGRES_PASSWORD=$(openssl rand -hex 24)
N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)
EOF
  umask 022
  echo "Se creó .env. Guarda una copia de N8N_ENCRYPTION_KEY en un lugar seguro:"
  echo "sin ella no se pueden leer las credenciales guardadas en n8n."
else
  echo ".env ya existe; se conserva."
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

paso "6/8 Descargando y levantando Caddy, Postgres y n8n"
docker compose pull
docker compose up -d

paso "7/8 Creando la base 'citas' y la tabla de contactos"
bash lib/base-citas.sh

paso "8/8 Respaldo diario a las 3:00 a. m."
cat > /etc/cron.d/agente-citas <<EOF
0 3 * * * root bash $KIT/respaldo.sh >> /var/log/agente-citas-respaldo.log 2>&1
EOF
chmod 644 /etc/cron.d/agente-citas
echo "Programado en /etc/cron.d/agente-citas (copias en /var/backups/agente-citas)."

printf '\nEsperando a que https://%s responda' "$DOMINIO"
for _ in $(seq 1 60); do
  if curl -fsS --max-time 5 "https://$DOMINIO/healthz" >/dev/null 2>&1; then
    printf '\n\n\033[1;32mListo.\033[0m Abre https://%s y crea la cuenta de dueño de n8n.\n' "$DOMINIO"
    echo "Siguiente paso: llena configuracion.json y ejecuta: sudo bash importar.sh"
    exit 0
  fi
  printf '.'
  sleep 5
done
printf '\n'
aviso "https://$DOMINIO todavía no responde. Suele ser el DNS o el certificado."
echo "Revisa con: docker compose logs caddy --tail 50"
