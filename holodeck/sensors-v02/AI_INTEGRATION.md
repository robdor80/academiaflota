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

## Gemini y configuración personal

Este proyecto es de uso personal. La clave de Gemini no se publica en el repositorio. La aplicación usa Firebase Authentication con sesión persistente y recupera la configuración privada de la Computadora desde Firestore, en el espacio del UID autenticado.

La llamada a Gemini se realiza directamente desde el cliente autorizado. La misma configuración puede recuperarse desde Windows y Android iniciando sesión con la misma cuenta Google.

### Política de modelos

Modo **Auto económico**:

1. Gemini 3.5 Flash-Lite es el modelo normal.
2. Si devuelve HTTP 503, se espera 0,9 s y se reintenta una vez.
3. Solo si 3.5 sigue dando 503 se escala a Gemini 3.8 Flash.
4. 3.8 también dispone de un reintento ante 503.
5. Si ambos modelos fallan técnicamente, se usa el intérprete local como último recurso.
6. Si 3.5 devuelve un `CommandPlan` inválido, la Computadora intenta primero normalizar la intención con el intérprete local determinista. Si éste obtiene una única interpretación válida, se ejecuta sin usar 3.8.
7. Solo si el plan sigue siendo ambiguo o no representable se solicita aclaración al oficial; un fallo de contrato no consume automáticamente una llamada a 3.8.
8. El oficial puede seleccionar manualmente 3.5 o forzar 3.8.

Esta política protege la cuota reducida del modelo 3.8 y reserva su uso automático para indisponibilidad técnica persistente de 3.5.

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
