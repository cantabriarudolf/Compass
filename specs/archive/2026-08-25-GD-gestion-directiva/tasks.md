## 1. Store (ST)

- [x] 1.1 Declarar tipos `ActaGD`/`AdjuntoReferencia` y colección `actasGD` en `CompassData`; bump `STORE_VERSION` 12→13 con migrate aditivo
- [x] 1.2 Implementar `saveActaGD`/`removeActaGD` (FK asistentes a personas directivas, D1 anti-base64 en adjuntos, `StoreResult`) + eventos `GD_ACTA_CREATED`/`GD_ASISTENCIA_REG`
- [x] 1.3 Implementar `aprobarActaGD` con quórum 100% de directiva vigente, transición a "Publicada", notificación masiva `notify()` a propietarios y evento `GD_ACTA_APPROVED`
- [x] 1.4 Seed vacío de `actasGD` en manifest qa-lab (rank 5) y tests del store

## 2. UI

- [x] 2.1 Crear `/comunidad/directiva/page.tsx`: repositorio de actas con visibilidad por RP (propietario/admin; residente según `residenteVeActas`; borradores ocultos) + skeleton + rehydrated
- [x] 2.2 Formulario de registro/edición de acta (datos reunión, tabla temas, asistencia, invitados, minuta, adjuntos por URL)
- [x] 2.3 Monitor de firmas pendientes + botonera "Aprobar Acta" por miembro directivo

## 3. Validación

- [x] 3.1 Lint + typecheck + suite verde (nuevos tests: flujo completo borrador→publicada, rechazo no-directivo, D1, privacidad residente)
- [x] 3.2 Verificar escenarios ADDED cubiertos sin regresiones
