## Context

`PersonaSchema` (`k0mp4ss_fe/apps/web/lib/schemas.ts:120`) ya trae identidad completa, `roles`, `fotografiaUrl`, `datosLaborales` (PE) y `datosGobernanza` (cargoDirectiva/firmaDigital/fechaAsuncion). `VinculoUnidad.permiteVerFinanzas` cubre el flag financiero por vínculo. Falta el panel y los controles de privacidad por unidad. D1 aplica a foto/firma; D3 a las alertas silenciables.

## Goals / Non-Goals

**Goals:**
- Panel `/admin/gestion` con lectura agrupada de la comunidad y edición de controles.
- `controlesPropiedad` como fuente única que GD/FI consultarán (contrato listo sin implementarlos).

**Non-Goals:**
- Implementar PE (fichas contractuales completas) ni GD (flujo de actas).
- Subida real de archivos: foto y firma se ingresan como URL (placeholder/CDN) conforme D1.
- Notificaciones automáticas de visitas/encomiendas/reservas: solo se respeta el flag al momento de notificar.

## Decisions

- **`controlesPropiedad` por unidad** (no por vínculo): la decisión legal es del dueño sobre su propiedad; evita migrar `VinculoUnidadSchema` y mantiene un registro 1:1 con `unidades`. Unicidad por `unidadId` validada en save.
- **Defaults al primer acceso**: `saveControlPropiedad` crea el registro si no existe (upsert idempotente); lecturas sin registro asumen `{residenteVeMorosidad:false, residenteVeActas:false, alertasResidentesActivas:true}`.
- **Firma**: reuso de `datosGobernanza.firmaDigital` existente; se agrega validación anti-base64 en `savePersona` (rechaza strings `data:` > 512 chars) en vez de colección nueva.
- **Ruta**: `/admin/gestion` bajo grupo Administración de la sidebar (solo rol admin), coherente con `/admin/maestros` y `/admin/configuracion`.
- **Rank 4**: `controlesPropiedad` depende solo de `unidades`(2).
- **Migrate v12**: agrega `controlesPropiedades: []` aditivo.

## Risks / Trade-offs

- [Flags consultados por módulos futuros] GD/FI aún no existen → aceptado: el contrato de lectura queda especificado; su implementación llega con cada módulo.
- [URL manual para foto/firma] UX menos rica que upload real → aceptado por D1 hasta backend SG.

## Migration Plan

Aditiva (colección vacía nueva). Sin transformación de datos v11.

## Open Questions

Ninguna — el alcance del panel está cerrado por AD NSGC §1–§3.
