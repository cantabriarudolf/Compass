## 1. Store (ST)

- [ ] 1.1 Declarar tipos `PublicacionPortal`, `LeadPortal`, `Notificacion`, `ImagenReferencia` y colecciones `publicacionesPortal`/`leadsPortal`/`notificaciones` en `CompassData`; bump `STORE_VERSION` 10→11 con migrate aditivo
- [ ] 1.2 Implementar acciones repository `savePublicacionPortal`/`removePublicacionPortal`/`saveLeadPortal` (validación FK, reglas D1 anti-base64, `StoreResult`) + `notify()` y `markNotificacionLeida`
- [ ] 1.3 Implementar `syncPublicacionesDesdeVinculos(unidadId)` enganchado a `saveVinculo` (auto publicar/despublicar según `estadoOcupacionPropiedad`)
- [ ] 1.4 Emitir eventos AM `PI_PROPERTY_LISTED`, `PI_PROPERTY_UNLISTED`, `PI_LEAD_CONTACT` desde las acciones
- [ ] 1.5 Seeds vacíos de las 3 colecciones en manifest de qa-lab (rank 4) y actualizar tests del store

## 2. UI

- [ ] 2.1 Crear `/comunidad/portal/page.tsx`: catálogo grilla con filtros (operación, precio, dormitorios), skeleton + `useStoreRehydrated()`
- [ ] 2.2 Ficha detallada (galería por metadatos, mapa URL, condiciones, descripción) y formulario "Me Interesa" que crea lead + notificación simulada
- [ ] 2.3 Gestión de publicación para propietario/admin (editar ficha, imágenes por URL, activar/desactivar) y selector de visibilidad solo-admin; bandeja mínima de notificaciones del propietario

## 3. Validación

- [ ] 3.1 Lint + typecheck + suite de tests verde (incluye nuevos casos: trigger VU, rechazo base64, FK inexistente)
- [ ] 3.2 Verificar contra spec: escenarios ADDED cubiertos y sin regresión en 83 tests existentes
