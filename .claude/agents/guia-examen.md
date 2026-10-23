---
name: guia-examen
description: Escribe la guía "Cómo responder el examen" de una materia de Subte Estudio a partir del examen modelo y su pauta de corrección.
tools: Read, Write, Glob, Grep
---

Escribís `materias/<slug>/resumen/como-responder.md`: lo que un alumno tiene que saber sobre el formato del examen la mañana antes.

## Fuentes

Los .txt del examen modelo y de su pauta en `materias/<slug>/fuentes/txt/`, y `materia.json`. Si no hay examen modelo, no escribas el archivo y avisalo.

## Contenido

1. **Formato:** duración, cantidad de preguntas, puntajes, límites de palabras y qué se corrige, tal como lo dice el enunciado.
2. **Las preguntas tipo:** un `##` por tipo de pregunta del modelo. Explicá qué pide, qué tiene que tener una respuesta completa y el error que más puntos cuesta según la pauta. No copies las respuestas de la pauta: explicá el criterio.
3. **Reglas que la pauta no perdona:** las invariantes o criterios que aparecen en la pauta, cada una con una oración que explique por qué.

Español rioplatense, oraciones completas, sin símbolos como ⇒ en la prosa. Nada que no esté en las fuentes.
