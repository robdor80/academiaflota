# Sensores v0.2 — Integración IA

## Principio

La IA **no ejecuta el juego**. Interpreta la intención del oficial y devuelve un contrato estructurado. El motor determinista valida y ejecuta las acciones.

```
Texto / voz
   ↓
Intérprete Gemini
   ↓
CommandPlan JSON
   ↓
Validador local
   ↓
Ejecutor de Sensores
   ↓
Motor determinista
   ↓
Resultado real
   ↓
Respuesta de la Computadora
```

Si falta una decisión humana, el flujo se detiene y pide una aclaración al oficial. La IA no puede inventar resultados, potencia, contactos, daños ni permisos.

## Entrada

La misma tubería admite:
- texto escrito;
- voz transcrita;
- en el futuro, audio directo mediante el adaptador Gemini.

El prototipo usa Web Speech Recognition cuando el navegador lo permite y entrega la transcripción al mismo intérprete que el texto.

## Endpoint Gemini

La web no debe contener una API key de Gemini en el repositorio ni en JavaScript público. La capa `ai_gateway.js` espera un endpoint seguro configurable:

```js
window.SENSOR_AI_CONFIG = {
  endpoint: "https://<backend-seguro>/starship/interpret",
  model: "<modelo-gemini>"
};
```

También puede configurarse temporalmente con:

```js
localStorage.setItem("sensorAI.endpoint", "https://<backend-seguro>/starship/interpret");
localStorage.setItem("sensorAI.model", "<modelo-gemini>");
```

El backend recibe un POST JSON con:
- `task`;
- `model`;
- `profileId`;
- `inputMode`;
- `text`;
- `context`;
- `instructions`;
- `contract`.

Debe responder directamente con un `CommandPlan` o con `{ "plan": <CommandPlan> }`.

## Contrato

Definido en `computer_contract.js`.

Ejemplo:

```json
{
  "version": "1.0",
  "intentSummary": "Mantener C-43 bajo vigilancia de firma warp",
  "needsClarification": false,
  "clarificationQuestion": null,
  "actions": [
    {
      "type": "track_signature",
      "contactId": "C-43",
      "signature": "warp",
      "priority": "priority"
    },
    {
      "type": "watch",
      "contactId": "C-43",
      "condition": "course_change",
      "threshold": 5
    }
  ]
}
```

## Contexto de nave

`app.js` construye el contexto real de Sensores y, si existe, añade el estado global de la nave mediante:

```js
window.STARSHIP_STATE_PROVIDER
```

Puede ser:
- una función que devuelve el estado;
- un objeto con `getState()`;
- un objeto con propiedad `state`.

Esto permite que la misma Computadora conozca en el futuro Ingeniería, energía, daños, soporte vital, tripulación, alertas, etc., sin acoplar Gemini a cada consola.

## Perfiles de computadora

Los perfiles Pike, Kirk y Picard usan el mismo contrato, pero con distinta autonomía:
- Pike: poca inferencia, una acción por orden.
- Kirk: contexto básico y secuencias cortas.
- Picard: contexto amplio, secuencias y vigilancias.

La diferencia tecnológica debe aplicarse en el validador y en el prompt, no solo en la apariencia.

## Fallback

Mientras Gemini no esté configurado, `ai_gateway.js` usa un intérprete local limitado. Sirve para probar toda la tubería y la UI, pero no pretende sustituir la comprensión real de lenguaje natural.
