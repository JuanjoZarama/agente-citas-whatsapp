#!/usr/bin/env bash
# Instala el agente de citas en tu propio PC: Ubuntu en WSL o en una máquina virtual.
# No necesita VPS ni dominio: Meta llega a n8n por un túnel gratuito de ngrok.
# Uso:  sudo bash instalar-local.sh tu-dominio.ngrok-free.app
#   El authtoken de ngrok se pide al ejecutar (o pásalo en NGROK_AUTHTOKEN).
# Se puede ejecutar varias veces: conserva .env y los datos existentes.
set -euo pipefail

NGROK_DOMAIN="${1:-}"
ZONA="${ZONA_HORARIA:-America/Bogota}"
VERSION_N8N="${N8N_VERSION:-2.43.6}"
KIT="$(cd "$(dirname "$0")" && pwd)"
cd "$KIT"

paso() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33mAVISO: %s\033[0m\n' "$*"; }
error() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || error "Ejecuta el script con sudo: sudo bash instalar-local.sh $*"
NGROK_DOMAIN="${NGROK_DOMAIN#https://}"
NGROK_DOMAIN="${NGROK_DOMAIN%%/*}"
if [ -z "$NGROK_DOMAIN" ] || [[ "$NGROK_DOMAIN" != *.* ]]; then
  error "Uso: sudo bash instalar-local.sh tu-dominio.ngrok-free.app (lo ves en dashboard.ngrok.com > Domains)"
fi

paso "1/7 Revisando systemd"
if [ "$(ps -p 1 -o comm= | tr -d ' ')" != "systemd" ]; then
  if grep -qi microsoft /proc/version; then
    printf '[boot]\nsystemd=true\n' > /etc/wsl.conf
    aviso "Activé systemd en /etc/wsl.conf."
    echo "En PowerShell de Windows ejecuta: wsl --shutdown"
    echo "Abre Ubuntu de nuevo y vuelve a ejecutar este mismo comando."
    exit 0
  fi
  error "Este sistema no usa systemd; usa Ubuntu 22.04 o superior."
fi
echo "systemd activo."

paso "2/7 Instalando Docker (si falta)"
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  apt-get update
  if ! apt-get install -y docker.io docker-compose-v2; then
    aviso "Los paquetes de Ubuntu fallaron; uso el instalador oficial de Docker."
    curl -fsSL https://get.docker.com | sh
  fi
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker compose version >/dev/null 2>&1 || error "Docker Compose no quedó instalado."
if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  usermod -aG docker "$SUDO_USER"
fi
echo "Docker listo."

paso "3/7 Authtoken de ngrok"
if [ -f .env ] && grep -q '^NGROK_AUTHTOKEN=.\+' .env; then
  echo "Ya está guardado en .env."
else
  if [ -z "${NGROK_AUTHTOKEN:-}" ]; then
    read -r -s -p "Pega tu authtoken de ngrok (dashboard.ngrok.com > Your Authtoken): " NGROK_AUTHTOKEN
    echo
  fi
  [ -n "${NGROK_AUTHTOKEN:-}" ] || error "Sin authtoken no se puede abrir el túnel."
fi

paso "4/7 Archivo .env con contraseñas generadas"
if [ ! -f .env ]; then
  umask 077
  cat > .env <<EOF
COMPOSE_FILE=docker-compose.local.yml
DOMINIO=$NGROK_DOMAIN
NGROK_DOMAIN=$NGROK_DOMAIN
NGROK_AUTHTOKEN=$NGROK_AUTHTOKEN
EDITOR_URL=http://localhost:5678
EDITOR_BIND=${EDITOR_BIND:-127.0.0.1}
ZONA_HORARIA=$ZONA
N8N_VERSION=$VERSION_N8N
POSTGRES_USER=n8n
POSTGRES_PASSWORD=$(openssl rand -hex 24)
N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)
EOF
  umask 022
  echo "Se creó .env. Guarda una copia de N8N_ENCRYPTION_KEY en un lugar seguro."
elif ! grep -q '^COMPOSE_FILE=docker-compose.local.yml' .env; then
  error ".env existe pero es de la instalación con VPS. Renómbralo si quieres instalar en modo local."
else
  echo ".env ya existe; se conserva."
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

paso "5/7 Descargando y levantando Postgres, n8n y ngrok"
docker compose pull
docker compose up -d

paso "6/7 Creando la base 'citas' y la tabla de contactos"
bash lib/base-citas.sh

paso "7/7 Respaldo diario a las 3:00 a. m."
if command -v cron >/dev/null 2>&1 || apt-get install -y cron >/dev/null; then
  systemctl enable --now cron >/dev/null 2>&1 || true
  echo "0 3 * * * root bash $KIT/respaldo.sh >> /var/log/agente-citas-respaldo.log 2>&1" > /etc/cron.d/agente-citas
  chmod 644 /etc/cron.d/agente-citas
  echo "Programado (solo corre si el PC está encendido a esa hora)."
fi

printf '\nEsperando a que n8n y el túnel respondan'
for _ in $(seq 1 60); do
  if curl -fsS --max-time 5 http://localhost:5678/healthz >/dev/null 2>&1; then
    break
  fi
  printf '.'
  sleep 5
done
printf '\n'
if ! curl -fsS --max-time 5 http://localhost:5678/healthz >/dev/null 2>&1; then
  aviso "n8n no responde todavía. Revisa: docker compose logs n8n --tail 50"
  exit 1
fi
# n8n contesta "not registered" a un webhook inexistente: si llega ese texto, el túnel funciona.
if curl -sS --max-time 15 "https://$NGROK_DOMAIN/webhook/prueba-tunel" 2>/dev/null | grep -qi "not registered"; then
  echo "Túnel funcionando: https://$NGROK_DOMAIN llega a n8n."
else
  aviso "El túnel aún no responde. Revisa: docker compose logs ngrok --tail 30"
fi
printf '\n\033[1;32mListo.\033[0m Abre http://localhost:5678 en el navegador de Windows y crea la cuenta de dueño.\n'
echo "Siguiente paso: llena configuracion.json y ejecuta: sudo bash importar.sh"
