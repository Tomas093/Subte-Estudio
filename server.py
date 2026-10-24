#!/usr/bin/env python3
"""Subte Estudio: servidor local de la ruta de estudio.

Sirve la app, las materias de la carpeta materias/, corrige respuestas escritas
con un modelo local (Ollama) o con Gemini, y transcribe respuestas dictadas con
whisper.cpp. Solo usa la biblioteca estándar de Python.

    python3 server.py            # http://127.0.0.1:8765
"""
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import wave
from concurrent.futures import ThreadPoolExecutor
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP = ROOT / "app"
MATERIAS = ROOT / "materias"
CACHE = ROOT / "cache"
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def load_env():
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
CFG = {
    "proveedor": os.environ.get("SUBTE_PROVEEDOR", "ollama"),
    "modelo": os.environ.get("SUBTE_MODELO", "qwen3:30b"),
    "ollama": os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/"),
    "gemini_key": os.environ.get("GEMINI_API_KEY", ""),
    "gemini_modelo": os.environ.get("GEMINI_MODELO", "gemini-2.5-flash"),
    "tts_modelo": os.environ.get("GEMINI_TTS_MODELO", "gemini-2.5-flash-preview-tts"),
    "tts_voz": os.environ.get("GEMINI_VOZ", "Kore"),
    "tts_paralelo": max(1, int(os.environ.get("VOZ_PARALELO", os.environ.get("GEMINI_VOZ_PARALELO", "3")))),
    "ms_voz": os.environ.get("MS_VOZ", "es-AR-ElenaNeural"),
    "piper_voz": os.environ.get("PIPER_VOZ", ""),
    "tts_estilo": os.environ.get("GEMINI_VOZ_ESTILO", "Leé en voz alta el siguiente texto en español, con acento rioplatense, voz clara y ritmo tranquilo, como un profesor que le explica a un alumno. No agregues nada."),
    "whisper_bin": os.environ.get("WHISPER_BIN", "whisper-cli"),
    "whisper_modelo": os.path.expanduser(os.environ.get("WHISPER_MODELO", "")),
    "whisper_idioma": os.environ.get("WHISPER_IDIOMA", "es"),
    "puerto": int(os.environ.get("PUERTO", "8765")),
    "datos": Path(os.path.expanduser(os.environ.get("SUBTE_DATOS", ""))) if os.environ.get("SUBTE_DATOS") else ROOT / "progreso",
}

# ---------------------------------------------------------------- materias


def materia_dir(slug):
    if not SLUG.match(slug or ""):
        return None
    d = MATERIAS / slug
    return d if (d / "materia.json").exists() else None


def listar_materias():
    out = []
    for d in sorted(MATERIAS.iterdir()) if MATERIAS.exists() else []:
        f = d / "materia.json"
        if f.exists():
            m = json.loads(f.read_text(encoding="utf-8"))
            out.append({"slug": d.name, "titulo": m.get("titulo", d.name), "examen": m.get("examen")})
    return out


def cargar_materia(slug):
    d = materia_dir(slug)
    if not d:
        return None
    m = json.loads((d / "materia.json").read_text(encoding="utf-8"))
    m["slug"] = slug
    for c in m.get("clases", []):
        nn = f"{int(c['n']):02d}"
        r = d / "resumen" / f"clase{nn}.md"
        q = d / "preguntas" / f"clase{nn}.json"
        c["resumen_md"] = r.read_text(encoding="utf-8") if r.exists() else ""
        c["resumen_editado"] = (d / "resumen" / "originales" / f"clase{nn}.md").exists()
        c["preguntas"] = json.loads(q.read_text(encoding="utf-8")) if q.exists() else []
    guia = d / "resumen" / "como-responder.md"
    m["como_responder_md"] = guia.read_text(encoding="utf-8") if guia.exists() else ""
    m.pop("reglas_correccion", None)
    return m


def pregunta(slug, n, i):
    d = materia_dir(slug)
    if not d:
        return None, None
    m = json.loads((d / "materia.json").read_text(encoding="utf-8"))
    q = d / "preguntas" / f"clase{int(n):02d}.json"
    qs = json.loads(q.read_text(encoding="utf-8")) if q.exists() else []
    if not (0 <= i < len(qs)):
        return m, None
    clase = next((c for c in m.get("clases", []) if int(c["n"]) == int(n)), {})
    return m, dict(qs[i], clase=clase)

# ---------------------------------------------------------------- editar el resumen
# La primera vez que se edita una clase, el resumen original se guarda en resumen/originales/.
# Cada guardado deja la versión anterior en resumen/versiones/ (las últimas 30 por clase).

VERSIONES_RESUMEN = 30


