"""Proceso de Kokoro (voz local). server.py lo lanza una vez con .venv-voces/bin/python y le pasa
un pedido por línea de stdin: {"texto", "voz", "salida"}. Responde "ok" o "error: ..." por línea.
El modelo se carga una sola vez, así que cada fragmento sale rápido."""
import json
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

DIR = Path(__file__).resolve().parent.parent / "voces" / "kokoro"
kokoro = Kokoro(str(DIR / "kokoro-v1.0.onnx"), str(DIR / "voices-v1.0.bin"))


def trozos(texto, largo=300):
    """Kokoro lee mejor frases cortas: parte por oraciones y las agrupa hasta ~largo caracteres."""
    out, cur = [], ""
    for o in re.split(r"(?<=[.!?:;])\s+", texto):
        if cur and len(cur) + len(o) > largo:
            out.append(cur)
            cur = ""
        cur = f"{cur} {o}".strip()
    return out + [cur] if cur else out


for linea in sys.stdin:
    try:
        p = json.loads(linea)
        audio, sr = [], 24000
        for t in trozos(p["texto"]):
            a, sr = kokoro.create(t, voice=p["voz"], speed=1.0, lang="es")
            audio.append(a)
        sf.write(p["salida"], np.concatenate(audio), sr)
        print("ok", flush=True)
    except Exception as e:  # noqa: BLE001
        print("error: " + str(e).replace("\n", " ")[:200], flush=True)
