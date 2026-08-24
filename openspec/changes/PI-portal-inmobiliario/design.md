## Context

Store v10 (Zustand + persist, ~5MB localStorage). El trigger inmobiliario ya existe como campo `estadoOcupacionPropiedad` en `VinculoUnidadSchema` (`k0mp4ss_fe/apps/web/lib/schemas.ts:82`) y referencia `maestros.estadosInmobiliarios` (`en_arriendo`, `en_venta` en `data/comunidad/vinculos.ts:10`). La sidebar ya enlaza `/comunidad/portal` (`components/app-sidebar.tsx:98`). Decisiones D1 (media por referencia) y D3 (`notify()` simulado) aplican desde `prep-fundamentos-serie-2`.

## Goals / Non-Goals

**Goals:**
- Vitrina funcional end-to-end: publicación automática, catálogo filtrable, ficha, lead con notificación simulada.
- Primer consumidor real de `notify()`/`notificaciones` y de la regla media-por-referencia.

**Non-Goals:**
- URL pública real desplegada fuera de la app (el modo "pública" solo abre la ruta sin login; no hay SEO/dominio propio).
- Pasarela de pagos, chat in-app con leads o integración con portales externos.
- Corredores como entidad propia: el "corredor a cargo" es el destinatario configurado de la notificación (fase SG/backend).

## Decisions

- **Colecciones**: `publicacionesPortal` (id, unidadId, vinculoId, operacion `venta|arriendo`, precio, etiquetaEstado, descripcion, urlMapa, condicionesContractuales, imagenes[] {nombre,tipoMime,tamanoKB,url}, activa, fechaPublicacion) y `leadsPortal` (id, publicacionId, nombreContacto, contacto, mensaje, fecha, atendido). Nombres de dominio plano, coherentes con `vinculos`/`eventos`.
- **Sync automático**: helper `syncPublicacionesDesdeVinculos(unidadId)` invocado al final de `saveVinculo`: si algún vínculo propietario vigente tiene estado ofertable → upsert publicación activa; si no → `activa=false`. Nunca borra (preserva histórico para métrica de días publicados).
- **D1 en galería**: `ImagenReferencia { nombre, tipoMime, tamanoKB, url }`; validación rechaza payloads > 512 chars en `url` o claves base64 (`data:`), retornando `StoreResult` con error.
- **notify() mínimo**: colección `notificaciones` + acción `notify({destinatarioRol, asunto, cuerpo, canal:"email_simulado", moduloOrigen})` + `markNotificacionLeida`. La bandeja visible se limita a un panel simple dentro de `/comunidad/portal` para el propietario (UI completa de bandeja global queda para módulos de comunicación).
- **Rank 4**: `publicacionesPortal` depende de `unidades`(2)+`vinculos`(3)+`maestros.estadosInmobiliarios`(0); `leadsPortal` depende de `publicacionesPortal`(4). Seeds vacíos por defecto (opcionalmente demo seed `TEST-*` para qa-lab).
- **Migrate v11**: `migrate` agrega las 3 colecciones vacías (`publicacionesPortal`, `leadsPortal`, `notificaciones`) vía mergeById sobre estado previo.

## Risks / Trade-offs

- [Bandeja mínima] La bandeja global vive dentro del módulo PI al inicio → aceptado: evita adelantar alcance de CV/GD; la acción `notify()` ya es central en store.
- [Modo pública sin auth] Cualquiera con la URL ve el catálogo → mitigado: modo "residentes" por defecto; el cambio requiere rol admin.

## Migration Plan

`STORE_VERSION` 10→11. Migración aditiva (colecciones vacías), sin transformación de datos existentes. Usuarios con estado v10 ganan las colecciones al hidratar.

## Open Questions

Ninguna — alcance fijado por la spec NSGC PI y decisiones D1/D3.
