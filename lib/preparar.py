#!/usr/bin/env python3
"""Prepara la importación en n8n a partir de configuracion.json.

Genera en la carpeta de salida:
  - credenciales.json: credenciales en el formato de "n8n import:credentials"
  - workflow.json: el workflow con el nodo Configuración ya lleno

Uso: python3 lib/preparar.py configuracion.json workflow <carpeta_salida>
  (con la carpeta workflow elige el archivo según ia.proveedor: gemini u openai)
Lee POSTGRES_USER y POSTGRES_PASSWORD del entorno (el archivo .env).
"""
import json
import os
import re
import sys
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

IDS = {
    "whatsAppApi": ("citasWhatsAppApi", "WhatsApp API (citas)"),
    "whatsAppTriggerApi": ("citasWaTrigger01", "WhatsApp Trigger (citas)"),
    "googleCalendarOAuth2Api": ("citasGoogleCal01", "Google Calendar (citas)"),
    "openAiApi": ("citasOpenAi00001", "OpenAI (citas)"),
    "googlePalmApi": ("citasGemini00001", "Google Gemini (citas)"),
    "postgres": ("citasPostgres001", "Postgres (citas)"),
}
WORKFLOWS = {"gemini": "agente-citas-whatsapp.json", "openai": "agente-citas-whatsapp-openai.json"}
RANGO = re.compile(r"^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$")


def fallar(mensaje):
    print(f"ERROR: {mensaje}", file=sys.stderr)
    sys.exit(1)


def limpio(valor):
    return str(valor).strip() if valor is not None else ""


def validar_negocio(neg, errores):
    for campo in ("negocio", "asistente", "servicios"):
        if not limpio(neg.get(campo)):
            errores.append(f"negocio.{campo} está vacío")
    zona = limpio(neg.get("zona_horaria")) or "America/Bogota"
    try:
        ZoneInfo(zona)
    except (ZoneInfoNotFoundError, ValueError):
        errores.append(f"negocio.zona_horaria '{zona}' no existe (ejemplo válido: America/Bogota)")
    horario = neg.get("horario")
    if not isinstance(horario, dict):
        errores.append("negocio.horario debe tener los días 1 a 7")
    else:
        for dia in map(str, range(1, 8)):
            rangos = horario.get(dia)
            if not isinstance(rangos, list):
                errores.append(f"negocio.horario.{dia} debe ser una lista (vacía si ese día no se atiende)")
                continue
            for r in rangos:
                if not isinstance(r, str) or not RANGO.match(r):
                    errores.append(f"negocio.horario.{dia}: '{r}' debe tener la forma HH:MM-HH:MM")
                elif r[:5] >= r[6:]:
                    errores.append(f"negocio.horario.{dia}: en '{r}' la hora final debe ser mayor que la inicial")
    minimos = {"duracion_min": 5, "intervalo_min": 5, "anticipacion_min": 0, "dias_max": 1, "max_citas_activas": 1}
    for campo, minimo in minimos.items():
        valor = neg.get(campo)
        if not isinstance(valor, int) or isinstance(valor, bool) or valor < minimo:
            errores.append(f"negocio.{campo} debe ser un número entero mayor o igual a {minimo}")
    hora = neg.get("hora_recordatorio", 18)
    if not isinstance(hora, int) or isinstance(hora, bool) or not 0 <= hora <= 23:
        errores.append("negocio.hora_recordatorio debe ser un número entre 0 y 23")
    if not isinstance(neg.get("cerrar_festivos", True), bool):
        errores.append("negocio.cerrar_festivos debe ser true o false")


def proveedor_ia(cfg):
    """Devuelve (proveedor, clave). Acepta también el formato viejo "openai": {"api_key"}."""
    ia, viejo = cfg.get("ia", {}), cfg.get("openai", {})
    clave_openai = limpio(ia.get("openai_api_key")) or limpio(viejo.get("api_key"))
    proveedor = limpio(ia.get("proveedor")).lower()
    if not proveedor:
        proveedor = "openai" if clave_openai and not limpio(ia.get("gemini_api_key")) else "gemini"
    clave = limpio(ia.get("gemini_api_key")) if proveedor == "gemini" else clave_openai
    return proveedor, clave


