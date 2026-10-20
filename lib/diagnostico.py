#!/usr/bin/env python3
"""Resume las últimas ejecuciones de n8n: qué nodo falló, con qué error y qué
respondieron las herramientas del agente. Lo usa diagnostico.sh (lee de stdin
una ejecución por línea, en JSON, sacada de Postgres)."""
import json
import sys

LARGO = 400


def desaplanar(texto):
    """n8n guarda las ejecuciones en formato 'flatted': un arreglo donde cada
    texto es un índice a otra posición del arreglo."""
    tabla = json.loads(texto)
    hechos = {}

    def valor(i):
        if i in hechos:
            return hechos[i]
        crudo = tabla[i]
        if isinstance(crudo, str):
            hechos[i] = crudo
            return crudo
        if isinstance(crudo, list):
            salida = []
            hechos[i] = salida
            salida.extend(resolver(v) for v in crudo)
            return salida
        if isinstance(crudo, dict):
            salida = {}
            hechos[i] = salida
            for k, v in crudo.items():
                salida[k] = resolver(v)
            return salida
        return crudo

    def resolver(v):
        if isinstance(v, str):
            return valor(int(v))
        return v

    return valor(0)


def corto(v):
    t = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    t = " ".join(t.split())
    return t if len(t) <= LARGO else t[:LARGO] + "…"


def main():
    filas = [json.loads(l) for l in sys.stdin if l.strip()]
    if not filas:
        print("No hay ejecuciones guardadas todavía.")
        return
    for fila in reversed(filas):
        print(f"\n=== Ejecución {fila['id']} · {fila['status']} · {fila['mode']} · {str(fila['started'])[:19]}")
        try:
            datos = desaplanar(fila["data"])
        except Exception as e:  # noqa: BLE001
            print(f"  (no pude leer los datos: {e})")
            continue
        resultado = datos.get("resultData", {}) or {}
        if resultado.get("error"):
            err = resultado["error"]
            print(f"  ERROR GENERAL: {corto(err.get('message', err))}")
            if err.get("description"):
                print(f"    detalle: {corto(err['description'])}")
        for nodo, corridas in (resultado.get("runData") or {}).items():
            for corrida in corridas or []:
                err = corrida.get("error")
                if err:
                    print(f"  ✗ {nodo}: {corto(err.get('message', ''))}")
                    for campo in ("description", "httpCode"):
                        if err.get(campo):
                            print(f"      {campo}: {corto(err[campo])}")
                salida = (corrida.get("data") or {})
                for item in ((salida.get("ai_tool") or [[]])[0] or []):
                    j = item.get("json", {})
                    print(f"  ⚙ {nodo} respondió: {corto(j.get('response', j))}")
                if nodo in ("Agente de citas", "Leer mensaje", "Preparar contexto"):
                    for item in ((salida.get("main") or [[]])[0] or [])[:1]:
                        j = item.get("json", {})
                        clave = "output" if "output" in j else "texto" if "texto" in j else None
                        if clave:
                            print(f"  · {nodo}: {corto(j[clave])}")


if __name__ == "__main__":
    main()
