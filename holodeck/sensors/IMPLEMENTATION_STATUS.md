# Sensores · Holocubierta funcional v1.0

Estado: **FUNCTIONAL TRAINING IMPLEMENTATION v1.0**

La Holocubierta implementa el modelo funcional de la consola de Sensores definido en `Videojuego_StarTrek`. No es una skin LCARS final: es la implementación operativa de referencia para entrenamiento y validación.

## Alcance cubierto

Las diez áreas funcionales están operativas:

1. Estado de sensores
2. Barridos
3. Búsqueda / localización
4. Contactos
5. Seguimiento
6. Lectura sensorial
7. Interferencias / compensación
8. Configuración
9. Resultados
10. Diagnóstico

El árbol actual contiene 76 funciones secundarias. Las acciones terminales del árbol y las 38 acciones contextuales tienen rutas de comportamiento implementadas.

## Motor de simulación

`sim_engine.js` separa el comportamiento de Sensores de la interfaz. Modela, entre otros:

- alcance, resolución, sensibilidad y duración;
- barridos pasivos y activos;
- filtros múltiples y prioridad;
- ámbito espacial de una operación;
- persistencia y confianza de contactos;
- búsquedas por clase o firma y falsos positivos;
- tracking normal, prioritario y por firma;
- capacidad limitada de seguimiento;
- recuperación de contactos perdidos;
- incertidumbre de lecturas y predicciones;
- interferencias, bandas y compensación;
- potencia dentro de la asignación y solicitudes a OPS;
- selección, integridad y calibración de matrices;
- diagnósticos y solicitudes a Ingeniería;
- resultados, lecturas guardadas, comparación y repetición;
- handoff de datos a Ciencia, Táctica, Operaciones, CONN, Mando y Ordenador.

Regla importante: repetir exactamente el mismo barrido bajo las mismas condiciones no aumenta mágicamente la información.

## Escenarios de entrenamiento

`data/scenarios.json` contiene escenarios deterministas de entrenamiento:

- Sector 041 · operación estándar
- Búsqueda y rescate
- Tráfico denso / capacidad de tracking
- Campo de interferencia
- Matriz degradada
- Contramedidas / jamming deliberado

En Modo Libre el escenario puede elegirse desde la cabecera. En Modo Profesor lo determina la práctica.

## Programa del profesor

`data/tutorials.json` contiene 25 prácticas en cinco niveles:

- Nivel 1 · Operador básico — 5 prácticas
- Nivel 2 · Operación normal — 5 prácticas
- Nivel 3 · Operación avanzada — 5 prácticas
- Nivel 4 · Incidencias — 5 prácticas
- Nivel 5 · Habilitación — 5 prácticas

Las prácticas empiezan con una orden verbal de un superior. Tras aceptarla, queda un resumen de **ORDEN EN CURSO** visible.

La ayuda disminuye con el nivel. En Nivel 5 se presenta la situación y se validan objetivos operativos sin mostrar una receta de botones.

## Separación de responsabilidades

Se mantiene la frontera funcional aprobada:

- Sensores mide, detecta, localiza y sigue.
- Ciencia interpreta fenómenos complejos.
- Táctica usa información de combate.
- OPS administra recursos generales y potencia adicional.
- Ingeniería repara hardware.
- CONN / Navegación resuelve navegación y rumbo de la nave.

## Límite deliberado

La Holocubierta usa un mundo de entrenamiento contenido en escenarios JSON. En el videojuego, el mismo tipo de operación deberá resolverse contra el universo autoritativo de CoreRPG. La interfaz no debe conocer información que el motor no haya permitido observar.

## Validación v1.0

Comprobaciones realizadas:

- sintaxis de `app.js`, `teacher_mode.js` y `sim_engine.js`: OK;
- 25 prácticas / 5 por nivel: OK;
- eventos de profesor referenciados por prácticas: 0 sin emisor;
- acciones terminales del árbol funcional: 0 sin implementación/referencia;
- 38 acciones contextuales: 0 sin implementación/referencia;
- batería de motor: 8/8:
  - repetición idéntica estable;
  - mejora al cambiar resolución;
  - sector equivocado sin ganancia mágica;
  - búsqueda de lanzadera;
  - límite de tracking;
  - compensación de interferencias;
  - frontera calibración/daño;
  - presupuesto de potencia de OPS.
