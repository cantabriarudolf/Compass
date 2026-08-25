## 1. Store (ST)

- [x] 1.1 Declarar esquemas/tipos `PlantillaCO`, `EnvioCO`, `MensajeBuzonCO`, `DocumentoCO` en schemas.ts y colecciones en `CompassData`; bump `STORE_VERSION` 13→14 con migrate aditivo
- [x] 1.2 Seed `data/comunidad/plantillas-co.ts` con las 5 plantillas NSGC (comunidad/urgente/cobranza/informacion/onboarding) y cablear en `seedData()`
- [x] 1.3 Implementar `savePlantillaCO`/`removePlantillaCO` (bloqueo si envíos referencian) + `saveDocumentoCO`/`removeDocumentoCO` (D1 anti data:/blob:) retornando `StoreResult`
- [x] 1.4 Implementar `saveEnvioCO` (FKs personas, snapshot destinatarios, sustitución variables por destinatario, loop `notify()`, evento `CO_SEND_MASSIVE`) + `registrarLecturaEnvioCO` idempotente
- [x] 1.5 Implementar `saveMensajeBuzonCO` (folio BUZ-*, estado inicial recibido, evento `CO_TICKET_CREATED`), `responderMensajeBuzonCO` (auto Recibido→En Gestión, evento), `cambiarEstadoBuzonCO`, `removeMensajeBuzonCO`
- [x] 1.6 Tests de store CO (envío con filtros/snapshot/D1/gate AD, plantillas FK, flujo completo buzón con folios únicos)

## 2. UI

- [x] 2.1 Crear `/comunidad/comunicacion/page.tsx` con tabs Redacción/Masivos · Plantillas · Buzón · Biblioteca + skeleton + rehydrated
- [x] 2.2 Compositor con selección de plantilla (autocompleta asunto/cuerpo), filtros combinables rol/macro/micro/unidad/persona, previsualización de destinatarios y envío
- [x] 2.3 Grilla de envíos con tasa de apertura + botón simular lectura
- [x] 2.4 CRUD de plantillas y biblioteca documental (alta por URL)
- [x] 2.5 Buzón: formulario ciudadano (clasificación en orden constructivo, privacidad Comité) + bandeja admin con respuestas/transiciones + vista directiva filtrada por `visibilidadComite`

## 3. Validación

- [x] 3.1 Lint + typecheck + suite verde completa
- [x] 3.2 openspec validate --changes sin errores
