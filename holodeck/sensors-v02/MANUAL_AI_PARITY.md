# Sensores — Matriz de paridad Manual ↔ Computadora IA

Status: **READY FOR GEMINI REVIEW v0.1**

## Regla de diseño

La v0.2 no replica la navegación de la v0.1.

La paridad exigida es **paridad de capacidad**, no paridad de botones:

- si la v0.1 puede consultar un dato, la Computadora debe poder consultarlo;
- si la v0.1 puede producir un cambio real, el `CommandPlan` debe disponer de una acción estructurada equivalente;
- si una opción de v0.1 solo abre otra pantalla o limpia un formulario, no necesita una acción IA propia;
- si una acción exige juicio del oficial, la Computadora puede preparar/proponer pero debe detenerse antes de decidir por él.

La IA interpreta. El motor determinista ejecuta.

---

## 1. Estado de sensores

| Manual v0.1 | Computadora v0.2 | Contrato |
|---|---|---|
| Estado general | «Dame el estado de sensores» | `status(sensors)` / `query(status)` |
| Matrices disponibles | «¿Qué matrices tengo disponibles?» | `query(arrays)` |
| Alcance efectivo | «¿Qué alcance efectivo tenemos?» | `query(effective_range)` |
| Resolución disponible | «¿Qué resolución podemos obtener?» | `query(resolution)` |
| Potencia asignada | «¿Cuánta potencia tienen los sensores?» | `query(power)` |
| Integridad / daños | «Informe de integridad de matrices» | `query(integrity)` |
| Interferencias detectadas | «¿Qué interferencias tenemos?» | `query(interference)` |
| Operaciones activas | «¿Qué operaciones de sensores están en marcha?» | `query(active_operations)` |

No se crea navegación artificial para estas consultas.

---

## 2. Barridos

| Manual v0.1 | Orden natural | Contrato |
|---|---|---|
| Corto alcance | «Barrido de corto alcance» | `scan(short_range)` |
| Largo alcance | «Barrido de largo alcance del sector 041» | `scan(long_range)` |
| Focalizado | «Analiza C-43 con un barrido focalizado» | `scan(focused)` |
| Modo pasivo/activo | «...sin usar sensores activos» / «...modo activo» | `scan.mode` |
| Área / objetivo | «...sector 041» / «...C-43» | `scan.target/contactId` |
| Resolución | «...en alta resolución» | `scan.resolution` |
| Prioridad | «...prioriza subespacio» | `scan.priority` |
| Duración | «...prolonga la integración» | `scan.duration` |
| Filtros | «...solo warp y subespacio» | `scan.filters[]` |
| Revisar configuración | «¿Qué vas a hacer exactamente?» | previa del `CommandPlan`; no muta estado |
| Restaurar valores del formulario | No requiere orden de juego | UI local; no es capacidad del motor |
| Cancelar operación | «Cancela el barrido actual» | `cancel_operation` |

La v0.2 puede ocultar todos estos parámetros salvo cuando el oficial pide verlos o modificarlos.

---

## 3. Búsqueda / localización

Todos los tipos manuales tienen equivalente `search`:

- nave → `starship`
- lanzadera → `shuttle`
- sonda / baliza → `probe_beacon`
- forma de vida → `lifeform`
- objeto artificial → `artificial_object`
- fuente de energía → `energy_source`
- firma warp → `warp_signature`
- emisión subespacial → `subspace_emission`
- señal / transpondedor → `signal_transponder`
- radiación / partículas → `radiation_particle`
- firma definida → `custom_signature`

Parámetros disponibles:
- área;
- sensibilidad;
- resolución;
- criterio adicional.

Ejemplo:

> «Busca cualquier baliza artificial débil en el sector 041 con sensibilidad alta.»

Gemini debe producir una sola acción `search`; el motor determina lo encontrado.

---

## 4. Contactos

Las pestañas de v0.1 pasan a ser consultas:

