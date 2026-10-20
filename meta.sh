#!/usr/bin/env bash
# Atajos para la API de WhatsApp de Meta, con los datos de configuracion.json.
# Uso: bash meta.sh <comando> [argumento]
#   verificar                 Revisa que el token sea válido, cuándo vence y sus permisos
#   cuentas                   Lista las cuentas de WhatsApp (WABA) y números a los que llega el token
#   usar <WABA_ID> <PHONE_ID> Guarda esa cuenta y ese número en configuracion.json
#   numeros                   Lista los números de la cuenta y su phone_number_id
#   registrar <PIN>           Registra el número en la Cloud API (PIN nuevo de 6 dígitos)
#   suscribir                 Conecta la app a la cuenta de WhatsApp para recibir mensajes
#   plantilla                 Crea la plantilla recordatorio_cita (categoría Utilidad)
#   plantillas                Muestra el estado de las plantillas
#   prueba <NUMERO>           Envía la plantilla hello_world a un número (ej. 573001234567)
#   prueba-recordatorio <NUM> Envía la plantilla recordatorio_cita con datos de ejemplo
# Con META_DRY_RUN=1 solo muestra las peticiones, sin enviarlas.
set -euo pipefail

KIT="$(cd "$(dirname "$0")" && pwd)"
cd "$KIT"
VERSION_GRAPH="${VERSION_GRAPH:-v25.0}"
API="https://graph.facebook.com/${VERSION_GRAPH}"

error() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
[ -f configuracion.json ] || error "Falta configuracion.json (cópialo de configuracion.plantilla.json)."

leer() {
  python3 - "$1" "$2" <<'PY'
import json, sys
seccion, campo = sys.argv[1], sys.argv[2]
with open("configuracion.json", encoding="utf-8") as f:
    datos = json.load(f)
print(str(datos.get(seccion, {}).get(campo, "") or "").strip())
PY
}

TOKEN="$(leer whatsapp token_permanente)"
WABA="$(leer whatsapp waba_id)"
TELEFONO_ID="$(leer whatsapp phone_number_id)"
APP_ID="$(leer whatsapp app_id)"
APP_SECRET="$(leer whatsapp app_secret)"
NEGOCIO="$(leer negocio negocio)"

requiere() {
  local par variable campo
  for par in "$@"; do
    variable="${par%%:*}"
    campo="${par#*:}"
    [ -n "${!variable}" ] || error "Falta whatsapp.${campo} en configuracion.json."
  done
}

llamar() {
  local metodo="$1" url="$2" datos="${3:-}"
  if [ "${META_DRY_RUN:-}" = "1" ]; then
    echo "$metodo $url"
    if [ -n "$datos" ]; then echo "$datos"; fi
    return 0
  fi
  local args=(-sS --max-time 30 -X "$metodo" "$url" -H "Authorization: Bearer $TOKEN")
  if [ -n "$datos" ]; then args+=(-H "Content-Type: application/json" -d "$datos"); fi
  curl "${args[@]}" | mostrar || true
}

# Muestra la respuesta de Meta legible, sea JSON o no.
mostrar() {
  python3 -c '
import json, sys
texto = sys.stdin.read()
try:
    print(json.dumps(json.loads(texto), indent=2, ensure_ascii=False))
except ValueError:
    print(texto.strip() or "(sin respuesta: revisa la conexión a internet)")
'
}

solo_digitos() { echo "$1" | tr -cd '0-9'; }

cmd_verificar() {
  requiere TOKEN:token_permanente APP_ID:app_id APP_SECRET:app_secret
  if [ "${META_DRY_RUN:-}" = "1" ]; then
    echo "GET $API/debug_token?input_token=<token>&access_token=${APP_ID}%7C<app_secret>"
    return 0
  fi
  curl -sS --max-time 30 "$API/debug_token?input_token=${TOKEN}&access_token=${APP_ID}%7C${APP_SECRET}" | python3 -c '
import datetime, json, sys
texto = sys.stdin.read()
try:
    d = json.loads(texto)
except ValueError:
    print("Respuesta inesperada de Meta:", texto.strip() or "(vacía: revisa la conexión a internet)"); sys.exit(1)
if "error" in d:
    print("Error de Meta:", d["error"].get("message")); sys.exit(1)
d = d.get("data", {})
vence = d.get("expires_at", 0)
print("Token válido:", "sí" if d.get("is_valid") else "NO")
print("Vence:", "nunca" if not vence else datetime.datetime.fromtimestamp(vence).strftime("%Y-%m-%d %H:%M"))
permisos = d.get("scopes", [])
print("Permisos:", ", ".join(permisos))
faltan = [p for p in ("whatsapp_business_messaging", "whatsapp_business_management") if p not in permisos]
if faltan:
    print("FALTAN permisos:", ", ".join(faltan))
'
}

