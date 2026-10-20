#!/usr/bin/env python3
"""Copia la sesión de Google (oauthTokenData) de la credencial que ya está en n8n
a la credencial nueva, para que reimportar no desconecte Google Calendar.
Uso: python3 lib/conservar_google.py credenciales.json google-actual.json"""
import json
import sys

ruta_nuevas, ruta_actual = sys.argv[1:3]
with open(ruta_nuevas, encoding="utf-8") as f:
    nuevas = json.load(f)
try:
    with open(ruta_actual, encoding="utf-8") as f:
        actual = json.load(f)
except (OSError, json.JSONDecodeError):
    sys.exit(0)
datos = actual[0].get("data", {}) if isinstance(actual, list) and actual else {}
if not isinstance(datos, dict) or not datos.get("oauthTokenData"):
    sys.exit(0)
for cred in nuevas:
    if cred.get("type") != "googleCalendarOAuth2Api":
        continue
    if cred["data"].get("clientId") == datos.get("clientId"):
        cred["data"]["oauthTokenData"] = datos["oauthTokenData"]
        print("Google Calendar: se conserva la sesión ya conectada.")
    else:
        print("Google Calendar: cambió el client_id; vuelve a pulsar Sign in with Google en n8n.")
with open(ruta_nuevas, "w", encoding="utf-8") as f:
    json.dump(nuevas, f, ensure_ascii=False, indent=2)