| Manual | Computadora |
|---|---|
| Todos | `query(contacts, all)` |
| No identificados | `query(contacts, unidentified)` |
| Identificados | `query(contacts, identified)` |
| Marcados | `query(contacts, marked)` |
| Perdidos recientemente | `query(contacts, lost)` |

Acciones contextuales disponibles sobre un contacto:

- barrido focalizado / alta resolución → `scan`;
- iniciar seguimiento → `track_start`;
- finalizar seguimiento → `track_stop`;
- prioridad normal/prioritaria → `track_priority`;
- marcar/desmarcar → `mark`;
- lectura sensorial → `readout`;
- comparar lecturas → `compare_results`;
- guardar lectura → `save_result`;
- transferir a Ciencia/Táctica/Mando → `transfer`;
- solicitar potencia → `power_request`.

---

## 5. Seguimiento

| Manual v0.1 | Contrato |
|---|---|
| Contactos seguidos / capacidad | `query(tracking)` |
| Fijar contacto | `track_start` |
| Seguimiento múltiple | varias acciones `track_start/stop/priority` validadas como plan |
| Seguir firma concreta | `track_signature` |
| Actualizar posición | `track_update(position)` |
| Estimar rumbo | `track_update(course)` |
| Estimar velocidad | `track_update(velocity)` |
| Predecir trayectoria | `track_update(trajectory)` |
| Recuperar contacto perdido | `track_update(reacquire)` |

### Conflicto de capacidad

La Computadora **no puede expulsar silenciosamente otro seguimiento**.

Si una orden excede capacidad:
1. el motor rechaza;
2. la Computadora explica el conflicto;
3. presenta opciones;
4. el oficial decide qué seguimiento liberar/rebajar.

### Vigilancias automáticas v0.2

Añadidas sobre la capacidad manual:

- cambio de rumbo;
- caída de confianza;
- contacto perdido.

Contrato: `watch`.

La disponibilidad depende de la generación de computadora.

---

## 6. Lectura sensorial

Todos los tipos manuales se resuelven mediante `readout(contactId, readout)`:

- intensidad de señal;
- tipo de firma;
- banda / frecuencia;
- firma energética;
- firma subespacial;
- masa aproximada;
- dimensiones aproximadas;
- vector / velocidad;
- formas de vida detectables;
- coincidencia con patrones conocidos.

Ejemplo:

> «Computadora, dame masa, dimensiones y formas de vida de C-43.»

Una computadora capaz de encadenar acciones puede devolver tres `readout` en un plan.

---

## 7. Interferencias / compensación

| Manual v0.1 | Contrato |
|---|---|
| Estado/tipo | `query(interference)` |
| Compensación automática | `interference(automatic)` |
| Ajuste manual | `interference(manual)` |
| Cambiar banda | `interference(band)` |
| Aumentar potencia de operación | `interference(operation_power)` |
| Reducir resolución | `interference(reduce_resolution)` |
| Prolongar integración | `interference(extend_integration)` |
| Recuperar señal | `interference(recover_signal)` |
| Restaurar compensación anterior | `interference(restore)` |

La IA puede elegir ajustes rutinarios **solo dentro de las reglas del perfil de computadora y de una orden suficientemente abierta**. Si implica sacrificar recursos de otra sección, debe solicitar autorización.

---

## 8. Configuración

`apply_config` cubre todos los ajustes persistentes de v0.1:

- `sensitivity`;
- `default_resolution`;
- `sensor_power`;
- `sensor_array`;
- `band_frequency`;
- `update_rate`;
- `default_filters`;
- `default_priorities`.

Además:

| Manual | Contrato |
|---|---|
| Restaurar estándar de nave | `restore_standard` |
| Cargar perfil | `load_profile` |
| Guardar perfil propio | `save_profile` |
| Eliminar perfil propio | `delete_profile` |
| Listar perfiles | `query(profiles)` |

Los perfiles protegidos de Starfleet siguen protegidos por el motor.

---

## 9. Resultados e historial