cmd_cuentas() {
  requiere TOKEN:token_permanente APP_ID:app_id APP_SECRET:app_secret
  if [ "${META_DRY_RUN:-}" = "1" ]; then
    echo "GET $API/debug_token (granular_scopes) y GET $API/<waba_id>/phone_numbers por cada cuenta"
    return 0
  fi
  local ids
  ids="$(curl -sS --max-time 30 "$API/debug_token?input_token=${TOKEN}&access_token=${APP_ID}%7C${APP_SECRET}" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin).get("data", {})
except ValueError:
    sys.exit(0)
ids = []
for g in d.get("granular_scopes", []):
    if g.get("scope") == "whatsapp_business_management":
        ids += g.get("target_ids", [])
print(" ".join(dict.fromkeys(ids)))
')"
  [ -n "$ids" ] || error "El token no muestra cuentas de WhatsApp. Asigna la cuenta al usuario del sistema (control total)."
  local id
  for id in $ids; do
    curl -sS --max-time 30 "$API/$id?fields=name,account_review_status,phone_numbers%7Bid,display_phone_number,verified_name,code_verification_status,name_status,status%7D" \
      -H "Authorization: Bearer $TOKEN" | ACTUAL="$WABA" ID="$id" python3 -c '
import json, os, sys
d = json.load(sys.stdin)
if "error" in d:
    print("Cuenta", os.environ.get("ID"), "-> error:", d["error"].get("message")); sys.exit(0)
marca = "   <- la que usa configuracion.json" if d["id"] == os.environ.get("ACTUAL") else ""
print()
print("Cuenta (waba_id): {}  ·  {}  ·  revisión: {}{}".format(d["id"], d.get("name", ""), d.get("account_review_status", "?"), marca))
nums = d.get("phone_numbers", {}).get("data", [])
if not nums:
    print("   (sin números)")
for n in nums:
    print("   número {}  ·  phone_number_id: {}  ·  nombre: {} ({})  ·  estado: {}".format(
        n.get("display_phone_number"), n.get("id"), n.get("verified_name"), n.get("name_status", "?"), n.get("status", "?")))
'
  done
  echo
  echo "Para usar otra cuenta: bash meta.sh usar <waba_id> <phone_number_id>"
}

cmd_usar() {
  local waba telefono
  waba="$(solo_digitos "${1:-}")"
  telefono="$(solo_digitos "${2:-}")"
  [ -n "$waba" ] && [ -n "$telefono" ] || error "Uso: bash meta.sh usar <waba_id> <phone_number_id> (los ves con: bash meta.sh cuentas)"
  python3 - "$waba" "$telefono" <<'PY'
import json, sys
waba, telefono = sys.argv[1], sys.argv[2]
with open("configuracion.json", encoding="utf-8") as f:
    cfg = json.load(f)
wa = cfg.setdefault("whatsapp", {})
print(f"waba_id:         {wa.get('waba_id') or '(vacío)'} -> {waba}")
print(f"phone_number_id: {wa.get('phone_number_id') or '(vacío)'} -> {telefono}")
wa["waba_id"], wa["phone_number_id"] = waba, telefono
with open("configuracion.json", "w", encoding="utf-8") as f:
    json.dump(cfg, f, ensure_ascii=False, indent=2)
    f.write("\n")
PY
  chmod 600 configuracion.json
  echo "Guardado. Sigue con: bash meta.sh registrar <PIN>, suscribir y plantilla."
}

cmd_numeros() {
  requiere TOKEN:token_permanente WABA:waba_id
  llamar GET "$API/$WABA/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type"
  echo "El campo \"id\" de tu número es el phone_number_id que va en configuracion.json."
}

