---
name: nueva-materia
description: Arma una materia nueva en Subte Estudio a partir de una carpeta de PDFs, usando los agentes del repo (ingestor, resumidor, preguntador, guia-examen). Usalo cuando el usuario pida preparar una materia, un parcial o un final nuevo.
---

# Nueva materia

Orquestás los agentes de `.claude/agents/` para convertir los PDFs de una materia en una ruta de estudio. Cada agente tiene sus propias reglas; vos coordinás y verificás.

## 1. Datos del usuario

Pedí, si no los dio: carpeta con los PDFs, nombre de la materia, slug (minúsculas con guiones), nombre y fecha del examen. Si el material está en un campus virtual, primero hay que descargarlo a una carpeta.

## 2. Ingesta

Lanzá el agente `ingestor` con la carpeta y el slug. Revisá su informe: clases detectadas, fases y PDFs ilegibles. Si algo no cierra, corregí `materia.json` antes de seguir.

## 3. Contenido, en paralelo

Repartí las clases en grupos de 2 o 3 y lanzá, por cada grupo, un agente que haga primero el trabajo de `resumidor` y después el de `preguntador` sobre esas clases. En paralelo, si hay examen modelo, lanzá `guia-examen`. Pasale a cada agente el slug, sus números de clase y cualquier pedido del usuario sobre el estilo.

## 4. Verificación

- Lanzá el agente `auditor` sobre todas las clases (en grupos de 2 o 3): revisa que cada pregunta se pueda responder con el resumen y completa `donde`.
- `python3 scripts/validar.py materias/<slug>` tiene que terminar sin errores.
- Leé al menos un resumen y tres preguntas de una clase de prioridad alta. Si hay símbolos telegráficos, afirmaciones que no están en las fuentes o claves vagas, devolvéselo al agente con el ejemplo concreto.

## 5. NotebookLM (opcional)

Si el usuario quiere videos y audios: crear un cuaderno, que el usuario arrastre los PDFs (la carga por script no funciona), generar por clase un video corto y un audio corto seleccionando solo los PDFs de esa clase, y copiar cada link (`<cuaderno>/artifact/<id>`, desde "Abrir en una pestaña nueva") a `video` y `audio` de cada clase en `materia.json`. La cuota diaria se renueva cada pocas horas: priorizá las clases de prioridad alta.

## 6. Plan por días

Con la fecha del examen y los días libres que diga el usuario, completá `plan` en `materia.json`: más tiempo para las clases de prioridad alta, el examen modelo completo uno o dos días antes y un día liviano antes del examen.

## 7. Cierre

Decile al usuario que corra `python3 server.py` y abra `http://127.0.0.1:8765/?m=<slug>`. Las materias quedan fuera de git (ver `.gitignore`): no las subas a un repo público.