def guardar_resumen(slug, n, texto):
    d = materia_dir(slug)
    if not d:
        return 404, {"error": "Materia no encontrada"}
    nn = f"{int(n):02d}"
    r = d / "resumen" / f"clase{nn}.md"
    texto = str(texto).replace("\r\n", "\n")
    if len(texto) > 1_000_000:
        return 413, {"error": "El resumen es demasiado largo."}
    if r.exists():
        orig = d / "resumen" / "originales" / f"clase{nn}.md"
        if not orig.exists():
            orig.parent.mkdir(exist_ok=True)
            shutil.copyfile(r, orig)
        ver = d / "resumen" / "versiones"
        ver.mkdir(exist_ok=True)
        ahora = time.time()
        shutil.copyfile(r, ver / f"clase{nn}-{time.strftime('%Y%m%d-%H%M%S', time.localtime(ahora))}-{int(ahora * 1000) % 1000:03d}.md")
        for viejo in sorted(ver.glob(f"clase{nn}-*.md"))[:-VERSIONES_RESUMEN]:
            viejo.unlink()
    r.parent.mkdir(exist_ok=True)
    tmp = r.with_suffix(".tmp")
    tmp.write_text(texto, encoding="utf-8")
    os.replace(tmp, r)
    return 200, {"ok": True}


def restaurar_resumen(slug, n):
    d = materia_dir(slug)
    if not d:
        return 404, {"error": "Materia no encontrada"}
    nn = f"{int(n):02d}"
    orig = d / "resumen" / "originales" / f"clase{nn}.md"
    if not orig.exists():
        return 404, {"error": "Este resumen no fue editado."}
    code, out = guardar_resumen(slug, n, orig.read_text(encoding="utf-8"))
    return code, dict(out, md=orig.read_text(encoding="utf-8"))

# ---------------------------------------------------------------- progreso
# Un archivo JSON por materia en progreso/ (o SUBTE_DATOS), más una copia por día en progreso/copias/.

COPIAS = 14


def leer_progreso(slug):
    f = CFG["datos"] / f"{slug}.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else None


def guardar_progreso(slug, datos):
    if not isinstance(datos, dict):
        raise ValueError("el progreso tiene que ser un objeto")
    CFG["datos"].mkdir(parents=True, exist_ok=True)
    f = CFG["datos"] / f"{slug}.json"
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, f)
    copias = CFG["datos"] / "copias"
    copias.mkdir(exist_ok=True)
    hoy = copias / f"{slug}-{time.strftime('%Y-%m-%d')}.json"
    if not hoy.exists():
        shutil.copyfile(f, hoy)
        for viejo in sorted(copias.glob(f"{slug}-????-??-??.json"))[:-COPIAS]:
            viejo.unlink()

# ---------------------------------------------------------------- corrección

ESQUEMA = {
    "type": "object",
    "properties": {
        "claves": {"type": "array", "items": {"type": "object", "properties": {
            "n": {"type": "integer"}, "estado": {"type": "string", "enum": ["presente", "parcial", "ausente"]},
            "falta": {"type": "string"}}, "required": ["n", "estado", "falta"]}},
        "errores": {"type": "array", "items": {"type": "object", "properties": {
            "dijiste": {"type": "string"}, "correcto": {"type": "string"}}, "required": ["dijiste", "correcto"]}},
    },
    "required": ["claves", "errores"],
}

# Reglas de tono comunes al corrector y al resumen de errores.
ESTILO = """ESTILO (obligatorio):
- 100% objetivo. Nada de elogios, ánimo ni frases para suavizar. Prohibido: "bien", "muy bien", "buen intento", "excelente", "correcto", "te acercaste", "interesante", "sin embargo", "recordá que".
- Frases cortas y directas, en segunda persona. Sin introducción ni cierre.
- Decí el dato concreto (la causa, el mecanismo, la condición, el nombre), no generalidades como "falta profundizar" o "explicá mejor".
- Español rioplatense neutro, sin "che" ni muletillas. Sin emojis."""


def prompt_correccion(m, q, respuesta):
    claves = q.get("claves") or []
    lista = "\n".join(f"{k + 1}. {c}" for k, c in enumerate(claves)) or "1. Cubre las ideas centrales de la respuesta de referencia."
    errores = "\n".join(f"- {e}" for e in q.get("errores") or []) or "- (ninguno listado)"
    reglas = m.get("reglas_correccion", "")
    return f"""Sos corrector de examen de la materia {m.get('titulo', '')}. Verificás contenido contra los puntos clave. No opinás ni das ánimo.

TAREA:
1. Para cada PUNTO CLAVE decidí si la respuesta del alumno lo contiene:
   - "presente": lo dice con sus palabras y sin errores. Un sinónimo correcto cuenta.
   - "parcial": lo menciona pero incompleto, vago o con una imprecisión.
   - "ausente": no aparece, o solo aparece una mención genérica que no lo explica.
   Ante la duda entre dos estados, elegí el más bajo.
2. "falta": para cada punto parcial o ausente, qué le faltó decir o qué dijo impreciso, en UNA frase de 15 palabras como máximo. Ejemplo: "No dijiste que la cabecera de enlace se reemplaza en cada salto." Para los puntos presentes, "falta" va vacío ("").
3. "errores": solo afirmaciones del alumno técnicamente incorrectas o que contradicen las reglas de la cátedra o los errores frecuentes listados. Para cada una, "dijiste" (lo que afirmó, en 12 palabras como máximo) y "correcto" (lo correcto, en 15 palabras como máximo). Si no hay errores, devolvé []. No inventes errores; algo que falta no es un error.
Juzgá el contenido, no la redacción ni la ortografía.

{ESTILO}

Reglas de la cátedra: {reglas}

PREGUNTA:
{q['pregunta']}

RESPUESTA DE REFERENCIA (solo como guía):
{q.get('referencia', '')}

PUNTOS CLAVE:
{lista}

ERRORES FRECUENTES QUE INVALIDAN:
{errores}

RESPUESTA DEL ALUMNO:
{respuesta}

Respondé solo con JSON: {{"claves":[{{"n":1,"estado":"presente|parcial|ausente","falta":"..."}}],"errores":[{{"dijiste":"...","correcto":"..."}}]}}"""