cmd_registrar() {
  requiere TOKEN:token_permanente TELEFONO_ID:phone_number_id
  local pin="${1:-}"
  [[ "$pin" =~ ^[0-9]{6}$ ]] || error "Indica un PIN de 6 dígitos: bash meta.sh registrar 123456 (guárdalo; es la verificación en dos pasos)."
  llamar POST "$API/$TELEFONO_ID/register" "{\"messaging_product\": \"whatsapp\", \"pin\": \"$pin\"}"
}

cmd_suscribir() {
  requiere TOKEN:token_permanente WABA:waba_id
  llamar POST "$API/$WABA/subscribed_apps"
  echo "Apps suscritas a la cuenta:"
  llamar GET "$API/$WABA/subscribed_apps"
}

cuerpo_plantilla() {
  python3 - "${NEGOCIO:-Mi Negocio}" <<'PY'
import json, sys
print(json.dumps({
    "name": "recordatorio_cita",
    "language": "es",
    "category": "UTILITY",
    "components": [{
        "type": "BODY",
        "text": "Hola {{1}}, te recordamos tu cita el {{2}} a las {{3}} en {{4}}. "
                "Si necesitas cambiarla o cancelarla, responde a este mensaje.",
        "example": {"body_text": [["Ana", "viernes 16 de octubre", "3:00 p. m.", sys.argv[1]]]},
    }],
}, ensure_ascii=False))
PY
}

cmd_plantilla() {
  requiere TOKEN:token_permanente WABA:waba_id
  llamar POST "$API/$WABA/message_templates" "$(cuerpo_plantilla)"
  echo "Meta revisa la plantilla; puede tardar hasta 24 horas. Consulta con: bash meta.sh plantillas"
}

cmd_plantillas() {
  requiere TOKEN:token_permanente WABA:waba_id
  llamar GET "$API/$WABA/message_templates?fields=name,status,category,language&limit=50"
}

cmd_prueba() {
  requiere TOKEN:token_permanente TELEFONO_ID:phone_number_id
  local numero
  numero="$(solo_digitos "${1:-}")"
  [ -n "$numero" ] || error "Indica el número con indicativo: bash meta.sh prueba 573001234567"
  llamar POST "$API/$TELEFONO_ID/messages" \
    "{\"messaging_product\": \"whatsapp\", \"to\": \"$numero\", \"type\": \"template\", \"template\": {\"name\": \"hello_world\", \"language\": {\"code\": \"en_US\"}}}"
}

cmd_prueba_recordatorio() {
  requiere TOKEN:token_permanente TELEFONO_ID:phone_number_id
  local numero
  numero="$(solo_digitos "${1:-}")"
  [ -n "$numero" ] || error "Indica el número con indicativo: bash meta.sh prueba-recordatorio 573001234567"
  local cuerpo
  cuerpo="$(python3 - "$numero" "${NEGOCIO:-Mi Negocio}" <<'PY'
import json, sys
numero, negocio = sys.argv[1], sys.argv[2]
valores = ["Ana", "viernes 16 de octubre", "3:00 p. m.", negocio]
print(json.dumps({
    "messaging_product": "whatsapp",
    "to": numero,
    "type": "template",
    "template": {
        "name": "recordatorio_cita",
        "language": {"code": "es"},
        "components": [{"type": "body", "parameters": [{"type": "text", "text": v} for v in valores]}],
    },
}, ensure_ascii=False))
PY
)"
  llamar POST "$API/$TELEFONO_ID/messages" "$cuerpo"
}

COMANDO="${1:-ayuda}"
shift || true
case "$COMANDO" in
  verificar) cmd_verificar ;;
  cuentas) cmd_cuentas ;;
  usar) cmd_usar "${1:-}" "${2:-}" ;;
  numeros) cmd_numeros ;;
  registrar) cmd_registrar "${1:-}" ;;
  suscribir) cmd_suscribir ;;
  plantilla) cmd_plantilla ;;
  plantillas) cmd_plantillas ;;
  # El número puede venir con espacios: "+57 300 123 4567"
  prueba) cmd_prueba "$*" ;;
  prueba-recordatorio) cmd_prueba_recordatorio "$*" ;;
  *) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
