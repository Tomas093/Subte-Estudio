TCP convierte una red que pierde, duplica y desordena paquetes en un flujo de bytes confiable entre dos programas.

## Abrir la conexión: el saludo en tres pasos

Antes de enviar datos, cliente y servidor acuerdan números de secuencia iniciales. El cliente manda SYN con su número, el servidor responde SYN-ACK con el suyo y confirma el del cliente, y el cliente confirma el del servidor con un ACK. Hacen falta tres mensajes porque cada lado tiene que saber que el otro recibió su número inicial.

## Confiabilidad: secuencias, ACK y retransmisión

Cada byte enviado tiene un número de secuencia. El receptor confirma con un ACK el siguiente byte que espera recibir. Si el emisor no recibe la confirmación antes de un tiempo de espera, retransmite. Con los números de secuencia el receptor descarta duplicados y reordena lo que llegó desordenado.

## Lo que cuesta

Esperar confirmaciones agrega latencia y la retransmisión puede repetir datos que en realidad sí habían llegado (si se perdió el ACK). TCP lo tolera porque el receptor descarta duplicados por número de secuencia.

## Dónde se equivoca la gente

Un ACK no significa que la aplicación procesó los datos: solo que TCP los recibió y los tiene en su buffer. Si la aplicación del otro lado se cae antes de leerlos, los datos confirmados se pierden igual.

## Para el examen

Las ideas que no se pueden olvidar: saludo en tres pasos para acordar secuencias, ACK acumulativo del próximo byte esperado, retransmisión por tiempo de espera y descarte de duplicados por número de secuencia.