ESQUEMA_REPASO = {
    "type": "object",
    "properties": {
        "diagnostico": {"type": "string"},
        "reforzar": {"type": "array", "items": {"type": "object", "properties": {
            "tema": {"type": "string"}, "que_fallo": {"type": "string"}, "como_es": {"type": "string"},
            "practica": {"type": "string"}}, "required": ["tema", "que_fallo", "como_es", "practica"]}},
    },
    "required": ["diagnostico", "reforzar"],
}


def prompt_repaso(m, clase, items):
    bloques = []
    for k, it in enumerate(items, 1):
        q = it["q"]
        lineas = [f"[{k}] PREGUNTA: {q['pregunta']}", f"RESULTADO: {it['resultado']}"]
        lineas += [f"- Le faltó: {f}" for f in it["faltas"]]
        lineas += [f"- Error: {e}" for e in it["errores"]]
        lineas.append(f"RESPUESTA DE REFERENCIA: {q.get('referencia', '')}")
        bloques.append("\n".join(lineas))
    return f"""Sos tutor de la materia {m.get('titulo', '')}. El alumno terminó la autoevaluación de la clase {clase.get('n')} ({clase.get('titulo', '')}). Abajo están solo las preguntas que no respondió bien, con lo que le faltó y sus errores.

TAREA:
1. "diagnostico": 1 o 2 oraciones con el patrón de sus fallas (qué tipo de cosa le falla: confunde dos conceptos, no explica causas, no da el mecanismo, no sabe un tema). Nada de resumen general.
2. "reforzar": de 1 a 5 temas, del más grave al menos grave. Agrupá preguntas que fallan por lo mismo. Para cada tema:
   - "tema": nombre corto del concepto (hasta 6 palabras).
   - "que_fallo": qué hizo mal o le faltó, concreto (hasta 20 palabras).
   - "como_es": la explicación correcta, en 1 a 3 oraciones claras, sacada SOLO de las respuestas de referencia. Que se entienda sin haber leído nada más.
   - "practica": una acción concreta para fijarlo, de hasta 20 palabras (por ejemplo: "Explicá en 3 líneas la diferencia entre X e Y con un ejemplo de cada una").
No agregues información que no esté en las respuestas de referencia.

{ESTILO}

{chr(10).join(bloques)}

Respondé solo con JSON: {{"diagnostico":"...","reforzar":[{{"tema":"...","que_fallo":"...","como_es":"...","practica":"..."}}]}}"""


