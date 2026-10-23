## Cómo se usa, paso a paso

### Antes de empezar (solo la primera vez)

1. Abrí la Terminal en la carpeta del proyecto (`cd Subte-Estudio`).
2. Copiá la configuración: `cp .env.example .env`.
3. Elegí el corrector abriendo `.env` con cualquier editor de texto:
   - **Gemini** (más preciso, se paga por uso): poné `SUBTE_PROVEEDOR=gemini` y pegá tu clave en `GEMINI_API_KEY=`. La clave se saca en aistudio.google.com, botón "Get API key".
   - **Ollama** (gratis, corre en tu compu): instalá Ollama, corré `ollama pull qwen3:30b` y dejá `SUBTE_PROVEEDOR=ollama`.
4. Guardá el archivo.

### Cada vez que vas a estudiar

1. En la Terminal, dentro de la carpeta: `python3 server.py`. No cierres esa ventana mientras estudiás.
2. Abrí el navegador en `http://127.0.0.1:8765`.
3. Fijate abajo de todo de la página: tiene que decir "Corrector: Gemini" o "Corrector: Ollama". Si dice "Corrector apagado", mirá "Si algo no anda" al final.

### Una estación (una clase)

Arriba está el mapa. La estación con el círculo negro es la que tenés abierta. Hacé los pasos en este orden y tildalos en la columna "Pasos en esta estación":

1. **Video** de la clase.
2. **Audio** de la clase.
3. **Resumen**: leelo entero. Es lo que te van a preguntar.
4. **Autoevaluación**: las preguntas de abajo del resumen.

Cuando tildás los cuatro pasos, la estación se pinta en el mapa.

### Cómo responder una pregunta

1. Escribí tu respuesta como en el examen (o tocá **Dictar** y hablá). Mínimo 8 palabras.
2. Tocá **Corregir**. Tarda unos segundos.
3. Leé la corrección:
   - **Nota** arriba (sobre 10) y si estuvo bien, a medias o mal.
   - **Te faltó**: lo que la respuesta tenía que decir y no dijiste. "a medias" quiere decir que lo nombraste pero incompleto.
   - **Está mal**: lo que dijiste que es incorrecto y cómo es en realidad.
   - **Lo que sí cubriste**: plegado; tocalo si lo querés ver.
   - **Dónde se explica**: te lleva a la sección del resumen que explica la respuesta. Leela antes de volver a intentar.
4. Si querés, tocá **Ver respuesta de referencia** para ver una respuesta de 10.
5. Si no tenés idea, tocá **No la sé**: te muestra la referencia y la anota para repasar.

Tu respuesta se guarda sola. Podés corregir de nuevo las veces que quieras.

### Cuando terminás todas las preguntas de la clase

Debajo de la última pregunta aparece **Resumen de tu autoevaluación**:

- Cuántas te salieron bien, a medias y mal.
- **Qué tenés que reforzar**: lo arma el corrector con tus errores de esa clase. Para cada tema dice qué fallaste, cómo es lo correcto y un ejercicio para fijarlo.
- **Releé estas secciones del resumen**: tocá cada una y te lleva directo.
- **Pregunta por pregunta**: qué te faltó en cada una y un botón para responderla de nuevo.

Se arma solo cuando calificaste todas. Una pregunta cuenta como calificada cuando la corregís, tocás uno de los botones de "¿Cómo te fue?" o tocás "No la sé". Si después mejorás respuestas, tocá **Rehacer** para actualizarlo.

### Para repasar

La pestaña **Para repasar** junta, de todas las clases, los resúmenes de errores y las preguntas que te salieron mal o a medias. La rutina que funciona:

1. Al otro día, abrí "Para repasar".
2. Leé el resumen de errores de la clase.
3. Tocá "Dónde se explica" y releé esa sección.
4. Tocá "Responder de nuevo" y respondé sin mirar.
5. Cuando una te sale "Bien", sale sola de la lista.

### Si una pregunta pide algo que nunca viste

Si una pregunta te pide algo que no está en el video, el audio ni el resumen, el problema es del material, no tuyo. Abrí Claude Code en la carpeta del proyecto y escribí:

> Usá el skill auditar-preguntas con la materia <nombre>. En la clase 1, la pregunta de propiedad de seguridad y de progreso no se explica en ningún lado.

El agente revisa todas las preguntas contra el resumen: si falta la explicación la agrega al resumen, y si el tema no está en el material saca la pregunta. Después recargá la página.

### Si algo no anda

- **"Corrector apagado"**: con Gemini, revisá que `GEMINI_API_KEY` esté en `.env` y reiniciá el servidor (Ctrl+C y `python3 server.py`). Con Ollama, abrí la app de Ollama y corré `ollama list` para ver que el modelo esté bajado.
- **No aparece el botón Dictar**: falta configurar whisper (ver el README).
- **La página no carga**: el servidor no está corriendo. Volvé a correr `python3 server.py`.
- **Cambiaron las preguntas y no se ven**: recargá la página (Cmd+R o F5).
- **Tu progreso** se guarda en este navegador. Si abrís otro navegador o modo incógnito, arrancás de cero.
