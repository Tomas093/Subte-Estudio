# Pendientes (pedidos del usuario)

Lista para no perder nada entre sesiones. Tachar con [x] al terminar.

- [x] **Devolución corta y objetiva del corrector.** Solo qué faltó y qué está mal, frases cortas, sin elogios ni relleno. Prompt con instrucciones explícitas de tono y largo.
- [x] **Vista de la corrección.** Arriba la nota; después "Te faltó" y "Está mal"; lo que sí cubriste queda plegado.
- [x] **"Dónde se explica".** Cada pregunta enlaza a la sección del resumen que la responde (campo `donde` = título exacto de la sección).
- [x] **Validador:** chequear que cada `donde` apunte a un título que exista en el resumen.
- [x] **Auditor de preguntas.** Agente que revisa cada pregunta contra el resumen de su clase: si lo que pide no está explicado claro (ej.: "diferencia entre propiedad de seguridad y de progreso" en clase 1, que solo está en una sección de profundización), agrega la explicación al resumen o saca la pregunta, y completa `donde`. Hecho: agente `auditor` y skill `auditar-preguntas`.
- [x] **Resumen final de la autoevaluación.** Al terminar todas las preguntas de una clase: en qué te equivocaste, qué reforzar y cómo (secciones del resumen para releer), personalizado con tus errores. Para leerlo después.
- [x] **Guía paso a paso de uso** "a prueba de boludos".

## Falta (solo en tu compu)

- [ ] **Correr el auditor sobre tu materia real.** La materia no está en git, así que no se puede revisar desde la nube. En Claude Code, en la carpeta del repo: "Usá el skill auditar-preguntas con la materia <slug>. En la clase 1, la pregunta de propiedad de seguridad y de progreso no se explica en ningún lado."
- [ ] **Probar el corrector nuevo con Gemini u Ollama de verdad.** Se probó con un modelo simulado; falta ver que el modelo real respete el largo y el tono.
