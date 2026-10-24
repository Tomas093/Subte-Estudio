#!/usr/bin/env bash
# Instala las voces gratis para el lector de resúmenes:
#   - Microsoft (edge-tts): voces neuronales muy naturales, con acento argentino. Necesita internet.
#   - Kokoro: voz local muy natural (Dora, Alex, Santa). Anda sin internet; baja unos 350 MB.
#   - Piper: voz local con acento argentino. Anda sin internet.
# Todo queda dentro del proyecto (.venv-voces/ y voces/), fuera de git. No toca tu Python.
#
#     bash scripts/instalar_voces.sh
set -e
cd "$(dirname "$0")/.."

echo "1/4  Creando el entorno de voces en .venv-voces/ ..."
# Kokoro usa onnxruntime, que todavía no publica ruedas para el Python más nuevo: se fija 3.12 con uv.
if command -v uv >/dev/null; then uv venv --python 3.12 .venv-voces; else python3 -m venv .venv-voces; fi
.venv-voces/bin/python -m ensurepip -q 2>/dev/null || true

echo "2/4  Instalando edge-tts (Microsoft), kokoro-onnx (Kokoro) y piper-tts (Piper) ..."
if command -v uv >/dev/null; then
  uv pip install -q --python .venv-voces/bin/python edge-tts kokoro-onnx soundfile piper-tts
else
  .venv-voces/bin/python -m pip install --quiet edge-tts kokoro-onnx soundfile piper-tts
fi

echo "3/4  Bajando el modelo de Kokoro (unos 350 MB) ..."
mkdir -p voces/kokoro
base=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
for f in kokoro-v1.0.onnx voices-v1.0.bin; do
  [ -s "voces/kokoro/$f" ] || curl -fL -o "voces/kokoro/$f" "$base/$f" || echo "     No se pudo bajar $f; Kokoro no va a estar disponible."
done

echo "4/4  Bajando la voz argentina de Piper (unos 110 MB) ..."
mkdir -p voces
for v in ${PIPER_VOCES:-es_AR-daniela-high}; do
  .venv-voces/bin/python -m piper.download_voices --download-dir voces "$v" \
    || echo "     No se pudo bajar $v; Piper va a usar las otras voces que haya."
done

echo
echo "Listo. Reiniciá el servidor (Ctrl+C y python3 server.py), tocá 'Escuchar el resumen'"
echo "y elegí la voz en el menú de la barra de abajo."
