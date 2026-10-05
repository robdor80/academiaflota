# Academia de la Flota Estelar

Portal de consulta y estudio para el proyecto **Videojuego Star Trek**.

## v0.3.1 — Manual del Candidato y currículo oficial compartido con el juego

La web no simula la carrera del videojuego. Su función es permitir consultar, estudiar, practicar y hacer tests fuera del juego usando exactamente el mismo currículo y los mismos manuales.

### Organización académica

- Preparación para el acceso.
- Cadete de 4.ª clase — 3 trimestres.
- Cadete de 3.ª clase — 3 trimestres.
- Cadete de 2.ª clase — 3 trimestres y especialización.
- Cadete de 1.ª clase — 3 trimestres.

La estructura canónica se almacena en `data/curriculum.json`.

### Sensores

El Manual de Operador de Sensores se presenta en la estructura oficial del juego:

- Sensores I — Estado de sensores, Barridos, Búsqueda / Localización.
- Sensores II — Contactos, Seguimiento, Lectura sensorial, Interferencias / Compensación.
- Sensores III — Configuración, Resultados, Diagnóstico, Operaciones integradas.
- Introducción y material transversal permanecen disponibles como consulta complementaria.

Cada bloque muestra el ciclo académico:

`Teoría → Clase con instructor → Práctica con el sistema real → Evaluación continua`

### Filosofía

- El juego determina la carrera.
- La web permite estudiar esa misma Academia desde cualquier sitio.
- Ningún curso o materia queda bloqueado por el perfil.
- PDF, juego y web deben compartir nombres, materias, unidades, procedimientos, lore y terminología.
- El diseño visual es institucional y limpio; se han retirado los elementos LCARS.

### Perfiles

Los perfiles locales guardan únicamente progreso de estudio, prácticas y resultados de test. No forman parte de la partida del videojuego.

La sincronización opcional entre dispositivos utiliza Google Authentication y Cloud Firestore. Mientras Firebase no esté configurado, la web continúa en modo local. Configuración y migración: [FIREBASE_SETUP.md](FIREBASE_SETUP.md).

### Responsive

Diseñado y adaptado para:

- MSI Raider GE78 HX 14V — horizontal.
- Samsung Galaxy Tab S9+ — horizontal y vertical.
- Realme GT Neo 2 — vertical.


## Preparación para el acceso

La web incorpora el **Manual del Candidato v1.0** como material previo a la admisión.

Fuente canónica del videojuego:

`gameplay/careers/academy_path/access/candidate_manual_v1_0.md`

Repositorio fuente: `robdor80/Videojuego_StarTrek`.

En la web se estructura como:

- 00 — Antes de empezar
- ACC-01 — Federación y Flota Estelar
- ACC-02 — Cómo se organiza Starfleet
- ACC-03 — Vida a bordo de una nave
- ACC-04 — Tecnología básica de Starfleet
- ACC-05 — Principios del servicio en Starfleet
- Qué NO forma parte del temario de acceso
- Prepararse para la admisión

El contenido mostrado procede del manual aprobado; la interfaz no añade conocimientos externos al temario.
