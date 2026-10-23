#!/usr/bin/env python3
"""Extrae el texto de cada PDF de una carpeta a <carpeta>/txt/<nombre>.txt.

Usa pypdf si está instalado (pip install pypdf); si no, pdftotext (poppler).

    python3 scripts/extraer_texto.py materias/<slug>/fuentes
"""
import shutil
import subprocess
import sys
from pathlib import Path


def con_pypdf(pdf):
    import pypdf
    reader = pypdf.PdfReader(str(pdf))
    return "\n".join((p.extract_text() or "") for p in reader.pages)


def con_pdftotext(pdf):
    return subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    carpeta = Path(sys.argv[1])
    salida = carpeta / "txt"
    salida.mkdir(exist_ok=True)
    try:
        import pypdf  # noqa: F401
        extraer = con_pypdf
    except ImportError:
        if not shutil.which("pdftotext"):
            sys.exit("Instalá pypdf (pip install pypdf) o poppler (brew install poppler).")
        extraer = con_pdftotext
    for pdf in sorted(carpeta.glob("*.pdf")):
        texto = extraer(pdf)
        (salida / (pdf.stem + ".txt")).write_text(texto, encoding="utf-8")
        aviso = "  <- casi vacío, ¿es un escaneo?" if len(texto.strip()) < 200 else ""
        print(f"{pdf.name}: {len(texto)} caracteres{aviso}")


if __name__ == "__main__":
    main()
