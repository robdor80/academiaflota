# Academia de la Flota Estelar

Portal académico inmersivo y utilizable para el proyecto **Videojuego Star Trek**.

## v0.2.1 — acceso oficial y ajustes

- Portada de acceso rediseñada como portal oficial de la Academia.
- Insignia almacenada dentro del repositorio en `assets/img/starfleet-academy-insignia.png`.
- La portada muestra únicamente expedientes existentes.
- Crear e importar alumnos se traslada a un panel de **Ajustes**.
- Ajustes accesible desde la portada y desde el portal del cadete.
- Se mantiene la persistencia individual por alumno, prácticas, evaluaciones y exportación JSON.
- Responsive conservado para MSI Raider GE78 HX, Samsung Galaxy Tab S9+ y Realme GT Neo 2.

## Persistencia

Los expedientes se almacenan mediante `localStorage` y la sesión activa mediante `sessionStorage`. La exportación/importación JSON permite trasladarlos entre dispositivos.
