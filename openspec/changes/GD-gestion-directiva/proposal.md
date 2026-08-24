## Why

El módulo GD del NSGC cubre la gobernanza documental: registro de reuniones con asistencia, redacción y aprobación de actas con flujo de firmas, publicación formal y privacidad propietario/residente. Los cimientos ya quedan listos: firmas en `datosGobernanza` (AD), visibilidad de actas en `controlesPropiedad.residenteVeActas` (AD) y bandeja `notify()` (PI/ST). Es el tercer cambio de la Sesión 1.

## What Changes

- Nueva capability **GD-gestion-directiva**: gestión de reuniones/actas con asistencia, minuta, adjuntos por referencia, flujo de aprobación por directiva y publicación automática.
- Colección nueva en ST: `actasGD` (datos de reunión, tabla de temas, presentes/ausentes/invitados, minuta, adjuntos D1, aprobaciones por miembro, estado borrador/publicada).
- Acciones repository: `saveActaGD`, `removeActaGD`, `aprobarActaGD` (con validación de rol directivo y firma disponible) retornando `StoreResult`.
- Flujo de aprobación: estado "Borrador de Directiva" hasta quórum 100% de la directiva vigente; monitor de firmas pendientes; al completarse → publica y notifica a todos los propietarios vía `notify()` (`email_simulado`).
- Publicación en Visor de Mensajes (CV): queda referenciada como pendiente hasta que CV exista (módulo futuro); la notificación simulada sí es inmediata.
- Privacidad: actas solo visibles para propietarios/administración; residentes acceden únicamente si el dueño activó `residenteVeActas` en AD.
- Eventos AM: `GD_ACTA_CREATED`, `GD_ACTA_APPROVED`, `GD_ASISTENCIA_REG`.
- Bump `STORE_VERSION` 12 → 13 con migrate aditivo.

## Capabilities

### New Capabilities
- `GD-gestion-directiva`: Actas y reuniones de directiva con flujo de aprobación por firmas, publicación con notificación simulada y privacidad por tipo de rol.

### Modified Capabilities
(ninguna)

## Impact

- Código: `k0mp4ss_fe/apps/web/lib/store.ts` (+1 colección, +3 acciones, migrate v13), `k0mp4ss_fe/apps/web/app/comunidad/directiva/page.tsx` (ruta ya enlazada en sidebar como "Directiva").
- Specs: nueva carpeta `openspec/specs/GD-gestion-directiva/`.
- Depende de: PI (notify), AD (firmas + controlesPropiedad). No instala pdfmake (generación PDF de actas queda para CT).
