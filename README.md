# Academia de la Flota Estelar

Web de estudio inmersiva para el proyecto **Videojuego Star Trek**.

## v0.1

Primera versión funcional de la Academia:

- Interfaz LCARS/Starfleet Academy.
- HTML, CSS, JavaScript y datos separados.
- Responsive orientado a:
  - MSI Raider GE78 HX 14V — escritorio horizontal.
  - Samsung Galaxy Tab S9+ — horizontal y vertical.
  - Realme GT Neo 2 — móvil vertical.
- Móvil horizontal muestra aviso de reorientación.
- Catálogo inicial de Sistemas de Nave.
- Manual de Operador de Sensores v0.1 convertido desde el PDF fuente a contenido web estructurado.
- Índice navegable de 16 módulos.
- Progreso local por módulo mediante localStorage.
- Sin PDF embebido ni visor documental.

## Estructura

```text
/
├── index.html
├── css/
│   ├── base.css
│   ├── lcars.css
│   └── responsive.css
├── js/
│   └── app.js
└── data/
    └── sensores.json
```

El PDF es material fuente. La web representa su información como contenido nativo HTML/CSS/JS.