def http_json(url, body, headers=None, timeout=240):
    req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def llamar_modelo(prompt, proveedor, esquema=ESQUEMA):
    if proveedor == "gemini":
        if not CFG["gemini_key"]:
            raise RuntimeError("Falta GEMINI_API_KEY en .env")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{CFG['gemini_modelo']}:generateContent"
        r = http_json(url, {"contents": [{"parts": [{"text": prompt}]}],
                            "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}},
                      {"x-goog-api-key": CFG["gemini_key"]})
        return r["candidates"][0]["content"]["parts"][0]["text"]
    r = http_json(CFG["ollama"] + "/api/chat", {
        "model": CFG["modelo"], "stream": False, "think": False, "format": esquema,
        "options": {"temperature": 0}, "messages": [{"role": "user", "content": prompt}]})
    return r["message"]["content"]


def parse_json(txt):
    txt = txt.strip()
    try:
        return json.loads(txt)
    except ValueError:
        a, b = txt.find("{"), txt.rfind("}")
        return json.loads(txt[a:b + 1])


ELOGIO = re.compile(r"^\s*(muy bien|bien|buen[oa]?|excelente|correcto|perfecto|genial)\b[^.]*\.\s*", re.I)


def corto(t, n=240):
    return ELOGIO.sub("", str(t or "")).strip()[:n]


def corregir(slug, n, i, respuesta, proveedor=None):
    m, q = pregunta(slug, n, i)
    if not q:
        return 404, {"error": "Pregunta no encontrada"}
    proveedor = proveedor or CFG["proveedor"]
    data = parse_json(llamar_modelo(prompt_correccion(m, q, respuesta), proveedor))
    claves = q.get("claves") or ["Cubre las ideas centrales de la respuesta de referencia."]
    estados = {int(c.get("n", 0)): c for c in data.get("claves", []) if isinstance(c, dict)}
    detalle, puntos = [], 0.0
    for k, texto in enumerate(claves, 1):
        c = estados.get(k, {})
        estado = c.get("estado") if c.get("estado") in ("presente", "parcial", "ausente") else "ausente"
        puntos += {"presente": 1, "parcial": 0.5}.get(estado, 0)
        falta = "" if estado == "presente" else corto(c.get("falta") or c.get("comentario"))
        detalle.append({"texto": texto, "estado": estado, "falta": falta})
    errores = []
    for e in data.get("errores", []):
        if isinstance(e, dict) and str(e.get("dijiste", "")).strip():
            errores.append({"dijiste": corto(e["dijiste"], 200), "correcto": corto(e.get("correcto"), 240)})
        elif isinstance(e, str) and e.strip():
            errores.append({"dijiste": corto(e, 300), "correcto": ""})
    errores = errores[:4]
    cobertura = puntos / len(claves)
    puntaje = round(10 * cobertura - 2 * len(errores))
    puntaje = max(0, min(10, puntaje))
    if errores:
        veredicto = 1 if cobertura >= 0.8 else 0
    else:
        veredicto = 2 if cobertura >= 0.8 else 1 if cobertura >= 0.45 else 0
    return 200, {"veredicto": veredicto, "puntaje": puntaje, "claves": detalle, "errores": errores,
                 "modelo": CFG["gemini_modelo"] if proveedor == "gemini" else CFG["modelo"]}


ESQUEMA_EXPLICAR = {
    "type": "object",
    "properties": {
        "en_una_frase": {"type": "string"},
        "explicacion": {"type": "string"},
        "ejemplo": {"type": "string"},
    },
    "required": ["en_una_frase", "explicacion", "ejemplo"],
}


def prompt_explicar(m, clase, resumen, texto, pregunta, historial):
    previo = "\n\n".join(f"PREGUNTA ANTERIOR: {h.get('p', '')}\nTU RESPUESTA: {h.get('r', '')}" for h in historial)
    pedido = (f"Sobre ese fragmento, el alumno pregunta esto en particular: {pregunta}\n"
              "Respondé exactamente eso. \"en_una_frase\" es la respuesta directa a su pregunta."
              if pregunta else "El alumno no entendió esta parte. Explicásela.")
    return f"""Sos un profesor particular de {m.get('titulo', '')}. El alumno está leyendo el resumen de la clase {clase.get('n')} ({clase.get('titulo', '')}) y seleccionó un fragmento.

{pedido}

CÓMO RESPONDER:
- "en_una_frase": la idea central en una oración de 25 palabras como máximo, que se pueda copiar a los apuntes.
- "explicacion": de 2 a 4 párrafos cortos (150 palabras en total como máximo). Lenguaje simple: cada término técnico, definilo con palabras comunes la primera vez. Explicá el porqué, no solo el qué. Si el fragmento compara cosas, decí explícitamente en qué se diferencian. Separá los párrafos con una línea en blanco.
- "ejemplo": un caso concreto de 1 a 3 oraciones que lo muestre funcionando. Preferí ejemplos del resumen.
- Tu fuente es el RESUMEN DE LA CLASE. Si para explicar agregás algo que no está en el resumen, empezá esa oración con "Fuera del resumen:". No contradigas el resumen.
- Si la pregunta no tiene que ver con la materia, decilo en "en_una_frase" y dejá los otros campos cortos.

{ESTILO}

RESUMEN DE LA CLASE:
{resumen}

FRAGMENTO SELECCIONADO:
{texto}

{previo}

Respondé solo con JSON: {{"en_una_frase":"...","explicacion":"...","ejemplo":"..."}}"""


def explicar(slug, n, texto, pregunta="", historial=None, proveedor=None):
    """Explica un fragmento del resumen que el alumno seleccionó, con el resumen de la clase como contexto."""
    d = materia_dir(slug)
    if not d:
        return 404, {"error": "Materia no encontrada"}
    texto = re.sub(r"\s+", " ", str(texto)).strip()[:2000]
    if not texto:
        return 400, {"error": "Seleccioná una parte del resumen."}
    m = json.loads((d / "materia.json").read_text(encoding="utf-8"))
    clase = next((c for c in m.get("clases", []) if int(c["n"]) == int(n)), {"n": n})
    r = d / "resumen" / f"clase{int(n):02d}.md"
    resumen = r.read_text(encoding="utf-8")[:24000] if r.exists() else "(sin resumen)"
    historial = [h for h in (historial or []) if isinstance(h, dict)][-4:]
    prompt = prompt_explicar(m, clase, resumen, texto, str(pregunta or "").strip()[:600], historial)
    data = parse_json(llamar_modelo(prompt, proveedor or CFG["proveedor"], ESQUEMA_EXPLICAR))
    return 200, {k: corto(data.get(k), 1500) for k in ("en_una_frase", "explicacion", "ejemplo")}


def repaso(slug, n, items, proveedor=None):
    """Resumen personalizado de los errores de una clase, a partir de las preguntas que salieron mal."""
    d = materia_dir(slug)
    if not d:
        return 404, {"error": "Materia no encontrada"}
    m = json.loads((d / "materia.json").read_text(encoding="utf-8"))
    clase = next((c for c in m.get("clases", []) if int(c["n"]) == int(n)), {"n": n})
    q = d / "preguntas" / f"clase{int(n):02d}.json"
    qs = json.loads(q.read_text(encoding="utf-8")) if q.exists() else []
    RES = {0: "no la sabía", 1: "a medias"}
    datos = []
    for it in items[:30]:
        i = int(it.get("i", -1))
        if not (0 <= i < len(qs)) or it.get("veredicto") not in (0, 1):
            continue
        faltas = [str(f)[:240] for f in it.get("faltas") or [] if str(f).strip()][:6]
        errores = [str(e)[:300] for e in it.get("errores") or [] if str(e).strip()][:4]
        if not faltas and not errores:
            # Sin corrección ("No la sé" o autocalificada): todo lo que pedía la pregunta es a repasar.
            faltas = list(qs[i].get("claves") or [])
        datos.append({"q": qs[i], "resultado": RES[it["veredicto"]], "faltas": faltas, "errores": errores})
    if not datos:
        return 400, {"error": "No hay preguntas mal o a medias para resumir."}
    data = parse_json(llamar_modelo(prompt_repaso(m, clase, datos), proveedor or CFG["proveedor"], ESQUEMA_REPASO))
    reforzar = [{k: corto(r.get(k), 500) for k in ("tema", "que_fallo", "como_es", "practica")}
                for r in data.get("reforzar", []) if isinstance(r, dict) and str(r.get("tema", "")).strip()][:5]
    return 200, {"diagnostico": corto(data.get("diagnostico"), 400), "reforzar": reforzar}

# ---------------------------------------------------------------- lectura en voz alta
# Tres motores generan el audio en el servidor:
#   gemini     la más natural; usa GEMINI_API_KEY y gasta créditos.
#   microsoft  voces neuronales de Microsoft vía edge-tts; gratis, sin clave, necesita internet.
#   piper      voz local; gratis y sin internet. La calidad es un poco menor.
# microsoft y piper se instalan con scripts/instalar_voces.sh (en .venv-voces/ y voces/).
# Cada fragmento se genera una vez y queda en cache/voz/<materia>/; volver a escucharlo no cuesta.
# Un "lote" genera en segundo plano todos los fragmentos de una clase, de a varios a la vez.

VENV_VOCES = ROOT / ".venv-voces"
VOCES_DIR = ROOT / "voces"
VOCES_GEMINI = ["Kore", "Charon", "Aoede", "Puck", "Leda", "Zephyr", "Orus", "Fenrir"]
VOCES_MS = {"es-AR-ElenaNeural": "Elena (Argentina)", "es-AR-TomasNeural": "Tomás (Argentina)",
            "es-MX-DaliaNeural": "Dalia (México)", "es-MX-JorgeNeural": "Jorge (México)",
            "es-ES-ElviraNeural": "Elvira (España)", "es-ES-AlvaroNeural": "Álvaro (España)"}
TTS_MODELOS_ALTERNATIVOS = ["gemini-2.5-flash-preview-tts", "gemini-3.1-flash-tts-preview"]
VOZ_LOCK = threading.Lock()
VOZ_EN_CURSO = {}   # clave -> Event: evita generar dos veces el mismo fragmento
LOTES = {}          # id -> {"total", "hechos", "esperando", "error"}
POOL_VOZ = ThreadPoolExecutor(max_workers=CFG["tts_paralelo"])


class LimiteGemini(Exception):
    pass


def herramienta(nombre):
    """Ejecutable instalado por scripts/instalar_voces.sh, o el que esté en el PATH."""
    local = VENV_VOCES / "bin" / nombre
    return str(local) if local.exists() else shutil.which(nombre)


def voces_piper():
    return sorted(f.name[:-5] for f in VOCES_DIR.glob("*.onnx") if (VOCES_DIR / (f.name + ".json")).exists())


def motores_voz():
    """Motores disponibles en esta compu, con sus voces y la voz por defecto."""
    out = {}
    if herramienta("edge-tts"):
        out["microsoft"] = {"nombre": "Voz de Microsoft (gratis)", "voces": [{"id": k, "nombre": v} for k, v in VOCES_MS.items()],
                            "def": CFG["ms_voz"] if CFG["ms_voz"] in VOCES_MS else "es-AR-ElenaNeural"}
    pv = voces_piper()
    if pv and herramienta("piper"):
        out["piper"] = {"nombre": "Voz local Piper (gratis, sin internet)", "voces": [{"id": v, "nombre": v} for v in pv],
                        "def": CFG["piper_voz"] if CFG["piper_voz"] in pv else next((v for v in pv if v.startswith("es_AR")), pv[0])}
    if CFG["gemini_key"]:
        out["gemini"] = {"nombre": "Voz de Gemini (usa créditos)", "voces": [{"id": v, "nombre": v} for v in VOCES_GEMINI],
                         "def": CFG["tts_voz"] if CFG["tts_voz"] in VOCES_GEMINI else "Kore"}
    return out


def limpiar_texto(t):
    return re.sub(r"\s+", " ", str(t)).strip()[:3000]


def en_cache(slug, clave):
    for ext in (".m4a", ".mp3", ".wav"):
        if (CACHE / "voz" / slug / (clave + ext)).exists():
            return f"/cache/voz/{slug}/{clave}{ext}"
    return None


def guardar_wav(slug, clave, wav):
    """Pasa el wav a m4a si hay ffmpeg (ocupa mucho menos) y lo deja en el cache con su nombre final."""
    d = wav.parent
    if shutil.which("ffmpeg"):
        tmp = d / (clave + ".tmp.m4a")
        if subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-c:a", "aac", "-b:a", "64k", str(tmp)],
                          timeout=120).returncode == 0:
            wav.unlink()
            os.replace(tmp, d / (clave + ".m4a"))
            return f"/cache/voz/{slug}/{clave}.m4a"
    os.replace(wav, d / (clave + ".wav"))
    return f"/cache/voz/{slug}/{clave}.wav"