| Manual v0.1 | Contrato |
|---|---|
| Operación actual | `query(active_operations)` |
| Último barrido | `query(results, last)` |
| Resultados recientes | `query(results, recent)` |
| Lecturas guardadas | `query(results, saved)` |
| Guardar lectura | `save_result` |
| Comparar lecturas | `compare_results` |
| Repetir operación | `repeat_operation` |
| Editar antes de repetir | `repeat_operation.overrides` |

Ejemplo:

> «Repite el último barrido pero usa alta resolución.»

Debe convertirse en `repeat_operation` con un override, no en una invención de un nuevo resultado.

---

## 10. Diagnóstico

| Manual v0.1 | Contrato |
|---|---|
| Autodiagnóstico | `diagnostic(all)` |
| Estado por matriz | `query(arrays)` / `diagnostic(array)` |
| Calibración | `calibrate` |
| Rendimiento | `query(diagnostics)` + estado real |
| Errores / degradación | `query(diagnostics)` |
| Solicitar soporte de Ingeniería | `engineering_request` |
| Seleccionar matriz alternativa | `select_array` |

El diagnóstico produce datos deterministas; Gemini solo los traduce y explica.

---

## 11. Potencia e interconsola

| Manual v0.1 | Contrato |
|---|---|
| Solicitar potencia adicional | `power_request` |
| Cancelar solicitud pendiente | `power_release(cancel_pending)` |
| Devolver potencia concedida | `power_release(release_granted)` |
| Enviar a Ciencia | `transfer(science)` |
| Enviar a Táctica | `transfer(tactical)` |
| Enviar a Mando | `transfer(command)` |
| Soporte Ingeniería | `engineering_request` |

La respuesta de otro departamento no la inventa Gemini: debe provenir del sistema/NPC/interconsola autorizado.

---

## 12. Operaciones que NO necesitan acción IA propia

Estas acciones existen en v0.1 por necesidades de interfaz, pero no son capacidades de juego independientes:

- abrir un menú;
- volver a una pantalla;
- limpiar un campo de formulario;
- abrir un resultado;
- abrir configuración;
- editar un formulario antes de ejecutar;
- revisar configuración visualmente.

En v0.2 se sustituyen por:
- conversación;
- consulta contextual;
- vista de detalles técnicos;
- modificación de parámetros del `CommandPlan`.

---

## 13. Qué puede decidir automáticamente la Computadora

### Siempre rutinario

Puede:
- rellenar parámetros derivados de una orden explícita;
- elegir la ruta interna necesaria;
- ejecutar secuencias puramente procedimentales;
- consultar estado;
- presentar resultados;
- mantener vigilancias permitidas.

### Requiere límites de perfil

Puede, según Pike/Kirk/Picard:
- inferir «esa nave»;
- reutilizar el sector actual;
- encadenar varias acciones;
- escoger parámetros técnicos estándar;
- crear vigilancias;
- sugerir alternativas.

### Siempre vuelve al oficial

Debe preguntar antes de:
- abandonar un seguimiento para liberar capacidad;
- sacrificar potencia de otro sistema;
- activar una emisión detectable si la orden/standing orders lo prohíben;
- seleccionar un objetivo ambiguo;
- contradecir una orden superior;
- ejecutar una acción fuera de la autoridad del puesto;
- elegir entre consecuencias tácticas/éticas relevantes.

---

## 14. Criterio de cierre antes de Gemini

La integración de Gemini no debe comenzar hasta que:

1. toda capacidad manual con efecto real tenga acción de contrato;
2. todas las consultas manuales tengan `query/status/readout`;
3. el ejecutor v0.2 pueda ejecutar cada acción sin intervención de Gemini;
4. la validación impida acciones desconocidas o fuera de capacidad;
5. los conflictos vuelvan al oficial;
6. texto y voz utilicen exactamente el mismo contrato;
7. la v0.1 permanezca disponible como consola manual y referencia técnica.

La API real de Gemini solo sustituirá la interpretación local. **No cambiará el contrato ni el motor.**
