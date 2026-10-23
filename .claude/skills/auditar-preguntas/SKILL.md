---
name: auditar-preguntas
description: Revisa todas las preguntas de una materia de Subte Estudio contra los resúmenes y arregla las que no se pueden responder con el material (agrega la explicación al resumen o saca la pregunta), usando el agente auditor. Usalo cuando el usuario diga que una pregunta pide algo que no vio, que el resumen no explica, o pida revisar las preguntas.
---

# Auditar preguntas

1. Pedí el slug de la materia si no lo dio (`ls materias/`).
2. Corré `python3 scripts/validar.py materias/<slug>` para ver el estado inicial.
3. Repartí las clases en grupos de 2 o 3 y lanzá un agente `auditor` por grupo, en paralelo. Pasale a cada uno el slug, sus números de clase y cualquier pregunta concreta que el usuario haya marcado como imposible de responder (por ejemplo: "clase 1: la de propiedad de seguridad y de progreso").
4. Cuando terminen, corré de nuevo el validador: tiene que terminar sin errores y sin avisos de `donde`.
5. Verificá vos mismo las preguntas que marcó el usuario: abrí el resumen en la sección de su `donde` y confirmá que ahí está la respuesta, explicada claro.
6. Respondé con una tabla por clase (OK, resumen arreglado, reescritas, sacadas) y avisá que hay que recargar la página para ver los cambios. Las preguntas sacadas cambian de número: las respuestas guardadas de esa clase pueden quedar corridas.
