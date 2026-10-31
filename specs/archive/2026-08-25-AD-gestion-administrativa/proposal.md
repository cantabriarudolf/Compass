## Why

El módulo AD del NSGC centraliza el panel del administrador: perfiles de los actores de la comunidad (propietarios, residentes, directiva), controles de privacidad/comunicación del propietario y acceso al personal. La data base ya existe en el store (`PersonaSchema` con `datosGobernanza`, `VinculoUnidad.permiteVerFinanzas`), pero no hay panel administrativo ni controles de privacidad persistidos.

## What Changes

- Nueva capability **AD-gestion-administrativa**: panel `/admin/gestion` con "Cajón de Comunidad" (propietarios, residentes, directiva) y "Cajón de Recursos Humanos" (acceso a fichas de personal).
- Colección nueva en ST: `controlesPropiedad` — por unidad: `residenteVeMorosidad`, `residenteVeActas`, `alertasResidentesActivas` ("Notificar a Residentes" + "Gestión de Alertas Residentes").
- Firma digitalizada de directiva validada como referencia (D1): `datosGobernanza.firmaDigital` acepta solo URL/metadata, jamás base64/Blob; alimenta el flujo de actas de GD.
- Acciones repository: `saveControlPropiedad`/`removeControlPropiedad` con validación FK a unidades y `StoreResult`.
- Eventos AM: `AD_OWNER_CONFIG_CHANGE`, `AD_DIRECTIVA_SIGN_UPLOAD`.
- Bump `STORE_VERSION` 11 → 12 con migrate aditivo.
- No implementa PE (requerimientos contractuales/previsionales quedan para su módulo).

## Capabilities

### New Capabilities
- `AD-gestion-administrativa`: Panel del administrador con cajones de Comunidad (perfiles + privacidad) y Recursos Humanos (personal), firma digitalizada de directiva y eventos AM.

### Modified Capabilities
(ninguna)

## Impact

- Código: `k0mp4ss_fe/apps/web/lib/store.ts` (+1 colección, +2 acciones, migrate v12), `k0mp4ss_fe/apps/web/app/admin/gestion/page.tsx` (nueva ruta + entrada en sidebar bajo Administración).
- Specs: nueva carpeta `openspec/specs/AD-gestion-administrativa/`.
- Consume D1 (firma/foto por referencia) y D3 (alertas silenciables respetan `notificaciones`).
