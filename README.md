# Subte Estudio

Una ruta de estudio para preparar un parcial o un final, armada como una línea de subte: cada clase es una estación, cada bloque temático es una línea de color y la terminal es el examen. En cada estación tenés el video y el audio de la clase, un resumen escrito a fondo y una autoevaluación de preguntas de casos que respondés por escrito o dictando, y que corrige un modelo de lenguaje que corre en tu compu.

El contenido de cada materia (resúmenes, preguntas, plan) lo arman agentes de Claude Code a partir de los PDFs de la cátedra. El motor es el mismo para cualquier materia.

![Estación abierta de la materia de ejemplo](docs/captura.png)

## Qué hace

- **Recorrido:** diagrama de la red con las estaciones completas, la actual y la próxima. Cada estación tiene cuatro pasos: video, audio, resumen y autoevaluación.
- **Autoevaluación:** preguntas de casos con respuesta de referencia y puntos clave. La respuesta de referencia no se muestra hasta que escribís al menos ocho palabras o marcás "No la sé".
- **Corrección local:** el corrector marca cada punto clave como presente, parcial o ausente, detecta errores contra las reglas de la cátedra y te da una devolución. Por defecto usa [Ollama](https://ollama.com) con un modelo local; también puede usar Gemini.
- **Dictado:** grabás tu respuesta con el micrófono y [whisper.cpp](https://github.com/ggml-org/whisper.cpp) la transcribe en tu compu.
- **Horario:** plan por días hasta el examen.
- **Terminal:** material general, examen modelo y la guía de cómo responder.
- **Para repasar:** junta las preguntas que no sabías o sabías a medias.

El progreso y tus respuestas se guardan en el navegador.

## Requisitos

- Python 3.9 o más nuevo (el servidor no usa dependencias externas).
- Para corregir: [Ollama](https://ollama.com) y un modelo. Con 32 GB de RAM o más, `qwen3:30b` corrige bien; con menos memoria probá `qwen3:14b` o `qwen3:8b`. Los modelos chicos (por ejemplo `qwen2.5:7b`) aprueban respuestas incorrectas: en una prueba le pusieron 6 sobre 10 a una respuesta que decía lo contrario de la referencia.
- Para dictar: `whisper-cli` y `ffmpeg` (`brew install whisper-cpp ffmpeg`) y un modelo ggml de whisper, por ejemplo `ggml-large-v3-turbo-q5_0.bin`.
- Para armar materias nuevas: [Claude Code](https://claude.com/claude-code) y, para extraer texto de PDFs, `pip install pypdf` o `brew install poppler`.

## Uso

```bash
git clone https://github.com/Tomas093/Subte-Estudio.git
cd Subte-Estudio
cp .env.example .env          # ajustá el modelo y la ruta de whisper
ollama pull qwen3:30b
python3 server.py
```

Abrí `http://127.0.0.1:8765`. Si tenés varias materias, elegís cuál en el selector de arriba o con `?m=<slug>`.

### Configuración (`.env`)

| Variable | Para qué |
|---|---|
| `SUBTE_PROVEEDOR` | `ollama` (local) o `gemini` |
| `SUBTE_MODELO` | Modelo de Ollama, por defecto `qwen3:30b` |
| `GEMINI_API_KEY`, `GEMINI_MODELO` | Solo si usás Gemini; se cobra por uso según la tarifa de Google |
| `WHISPER_MODELO` | Ruta al modelo ggml de whisper.cpp |
| `WHISPER_IDIOMA` | Idioma del dictado, por defecto `es` |
| `PUERTO` | Puerto del servidor, por defecto 8765 |

## Armar una materia nueva con agentes

Abrí Claude Code en la carpeta del repo y pedile algo como:

> Usá el skill nueva-materia para armar Bases de Datos con los PDFs de ~/Descargas/bd. El parcial es el 12/11.

El skill [`nueva-materia`](.claude/skills/nueva-materia/SKILL.md) coordina estos agentes:

| Agente | Qué hace |
|---|---|
| [`ingestor`](.claude/agents/ingestor.md) | Copia los PDFs, extrae el texto, detecta clases y fases, y escribe `materia.json` |
| [`resumidor`](.claude/agents/resumidor.md) | Escribe el resumen de cada clase: cada tema con el problema, el mecanismo, un ejemplo, el costo y el error típico |
| [`preguntador`](.claude/agents/preguntador.md) | Escribe de 8 a 12 preguntas de casos por clase con referencia, puntos clave y errores que invalidan |
| [`guia-examen`](.claude/agents/guia-examen.md) | Escribe "Cómo responder el examen" a partir del examen modelo y su pauta |

Los videos y audios por clase se generan aparte en NotebookLM y se enlazan en `materia.json`; el skill explica cómo.

## Estructura de una materia

```
materias/<slug>/
  materia.json              clases, fases, examen, plan, enlaces, reglas de corrección
  resumen/claseNN.md        resumen de cada clase
  resumen/como-responder.md guía del examen (opcional)
  preguntas/claseNN.json    [{pregunta, referencia, claves[], errores[]}]
  fuentes/                  PDFs de la cátedra y su texto en fuentes/txt/
```

`python3 scripts/validar.py materias/<slug>` revisa que todo esté completo. [`materias/ejemplo`](materias/ejemplo) es una materia mínima inventada para probar el motor.

## Privacidad

Las materias reales quedan fuera de git (`.gitignore` ignora todo `materias/` salvo el ejemplo): el material de la cátedra no se sube. El servidor escucha solo en `127.0.0.1`. Con Ollama, tus respuestas no salen de tu compu; con Gemini, se envían a Google.