def credenciales(cfg, errores, avisos):
    wa, go = cfg.get("whatsapp", {}), cfg.get("google", {})
    salida = []

    def agregar(tipo, datos):
        cid, nombre = IDS[tipo]
        salida.append({"id": cid, "name": nombre, "type": tipo, "data": datos})

    token, waba = limpio(wa.get("token_permanente")), limpio(wa.get("waba_id"))
    app_id, app_secret = limpio(wa.get("app_id")), limpio(wa.get("app_secret"))
    telefono = limpio(wa.get("phone_number_id"))
    if token and waba:
        if not waba.isdigit():
            errores.append("whatsapp.waba_id debe tener solo números")
        agregar("whatsAppApi", {"accessToken": token, "businessAccountId": waba})
    else:
        avisos.append("WhatsApp API: falta token_permanente o waba_id; no se importa todavía")
    if app_id and app_secret:
        if not app_id.isdigit():
            errores.append("whatsapp.app_id debe tener solo números")
        agregar("whatsAppTriggerApi", {"clientId": app_id, "clientSecret": app_secret})
    else:
        avisos.append("WhatsApp Trigger: falta app_id o app_secret; no se importa todavía")
    if telefono and not telefono.isdigit():
        errores.append("whatsapp.phone_number_id debe tener solo números (no es el número de teléfono)")
    elif not telefono:
        avisos.append("whatsapp.phone_number_id vacío: los recordatorios no saldrán hasta llenarlo")

    client_id, client_secret = limpio(go.get("client_id")), limpio(go.get("client_secret"))
    if client_id and client_secret:
        if not client_id.endswith(".apps.googleusercontent.com"):
            avisos.append("google.client_id no termina en .apps.googleusercontent.com; revisa que sea el Client ID")
        agregar("googleCalendarOAuth2Api", {"clientId": client_id, "clientSecret": client_secret})
    else:
        avisos.append("Google Calendar: falta client_id o client_secret; no se importa todavía")

    proveedor, clave = proveedor_ia(cfg)
    if proveedor not in WORKFLOWS:
        errores.append("ia.proveedor debe ser gemini u openai")
    elif not clave:
        avisos.append(f"IA: falta ia.{proveedor}_api_key; el agente no responderá hasta llenarla")
    elif proveedor == "gemini":
        # AI Studio entrega claves "AQ." (nuevas) o "AIza" (antiguas); ambas sirven.
        if not clave.startswith(("AIza", "AQ.")):
            avisos.append("ia.gemini_api_key no empieza por AQ. ni AIza; revisa que sea la API key de AI Studio")
        agregar("googlePalmApi", {"host": "https://generativelanguage.googleapis.com", "apiKey": clave})
    else:
        if not clave.startswith("sk-"):
            avisos.append("ia.openai_api_key no empieza por sk-; revisa que sea una clave de API")
        agregar("openAiApi", {"apiKey": clave})

    usuario, clave_pg = os.environ.get("POSTGRES_USER", ""), os.environ.get("POSTGRES_PASSWORD", "")
    if not usuario or not clave_pg:
        errores.append("faltan POSTGRES_USER o POSTGRES_PASSWORD en .env")
    agregar("postgres", {"host": "postgres", "port": 5432, "database": "citas",
                         "user": usuario, "password": clave_pg, "ssl": "disable"})
    return salida


def llenar_workflow(wf, cfg):
    neg, wa, go = cfg.get("negocio", {}), cfg.get("whatsapp", {}), cfg.get("google", {})
    valores = {
        "negocio": limpio(neg.get("negocio")),
        "asistente": limpio(neg.get("asistente")),
        "servicios": limpio(neg.get("servicios")),
        "direccion": limpio(neg.get("direccion")),
        "info_extra": limpio(neg.get("info_extra")),
        "politica_datos_url": limpio(neg.get("politica_datos_url")),
        "zona_horaria": limpio(neg.get("zona_horaria")) or "America/Bogota",
        "horario": json.dumps(neg.get("horario", {}), ensure_ascii=False),
        "duracion_min": neg.get("duracion_min"),
        "intervalo_min": neg.get("intervalo_min"),
        "anticipacion_min": neg.get("anticipacion_min"),
        "dias_max": neg.get("dias_max"),
        "max_citas_activas": neg.get("max_citas_activas"),
        "cerrar_festivos": neg.get("cerrar_festivos", True),
        "calendar_id": limpio(go.get("calendar_id")) or "primary",
    }
    if limpio(wa.get("phone_number_id")):
        valores["phone_number_id"] = limpio(wa.get("phone_number_id"))
    nodos = {n["name"]: n for n in wf["nodes"]}
    if "Configuración" not in nodos or "Recordatorio diario" not in nodos:
        fallar("el workflow no tiene los nodos Configuración y Recordatorio diario")
    for asignacion in nodos["Configuración"]["parameters"]["assignments"]["assignments"]:
        if asignacion["name"] in valores:
            asignacion["value"] = valores[asignacion["name"]]
    nodos["Recordatorio diario"]["parameters"]["rule"]["interval"][0]["triggerAtHour"] = neg.get("hora_recordatorio", 18)
    wf.setdefault("settings", {})["timezone"] = valores["zona_horaria"]
    return wf


def main():
    if len(sys.argv) != 4:
        fallar("uso: python3 lib/preparar.py configuracion.json workflow.json carpeta_salida")
    ruta_cfg, ruta_wf, salida = sys.argv[1:]
    try:
        with open(ruta_cfg, encoding="utf-8") as f:
            cfg = json.load(f)
    except json.JSONDecodeError as e:
        fallar(f"configuracion.json no es un JSON válido (línea {e.lineno}, columna {e.colno}): {e.msg}")
    proveedor = proveedor_ia(cfg)[0]
    if os.path.isdir(ruta_wf):
        if proveedor not in WORKFLOWS:
            fallar("ia.proveedor debe ser gemini u openai")
        ruta_wf = os.path.join(ruta_wf, WORKFLOWS[proveedor])
    with open(ruta_wf, encoding="utf-8") as f:
        wf = json.load(f)

    errores, avisos = [], []
    validar_negocio(cfg.get("negocio", {}), errores)
    creds = credenciales(cfg, errores, avisos)
    if errores:
        fallar("revisa configuracion.json:\n  - " + "\n  - ".join(errores))
    wf = llenar_workflow(wf, cfg)

    with open(os.path.join(salida, "credenciales.json"), "w", encoding="utf-8") as f:
        json.dump(creds, f, ensure_ascii=False, indent=2)
    with open(os.path.join(salida, "workflow.json"), "w", encoding="utf-8") as f:
        json.dump(wf, f, ensure_ascii=False, indent=2)

    print(f"Proveedor de IA: {proveedor} ({os.path.basename(ruta_wf)})")
    print("Credenciales listas: " + ", ".join(c["name"] for c in creds))
    for aviso in avisos:
        print(f"AVISO: {aviso}")


if __name__ == "__main__":
    main()
