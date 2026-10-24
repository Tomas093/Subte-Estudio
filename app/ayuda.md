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

### Escuchar el resumen mientras lo leés

1. Arriba del resumen, tocá **Escuchar el resumen**. Abajo aparece una barra.
2. Arranca desde el primer párrafo que tenés en pantalla y resalta en amarillo lo que está leyendo. La página baja sola; si scrolleás vos, te deja tranquilo unos segundos.
3. **Tocá cualquier párrafo** para que lea desde ahí. Con los botones ◀◀ y ▶▶ vas al párrafo anterior o al siguiente.
4. **Velocidad**: de 0,8× a 1,5×.
5. **Voz** (menú de la barra). Hay cuatro opciones:
   - **Voz de Microsoft (gratis)**: la recomendada. Suena casi tan natural como Gemini, con acento argentino (Elena o Tomás), y **no gasta créditos ni pide clave**. Necesita internet.
   - **Voz local Piper (gratis, sin internet)**: voz argentina (Daniela) que se genera en tu compu. Un poco menos natural, pero anda sin conexión.
   - **Voz de Gemini (usa créditos)**: aparece si tenés `GEMINI_API_KEY`. Voces Kore, Charon, Aoede, Puck y otras.
   - **Voz del sistema**: la del navegador. Es la menos natural; en la Mac mejora si bajás una voz "Mejorada" o "Premium" en Ajustes del Sistema → Accesibilidad → Contenido leído → Voz del sistema → Gestionar voces.

   **Para tener las voces gratis** (una sola vez): en la Terminal, dentro de la carpeta del proyecto, corré `bash scripts/instalar_voces.sh`. Tarda unos minutos y baja unos 110 MB. Después reiniciá el servidor (Ctrl+C y `python3 server.py`). Queda todo dentro del proyecto; no toca tu Python.

   Con cualquiera de las tres primeras:
   - Apenas tocás "Escuchar", se prepara el audio de **toda la clase** en segundo plano, empezando por donde estás. La barra muestra "Preparando el audio de la clase: 12 de 40" y después "Audio de la clase listo".
   - **Preparar el audio de todas las clases** deja todo listo de una vez. Sigue aunque cierres el lector, mientras el servidor esté prendido.
   - Todo queda guardado en `cache/`: escuchar de nuevo no cuesta nada y arranca al instante. Si cambiás de voz, se regenera con la nueva.
   - La app recuerda la última voz que elegiste.
6. **Cerrar** apaga el lector.

Si una voz falla (por ejemplo, Microsoft sin internet o Gemini sin créditos), la barra lo dice y te ofrece probar con otra.

### Sacar del resumen lo que no te sirve

1. Arriba del resumen, tocá **Editar resumen**.
2. Al lado de cada párrafo, punto de lista y tabla aparece **Quitar**; al lado de cada título, **Quitar sección** (saca el título y todo lo que tiene abajo hasta el próximo título). Pasá el mouse por encima y se tacha en rojo lo que se va a borrar.
3. Se guarda solo al tocar. Si te equivocaste, **Deshacer**.
4. **Editar el texto** abre el resumen como texto para cambiar palabras o agregar algo. Es Markdown: `## Título`, `- punto`, `**negrita**`. Tocá **Guardar el texto**.
5. **Volver al original** deja el resumen como estaba antes de tu primera edición.
6. **Listo** sale del modo edición.

Si una sección es la que explica alguna pregunta ("Dónde se explica"), te avisa antes de quitarla. El original queda guardado en la carpeta `resumen/originales/` de la materia, y cada versión anterior en `resumen/versiones/` (las últimas 30 por clase).

### Si no entendés una parte: Explicame

1. Seleccioná con el mouse (o manteniendo apretado en el celular) la parte del resumen que no entendés.
2. Al lado aparecen dos botones. Tocá **Explicame**.
3. Se abre un panel con lo que seleccionaste y un campo para escribir **qué querés saber de esa parte**. Por ejemplo: "¿en qué se diferencia de la propiedad de progreso?" o "¿esto qué tiene que ver con los puertos?". Mandalo con **Enter** o con el botón (Shift+Enter hace un salto de línea).
   - Si lo dejás vacío y tocás **Explicar**, te da una explicación general.
   - O tocá una pregunta rápida: **Explicámelo más simple**, **Dame un ejemplo**, **¿Por qué es así?**, **¿Cómo lo escribo en el examen?**
4. La respuesta trae:
   - **la respuesta en una frase**, en negrita;
   - una **explicación** simple, que define cada término técnico;
   - un **ejemplo** concreto.
