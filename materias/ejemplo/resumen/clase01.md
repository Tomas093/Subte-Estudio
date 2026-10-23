Esta clase arma el mapa con el que se explica el resto de la materia: qué hace cada capa de la red y cómo un mensaje viaja envuelto en varias cabeceras.

## Por qué hay capas

Mandar un mensaje de una computadora a otra resuelve muchos problemas distintos a la vez: convertir bits en señales, llegar a la máquina correcta del otro lado del mundo y entregarle los datos al programa correcto. Si un solo componente hiciera todo, cambiar el cable obligaría a reescribir el navegador. Las capas separan esos problemas: cada una le ofrece un servicio a la de arriba y usa el de la de abajo, sin conocer sus detalles.

## Encapsulamiento

Cuando una aplicación envía datos, cada capa le agrega su propia cabecera antes de pasarlos hacia abajo: el transporte agrega puertos, la red agrega direcciones IP y el enlace agrega direcciones físicas. Del otro lado, cada capa lee y quita la cabecera que le corresponde. Por eso un router puede reenviar un paquete leyendo solo la cabecera IP, sin entender qué aplicación lo mandó.

## Dónde se equivoca la gente

Se suele creer que el router "ve" la conexión TCP. En realidad un router trabaja en la capa de red: mira direcciones IP y no sabe nada de conexiones ni de puertos.

## Para el examen

Cuando expliques un problema de red, decí primero en qué capa ocurre y qué cabecera interviene.
