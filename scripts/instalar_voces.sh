#!/usr/bin/env bash
# Instala las voces gratis para el lector de resúmenes:
#   - Microsoft (edge-tts): voces neuronales muy naturales, con acento argentino. Necesita internet.
#   - Piper: voz local con acento argentino. Anda sin internet.
# Todo queda dentro del proyecto (.venv-voces/ y voces/), fuera de git. No toca tu Python.
#
#     bash scripts/instalar_voces.sh
set -e
cd "$(dirname "$0")/.."

echo "1/3  Creando el entorno de voces en .venv-voces/ ..."
python3 -m venv .venv-voces
.venv-voces/bin/python -m pip install --quiet --upgrade pip

echo "2/3  Instalando edge-tts (Microsoft) y piper-tts (Piper) ..."
.venv-voces/bin/python -m pip install --quiet edge-tts piper-tts

echo "3/3  Bajando la voz argentina de Piper (unos 110 MB) ..."
mkdir -p voces
for v in ${PIPER_VOCES:-es_AR-daniela-high}; do
  .venv-voces/bin/python -m piper.download_voices --download-dir voces "$v" \
    || echo "     No se pudo bajar $v; Piper va a usar las otras voces que haya."
done

echo
echo "Listo. Reiniciá el servidor (Ctrl+C y python3 server.py), tocá 'Escuchar el resumen'"
echo "y elegí la voz en el menú de la barra de abajo."