5. Podés seguir preguntando sobre lo mismo: recuerda lo que ya te explicó.
6. **Agregar a mis apuntes** copia la frase central a tus apuntes de la clase.

Explica usando el resumen de la clase. Si agrega algo que no está en el resumen, lo marca con "Fuera del resumen:"; tomalo con cuidado, porque no viene del material de la cátedra. Usa el mismo corrector que configuraste (Gemini u Ollama).

### Tomar apuntes

A la derecha del resumen, debajo de "Pasos en esta estación", está **Mis apuntes**: un lugar por clase para escribir lo esencial con tus palabras. En el celular es el botón **Mis apuntes** abajo a la derecha.

- Se guarda solo mientras escribís (dice "Guardado").
- **Seleccioná texto del resumen** y tocá **A mis apuntes**: lo copia como un punto nuevo. Después reescribilo más corto: escribirlo con tus palabras es lo que hace que te quede.
- Si empezás las líneas con `- ` se ven como lista.
- La pestaña **Mis apuntes** junta los de todas las clases para repasar antes del examen, y con **Descargar todo (.md)** te los llevás en un archivo.

### Cómo responder una pregunta

1. Escribí tu respuesta como en el examen. Mínimo 8 palabras. Para dictarla, tocá el **micrófono** y hablá: abajo aparece un recuadro con lo que va entendiendo, palabra por palabra (en gris lo que todavía está adivinando). Tocá el cuadradito para terminar. Si tenés whisper configurado, el texto final lo pasa en limpio whisper, que es más preciso.
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

### Para repasar (repaso espaciado)

Cada pregunta que te sale mal o a medias vuelve sola para que la respondas de nuevo:

1. **1 hora** después.
2. Si te sale bien, vuelve al **día siguiente**.
3. Si te sale bien de nuevo, a los **3 días**.
4. Y después a la **semana**. Si ahí también te sale bien, queda aprendida.

Si te sale mal en cualquier vuelta, arranca de nuevo desde 1 hora. Responderla bien antes de que le toque no la adelanta: tiene que pasar el tiempo.

Cómo usarlo:

1. Mirá la pestaña **Para repasar**: el número al lado (y en la pestaña del navegador) es cuántas te tocan ahora.
2. Tocá **Dónde se explica** y releé esa sección.
3. Tocá **Responder ahora**: se borra tu respuesta vieja para que la escribas de cero, sin mirar.
4. Corregila (o calificala con "¿Cómo te fue?"). Eso la reprograma sola.

Ahí también están los resúmenes de errores de cada clase.

### Si una pregunta pide algo que nunca viste

Si una pregunta te pide algo que no está en el video, el audio ni el resumen, el problema es del material, no tuyo. Abrí Claude Code en la carpeta del proyecto y escribí:

> Usá el skill auditar-preguntas con la materia <nombre>. En la clase 1, la pregunta de propiedad de seguridad y de progreso no se explica en ningún lado.

El agente revisa todas las preguntas contra el resumen: si falta la explicación la agrega al resumen, y si el tema no está en el material saca la pregunta. Después recargá la página.

### Si algo no anda

- **"Corrector apagado"**: con Gemini, revisá que `GEMINI_API_KEY` esté en `.env` y reiniciá el servidor (Ctrl+C y `python3 server.py`). Con Ollama, abrí la app de Ollama y corré `ollama list` para ver que el modelo esté bajado.
- **No aparece el micrófono**: tu navegador no reconoce voz y whisper no está configurado. Usá Chrome o Safari, o configurá whisper (ver el README).
- **El dictado en vivo y la privacidad**: lo que se ve mientras hablás lo reconoce el navegador; en Chrome eso pasa por los servidores de Google. El texto final, si usás whisper, se hace en tu compu.
- **La página no carga**: el servidor no está corriendo. Volvé a correr `python3 server.py`.
- **Cambiaron las preguntas y no se ven**: recargá la página (Cmd+R o F5).
- **Tu progreso** se guarda solo, en la carpeta `progreso/` del proyecto, y en `progreso/copias/` queda una copia por día (las últimas 14). No hace falta guardar nada a mano. Para recuperar un día anterior: con el servidor apagado, copiá el archivo de ese día de `progreso/copias/` a `progreso/<materia>.json`, borrá los datos del sitio en el navegador y volvé a abrir.
- **Usarlo en otra compu**: poné en `.env` la línea `SUBTE_DATOS=` con una carpeta de iCloud o Dropbox, y en las dos compus la misma.
