#!/usr/bin/env python3
"""Valida la estructura de una materia de Subte Estudio.

    python3 scripts/validar.py materias/<slug>
"""
import json
import re
import sys
from pathlib import Path


def norm(t):
    """Igual que norm() en app/app.js: así se compara el campo "donde" con los títulos del resumen."""
    t = re.sub(r"^#+\s*", "", str(t or ""))
    t = re.sub(r"\s+", " ", re.sub(r"[*`_]", "", t)).strip()
    return re.sub(r"[.:]$", "", t).lower()


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    d = Path(sys.argv[1])
    errores, avisos = [], []
    try:
        m = json.loads((d / "materia.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        sys.exit(f"materia.json ilegible: {e}")
    for campo in ("titulo", "fases", "clases"):
        if not m.get(campo):
            errores.append(f"falta '{campo}' en materia.json")
    fases = {f.get("id") for f in m.get("fases", [])}
    for f in m.get("fases", []):
        if not re.match(r"^#[0-9a-fA-F]{6}$", str(f.get("color", ""))):
            errores.append(f"fase {f.get('id')}: color debe ser #rrggbb")
    fecha = (m.get("examen") or {}).get("fecha", "")
    if fecha and not re.match(r"^\d{4}-\d{2}-\d{2}$", fecha):
        errores.append("examen.fecha debe ser AAAA-MM-DD")
    vistos = set()
    for c in m.get("clases", []):
        n = c.get("n")
        if n in vistos:
            errores.append(f"clase {n} repetida")
        vistos.add(n)
        if c.get("fase") not in fases:
            errores.append(f"clase {n}: fase {c.get('fase')} no existe")
        if c.get("apunte") and not (d / c["apunte"]).exists():
            avisos.append(f"clase {n}: no existe {c['apunte']}")
        nn = f"{int(n):02d}"
        r = d / "resumen" / f"clase{nn}.md"
        titulos = set()
        if not r.exists():
            avisos.append(f"clase {n}: falta resumen/clase{nn}.md")
        else:
            txt = r.read_text(encoding="utf-8")
            titulos = {norm(l) for l in txt.splitlines() if re.match(r"^#{1,4}\s", l)}
            if "⇒" in txt:
                avisos.append(f"clase {n}: el resumen usa '⇒' en la prosa")
        q = d / "preguntas" / f"clase{nn}.json"
        if not q.exists():
            avisos.append(f"clase {n}: falta preguntas/clase{nn}.json")
            continue
        try:
            qs = json.loads(q.read_text(encoding="utf-8"))
        except ValueError as e:
            errores.append(f"clase {n}: preguntas inválidas ({e})")
            continue
        ids = [p.get("id") for p in qs]
        if not all(ids):
            avisos.append(f"clase {n}: hay preguntas sin 'id' (el progreso se guarda por id; si falta se calcula del texto y cambia al editarlo)")
        if len(set(filter(None, ids))) != len(list(filter(None, ids))):
            errores.append(f"clase {n}: hay 'id' de preguntas repetidos")
        for i, p in enumerate(qs, 1):
            if not p.get("pregunta") or not p.get("referencia"):
                errores.append(f"clase {n} pregunta {i}: falta pregunta o referencia")
            if not p.get("claves"):
                avisos.append(f"clase {n} pregunta {i}: sin claves (el corrector será menos preciso)")
            if not p.get("donde"):
                avisos.append(f"clase {n} pregunta {i}: sin 'donde' (no tendrá el enlace \"Dónde se explica\")")
            elif titulos and norm(p["donde"]) not in titulos:
                errores.append(f"clase {n} pregunta {i}: 'donde' = \"{p['donde']}\" no es un título de resumen/clase{nn}.md")
    for a in avisos:
        print("aviso:", a)
    for e in errores:
        print("error:", e)
    print(f"{len(m.get('clases', []))} clases, {len(errores)} errores, {len(avisos)} avisos")
    sys.exit(1 if errores else 0)


if __name__ == "__main__":
    main()
