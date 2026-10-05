# Academia de la Flota Estelar

Portal académico inmersivo y utilizable para el proyecto **Videojuego Star Trek**.

## v0.2 — Portal institucional y perfiles de cadete

La Academia deja de plantearse como una consola de nave y pasa a funcionar como un portal académico oficial.

### Funcionalidad

- Acceso inicial de alumnado.
- Múltiples perfiles locales sin contraseña.
- Cada cadete conserva de forma independiente:
  - módulos estudiados;
  - prácticas realizadas y respuestas escritas;
  - intentos y notas de evaluación.
- Exportación e importación de perfiles en JSON.
- Diseño institucional Starfleet Academy, limpio y sobrio.
- Insignia de la Academia en el acceso y cabecera.
- Plan de estudios.
- Manual completo de Operaciones de Sensores v0.1.
- Seis prácticas basadas en los ejercicios oficiales del manual.
- Evaluación teórica de Sensores de 10 preguntas, con aprobado al 80 %.
- Expediente académico individual.
- Responsive para PC, tablet horizontal/vertical y móvil vertical.

### Persistencia

Los perfiles se almacenan mediante localStorage y la sesión activa mediante sessionStorage. El JSON exportable permite copia de seguridad y traslado entre dispositivos.

### Estructura

- index.html
- css/base.css
- css/academy.css
- css/responsive.css
- js/app.js
- js/storage.js
- js/study.js
- js/evaluation.js
- data/sensores.json
- data/practicas-sensores.json
- data/evaluacion-sensores.json

El PDF de Sensores no se publica ni se incrusta: actúa únicamente como fuente del contenido académico.
