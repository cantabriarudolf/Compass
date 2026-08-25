## 1. Store (ST)

- [x] 1.1 Declarar tipo `ControlPropiedad` y colección `controlesPropiedades` en `CompassData`; bump `STORE_VERSION` 11→12 con migrate aditivo
- [x] 1.2 Implementar `saveControlPropiedad`/`removeControlPropiedad` (FK a unidades, unicidad por unidadId, defaults, `StoreResult`)
- [x] 1.3 Validación D1 en `savePersona`: rechazar `fotografiaUrl`/`datosGobernanza.firmaDigital` en base64/data-URL; emitir `AD_DIRECTIVA_SIGN_UPLOAD` al cambiar firma
- [x] 1.4 Emitir `AD_OWNER_CONFIG_CHANGE` desde `saveControlPropiedad` y respetar `alertasResidentesActivas` en `notify()`
- [x] 1.5 Seed vacío de `controlesPropiedades` en manifest qa-lab (rank 4) y tests del store

## 2. UI

- [x] 2.1 Crear `/admin/gestion/page.tsx` con guard admin + skeleton + `useStoreRehydrated()`; entrada "Gestión Administrativa" en sidebar
- [x] 2.2 Cajón de Comunidad: pestañas Propietarios / Residentes / Directiva leyendo de `personas`+`vinculos`, con foto por referencia
- [x] 2.3 Controles de privacidad por unidad (toggles Notificar a Residentes / Gestión de Alertas) vía `saveControlPropiedad`
- [x] 2.4 Cajón de Recursos Humanos: listado de personal desde `datosLaborales`; carga de firma digitalizada por URL para directiva

## 3. Validación

- [x] 3.1 Lint + typecheck + suite verde (nuevos tests: defaults, unicidad, rechazo base64, eventos AM)
- [x] 3.2 Verificar escenarios ADDED cubiertos sin regresiones
