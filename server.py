#!/usr/bin/env python3
"""Subte Estudio: servidor local de la ruta de estudio.

Sirve la app, las materias de la carpeta materias/, corrige respuestas escritas
con un modelo local (Ollama) o con Gemini, y transcribe respuestas dictadas con
whisper.cpp. Solo usa la biblioteca estándar de Python.

    python3 server.py            # http://127.0.0.1:8765
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP = ROOT / "app"
MATERIAS = ROOT / "materias"
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
    "whisper_bin": os.environ.get("WHISPER_BIN", "whisper-cli"),
    "whisper_modelo": os.path.expanduser(os.environ.get("WHISPER_MODELO", "")),
    "whisper_idioma": os.environ.get("WHISPER_IDIOMA", "es"),
    "puerto": int(os.environ.get("PUERTO", "8765")),
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

# ---------------------------------------------------------------- corrección

ESQUEMA = {
    "type": "object",
    "properties": {
        "claves": {"type": "array", "items": {"type": "object", "properties": {
            "n": {"type": "integer"}, "estado": {"type": "string", "enum": ["presente", "parcial", "ausente"]},
            "comentario": {"type": "string"}}, "required": ["n", "estado"]}},
        "errores": {"type": "array", "items": {"type": "string"}},
        "devolucion": {"type": "string"},
    },
    "required": ["claves", "errores", "devolucion"],
}


def prompt_correccion(m, q, respuesta):
    claves = q.get("claves") or []
    lista = "\n".join(f"{k + 1}. {c}" for k, c in enumerate(claves)) or "1. Cubre las ideas centrales de la respuesta de referencia."
    errores = "\n".join(f"- {e}" for e in q.get("errores") or []) or "- (ninguno listado)"
    reglas = m.get("reglas_correccion", "")
    return f"""Sos corrector de examen de la materia {m.get('titulo', '')}. Tu trabajo es verificar, no opinar.
Para cada PUNTO CLAVE decidí si la respuesta del alumno lo contiene:
- "presente": lo dice con sus palabras y sin errores.
- "parcial": lo menciona pero incompleto, vago o con una imprecisión.
- "ausente": no aparece.
Después listá en "errores" solo afirmaciones del alumno que sean técnicamente incorrectas o que contradigan las reglas de la cátedra o los errores frecuentes listados. No inventes errores: si no hay, devolvé [].
Juzgá el contenido, no la redacción ni la ortografía. Un sinónimo correcto cuenta.
La "devolucion" son 2 o 3 oraciones en español rioplatense neutro (sin "che" ni muletillas), en segunda persona. Si todos los puntos están presentes y no hay errores, decíselo y sumá como mucho un detalle para pulir. Si no, decí qué le faltó o qué está mal y cómo mejorarlo, sin repetir lo que ya hizo bien.

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

Respondé solo con JSON: {{"claves":[{{"n":1,"estado":"presente|parcial|ausente","comentario":"breve"}}],"errores":["..."],"devolucion":"..."}}"""


def http_json(url, body, headers=None, timeout=240):
    req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def llamar_modelo(prompt, proveedor):
    if proveedor == "gemini":
        if not CFG["gemini_key"]:
            raise RuntimeError("Falta GEMINI_API_KEY en .env")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{CFG['gemini_modelo']}:generateContent"
        r = http_json(url, {"contents": [{"parts": [{"text": prompt}]}],
                            "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}},
                      {"x-goog-api-key": CFG["gemini_key"]})
        return r["candidates"][0]["content"]["parts"][0]["text"]
    r = http_json(CFG["ollama"] + "/api/chat", {
        "model": CFG["modelo"], "stream": False, "think": False, "format": ESQUEMA,
        "options": {"temperature": 0}, "messages": [{"role": "user", "content": prompt}]})
    return r["message"]["content"]


def parse_json(txt):
    txt = txt.strip()
    try:
        return json.loads(txt)
    except ValueError:
        a, b = txt.find("{"), txt.rfind("}")
        return json.loads(txt[a:b + 1])


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
        detalle.append({"texto": texto, "estado": estado, "comentario": str(c.get("comentario", ""))[:240]})
    errores = [str(e)[:300] for e in data.get("errores", []) if str(e).strip()][:4]
    cobertura = puntos / len(claves)
    puntaje = round(10 * cobertura - 2 * len(errores))
    puntaje = max(0, min(10, puntaje))
    if errores:
        veredicto = 1 if cobertura >= 0.8 else 0
    else:
        veredicto = 2 if cobertura >= 0.8 else 1 if cobertura >= 0.45 else 0
    return 200, {"veredicto": veredicto, "puntaje": puntaje, "claves": detalle, "errores": errores,
                 "devolucion": str(data.get("devolucion", ""))[:800],
                 "modelo": CFG["gemini_modelo"] if proveedor == "gemini" else CFG["modelo"]}

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
    st["corrector"] = (st["proveedor"] == "gemini" and st["gemini"]) or (st["proveedor"] != "gemini" and st["modelo_disponible"])
    return st

# ---------------------------------------------------------------- HTTP

TIPOS = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".json": "application/json", ".pdf": "application/pdf", ".svg": "image/svg+xml", ".png": "image/png"}


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
        if not path.is_file() or not (str(path).startswith(str(APP)) or str(path).startswith(str(MATERIAS))):
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
    print(f"Subte Estudio en http://127.0.0.1:{CFG['puerto']}  (corrector: {CFG['proveedor']} · {CFG['modelo'] if CFG['proveedor'] != 'gemini' else CFG['gemini_modelo']})")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
