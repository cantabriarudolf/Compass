## 1. Store (ST)

- [ ] 1.1 Declarar tipos `ActaGD`/`AdjuntoReferencia` y colección `actasGD` en `CompassData`; bump `STORE_VERSION` 12→13 con migrate aditivo
- [ ] 1.2 Implementar `saveActaGD`/`removeActaGD` (FK asistentes a personas directivas, D1 anti-base64 en adjuntos, `StoreResult`) + eventos `GD_ACTA_CREATED`/`GD_ASISTENCIA_REG`
- [ ] 1.3 Implementar `aprobarActaGD` con quórum 100% de directiva vigente, transición a "Publicada", notificación masiva `notify()` a propietarios y evento `GD_ACTA_APPROVED`
- [ ] 1.4 Seed vacío de `actasGD` en manifest qa-lab (rank 5) y tests del store

## 2. UI

- [ ] 2.1 Crear `/comunidad/directiva/page.tsx`: repositorio de actas con visibilidad por RP (propietario/admin; residente según `residenteVeActas`; borradores ocultos) + skeleton + rehydrated
- [ ] 2.2 Formulario de registro/edición de acta (datos reunión, tabla temas, asistencia, invitados, minuta, adjuntos por URL)
- [ ] 2.3 Monitor de firmas pendientes + botonera "Aprobar Acta" por miembro directivo

## 3. Validación

- [ ] 3.1 Lint + typecheck + suite verde (nuevos tests: flujo completo borrador→publicada, rechazo no-directivo, D1, privacidad residente)
- [ ] 3.2 Verificar escenarios ADDED cubiertos sin regresiones