def sintetizar_gemini(texto, nombre, wav):
    cuerpo = {"contents": [{"parts": [{"text": f"{CFG['tts_estilo']}\n\n{texto}"}]}],
              "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {
                  "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": nombre}}}}}
    modelos = [CFG["tts_modelo"]] + [m for m in TTS_MODELOS_ALTERNATIVOS if m != CFG["tts_modelo"]]
    for k, modelo in enumerate(modelos):
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent"
        try:
            r = http_json(url, cuerpo, {"x-goog-api-key": CFG["gemini_key"]}, timeout=120)
            break
        except urllib.error.HTTPError as e:
            if e.code == 404 and k + 1 < len(modelos):
                continue  # el modelo de vista previa cambió de nombre: probar el siguiente
            if e.code == 429:
                raise LimiteGemini()
            raise RuntimeError(f"Gemini no pudo generar la voz ({e.code}): {e.read().decode(errors='ignore')[:200]}")
    pcm = base64.b64decode(r["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
    with wave.open(str(wav), "wb") as w:  # Gemini devuelve PCM de 16 bits, mono, 24 kHz
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(24000)
        w.writeframes(pcm)


def correr(cmd, quien, **kw):
    r = subprocess.run(cmd, capture_output=True, timeout=180, **kw)
    if r.returncode != 0:
        err = (r.stderr.decode(errors="ignore") if isinstance(r.stderr, bytes) else r.stderr or "").strip().splitlines()
        raise RuntimeError(f"{quien} no pudo generar la voz: {err[-1][:200] if err else 'error desconocido'}")


def sintetizar(slug, texto, motor, nombre, clave):
    d = CACHE / "voz" / slug
    d.mkdir(parents=True, exist_ok=True)
    if motor == "microsoft":
        txt, mp3 = d / (clave + ".tmp.txt"), d / (clave + ".tmp.mp3")
        txt.write_text(texto, encoding="utf-8")
        try:
            correr([herramienta("edge-tts"), "--voice", nombre, "--file", str(txt), "--write-media", str(mp3)],
                   "La voz de Microsoft (revisá la conexión a internet)")
        finally:
            txt.unlink(missing_ok=True)
        os.replace(mp3, d / (clave + ".mp3"))
        return f"/cache/voz/{slug}/{clave}.mp3"
    wav = d / (clave + ".tmp.wav")
    if motor == "piper":
        correr([herramienta("piper"), "-m", str(VOCES_DIR / (nombre + ".onnx")), "-f", str(wav)], "Piper",
               input=texto.encode("utf-8"))
    else:
        sintetizar_gemini(texto, nombre, wav)
    return guardar_wav(slug, clave, wav)


def generar_voz(slug, texto, motor, nombre):
    """URL del audio del fragmento. Si no está en cache lo genera; si otro hilo ya lo está generando, lo espera."""
    partes = [motor, nombre, CFG["tts_estilo"] if motor == "gemini" else "", texto]
    clave = hashlib.sha1("|".join(partes).encode()).hexdigest()[:24]
    while True:
        url = en_cache(slug, clave)
        if url:
            return url
        with VOZ_LOCK:
            ev = VOZ_EN_CURSO.get(clave)
            mio = ev is None
            if mio:
                ev = VOZ_EN_CURSO[clave] = threading.Event()
        if not mio:
            ev.wait(300)  # lo está generando otro pedido: esperar y volver a mirar el cache
            continue
        try:
            return sintetizar(slug, texto, motor, nombre, clave)
        finally:
            with VOZ_LOCK:
                VOZ_EN_CURSO.pop(clave, None)
            ev.set()


def elegir_motor(motor, nombre):
    """(motor, voz) válidos, o un error para el usuario."""
    ms = motores_voz()
    if motor not in ms:
        if motor == "gemini":
            return None, None, "Para la voz de Gemini falta GEMINI_API_KEY en .env."
        return None, None, "Esa voz no está instalada. Corré scripts/instalar_voces.sh y reiniciá el servidor."
    ids = [v["id"] for v in ms[motor]["voces"]]
    return motor, nombre if nombre in ids else ms[motor]["def"], None


def voz(slug, texto, nombre=None, motor="gemini"):
    motor, nombre, err = elegir_motor(motor or "gemini", nombre)
    if err:
        return 503, {"error": err}
    texto = limpiar_texto(texto)
    if not texto:
        return 400, {"error": "No hay texto para leer."}
    try:
        return 200, {"url": generar_voz(slug, texto, motor, nombre)}
    except LimiteGemini:
        return 429, {"error": "Gemini dice que llegaste al límite de pedidos de voz por ahora. Esperá un rato o elegí una voz gratis."}
    except (RuntimeError, OSError, subprocess.SubprocessError) as e:
        return 502, {"error": str(e)[:300]}


def lote_voz(slug, textos, nombre=None, motor="gemini"):
    """Genera en segundo plano el audio de todos los fragmentos, en el orden recibido."""
    motor, nombre, err = elegir_motor(motor or "gemini", nombre)
    if err:
        return 503, {"error": err}
    textos = [t for t in (limpiar_texto(x) for x in (textos or [])[:500]) if t]
    lid = hashlib.sha1("|".join([slug, motor, nombre] + textos).encode()).hexdigest()[:16]
    with VOZ_LOCK:
        L = LOTES.get(lid)
        if L and not L["error"] and not L.get("cancelado"):
            return 200, dict(L, id=lid)
        L = LOTES[lid] = {"total": len(textos), "hechos": 0, "esperando": False, "error": ""}

    def uno(texto):
        espera = 15
        while True:
            if L.get("cancelado"):
                return
            try:
                generar_voz(slug, texto, motor, nombre)
                break
            except LimiteGemini:  # límite de pedidos por minuto: esperar y reintentar
                L["esperando"] = True
                time.sleep(espera)
                espera = min(espera * 2, 120)
            except Exception as e:  # noqa: BLE001 (se informa en el estado del lote)
                L["error"] = str(e)[:300] or "No se pudo generar la voz."
                return
        with VOZ_LOCK:
            L["hechos"] += 1
            L["esperando"] = False

    for t in textos:
        POOL_VOZ.submit(uno, t)
    return 200, dict(L, id=lid)

# ---------------------------------------------------------------- transcripción


def transcribir(audio, tipo):
    if not CFG["whisper_modelo"] or not Path(CFG["whisper_modelo"]).exists():
        return 503, {"error": "Configurá WHISPER_MODELO en .env con la ruta a un modelo ggml de whisper.cpp"}
    if not shutil.which(CFG["whisper_bin"]) or not shutil.which("ffmpeg"):
        return 503, {"error": "Faltan whisper-cli o ffmpeg en el PATH"}
    with tempfile.TemporaryDirectory() as tmp:
        ext = "webm" if "webm" in tipo else "ogg" if "ogg" in tipo else "mp4" if "mp4" in tipo else "wav"
        src, wav = Path(tmp) / f"in.{ext}", Path(tmp) / "in.wav"
        src.write_bytes(audio)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-ar", "16000", "-ac", "1", str(wav)],
                       check=True, timeout=120)
        out = subprocess.run([CFG["whisper_bin"], "-m", CFG["whisper_modelo"], "-l", CFG["whisper_idioma"],
                              "-nt", "-np", "-f", str(wav)], capture_output=True, text=True, timeout=600)
        if out.returncode != 0:
            return 500, {"error": "whisper falló: " + out.stderr[-300:]}
        texto = " ".join(l.strip() for l in out.stdout.splitlines() if l.strip())
        return 200, {"texto": texto}

# ---------------------------------------------------------------- estado


def estado():
    st = {"proveedor": CFG["proveedor"], "modelo": CFG["modelo"], "gemini": bool(CFG["gemini_key"]),
          "ollama": False, "modelo_disponible": False,
          "transcripcion": bool(CFG["whisper_modelo"] and Path(CFG["whisper_modelo"]).exists()
                                and shutil.which(CFG["whisper_bin"]) and shutil.which("ffmpeg"))}
    try:
        with urllib.request.urlopen(CFG["ollama"] + "/api/tags", timeout=3) as r:
            tags = [t["name"] for t in json.loads(r.read().decode()).get("models", [])]
        st["ollama"] = True
        st["modelo_disponible"] = any(t == CFG["modelo"] or t.startswith(CFG["modelo"] + ":") or t.split(":")[0] == CFG["modelo"] for t in tags) or CFG["modelo"] in tags
    except (urllib.error.URLError, OSError, ValueError):
        pass
    st["voz_motores"] = motores_voz()
    st["corrector"] = (st["proveedor"] == "gemini" and st["gemini"]) or (st["proveedor"] != "gemini" and st["modelo_disponible"])
    return st

# ---------------------------------------------------------------- HTTP

TIPOS = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".pdf": "application/pdf", ".svg": "image/svg+xml", ".png": "image/png"}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("  " + fmt % args + "\n")

    def enviar(self, code, body, tipo="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def archivo(self, path):
        path = path.resolve()
        if not path.is_file() or not (str(path).startswith(str(APP)) or str(path).startswith(str(MATERIAS)) or str(path).startswith(str(CACHE))):
            return self.enviar(404, {"error": "No encontrado"})
        self.enviar(200, path.read_bytes(), TIPOS.get(path.suffix, "application/octet-stream"))

    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/":
            return self.archivo(APP / "index.html")
        if p.startswith("/app/"):
            return self.archivo(APP / p[5:])
        if p == "/api/materias":
            return self.enviar(200, listar_materias())
        if p == "/api/estado":
            return self.enviar(200, estado())
        m = re.match(r"^/api/materia/([a-z0-9-]+)$", p)
        if m:
            data = cargar_materia(m.group(1))
            return self.enviar(200, data) if data else self.enviar(404, {"error": "Materia no encontrada"})
        m = re.match(r"^/api/voz/lote/([0-9a-f]{16})$", p)
        if m:
            L = LOTES.get(m.group(1))
            return self.enviar(200, dict(L, id=m.group(1))) if L else self.enviar(404, {"error": "Lote no encontrado"})
        m = re.match(r"^/cache/voz/([a-z0-9-]+)/([0-9a-f]+\.(?:m4a|mp3|wav))$", p)
        if m:
            return self.archivo(CACHE / "voz" / m.group(1) / m.group(2))
        m = re.match(r"^/api/progreso/([a-z0-9-]+)$", p)
        if m and materia_dir(m.group(1)):
            try:
                return self.enviar(200, {"datos": leer_progreso(m.group(1))})
            except (OSError, ValueError) as e:
                return self.enviar(500, {"error": f"No se pudo leer el progreso ({e})"})
        m = re.match(r"^/materias/([a-z0-9-]+)/(fuentes/[^/]+)$", urllib.parse.unquote(p))
        if m and materia_dir(m.group(1)):
            return self.archivo(MATERIAS / m.group(1) / m.group(2))
        self.enviar(404, {"error": "No encontrado"})

    def do_POST(self):
        p = self.path.split("?")[0]
        largo = int(self.headers.get("Content-Length", "0"))
        if largo > 25 * 1024 * 1024:
            return self.enviar(413, {"error": "Archivo demasiado grande"})
        cuerpo = self.rfile.read(largo)
        try:
            if p == "/api/corregir":
                d = json.loads(cuerpo or b"{}")
                resp = str(d.get("respuesta", "")).strip()
                if len(resp.split()) < 8:
                    return self.enviar(400, {"error": "Escribí una respuesta un poco más completa antes de corregirla."})
                code, out = corregir(str(d.get("materia")), int(d.get("clase")), int(d.get("i")), resp[:6000], d.get("proveedor"))
                return self.enviar(code, out)
            m = re.match(r"^/api/progreso/([a-z0-9-]+)$", p)
            if m and materia_dir(m.group(1)):
                try:
                    guardar_progreso(m.group(1), json.loads(cuerpo or b"{}"))
                except OSError as e:
                    return self.enviar(500, {"error": f"No se pudo guardar el progreso ({e})"})
                return self.enviar(200, {"ok": True})
            m = re.match(r"^/api/resumen/([a-z0-9-]+)/(\d+)(/original)?$", p)
            if m:
                if m.group(3):
                    code, out = restaurar_resumen(m.group(1), m.group(2))
                else:
                    code, out = guardar_resumen(m.group(1), m.group(2), json.loads(cuerpo or b"{}").get("md", ""))
                return self.enviar(code, out)
            m = re.match(r"^/api/voz/lote/([0-9a-f]{16})/cancelar$", p)
            if m:
                if m.group(1) in LOTES:
                    LOTES[m.group(1)]["cancelado"] = True
                return self.enviar(200, {"ok": True})
            if p == "/api/voz/lote":
                d = json.loads(cuerpo or b"{}")
                slug = str(d.get("materia"))
                if not materia_dir(slug):
                    return self.enviar(404, {"error": "Materia no encontrada"})
                code, out = lote_voz(slug, list(d.get("textos") or []), d.get("voz"), d.get("motor"))
                return self.enviar(code, out)
            if p == "/api/voz":
                d = json.loads(cuerpo or b"{}")
                slug = str(d.get("materia"))
                if not materia_dir(slug):
                    return self.enviar(404, {"error": "Materia no encontrada"})
                code, out = voz(slug, d.get("texto", ""), d.get("voz"), d.get("motor"))
                return self.enviar(code, out)
            if p == "/api/explicar":
                d = json.loads(cuerpo or b"{}")
                code, out = explicar(str(d.get("materia")), int(d.get("clase")), d.get("texto", ""),
                                     d.get("pregunta", ""), d.get("historial"), d.get("proveedor"))
                return self.enviar(code, out)
            if p == "/api/repaso":
                d = json.loads(cuerpo or b"{}")
                code, out = repaso(str(d.get("materia")), int(d.get("clase")), list(d.get("items") or []), d.get("proveedor"))
                return self.enviar(code, out)
            if p == "/api/transcribir":
                code, out = transcribir(cuerpo, self.headers.get("Content-Type", ""))
                return self.enviar(code, out)
        except urllib.error.URLError as e:
            return self.enviar(502, {"error": f"No se pudo contactar al modelo: {e.reason}"})
        except (ValueError, KeyError, TypeError) as e:
            return self.enviar(502, {"error": f"El modelo devolvió algo inesperado ({e}). Probá de nuevo."})
        except subprocess.SubprocessError as e:
            return self.enviar(500, {"error": f"Falló la transcripción ({e})."})
        self.enviar(404, {"error": "No encontrado"})


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", CFG["puerto"]), Handler)
    print(f"Progreso guardado en {CFG['datos']}")
    print(f"Subte Estudio en http://127.0.0.1:{CFG['puerto']}  (corrector: {CFG['proveedor']} · {CFG['modelo'] if CFG['proveedor'] != 'gemini' else CFG['gemini_modelo']})")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
