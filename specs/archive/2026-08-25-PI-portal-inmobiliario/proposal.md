## Why

El módulo PI del NSGC define una vitrina digital para promover venta/arriendo de unidades. La sidebar ya enlaza `/comunidad/portal` pero la ruta no existe. Es el primer módulo de la Sesión 1 de la serie NSGC y el primero que consume las decisiones D1 (media por referencia) y D3 (`notify()` con bandeja) fijadas en `prep-fundamentos-serie-2`.

## What Changes

- Nueva capability **PI-portal-inmobiliario**: vitrina de unidades publicadas automáticamente cuando el vínculo del propietario (VU) marca `estadoOcupacionPropiedad` como "En Arriendo" o "En Venta".
- Colecciones nuevas en ST: `publicacionesPortal` (ficha pública por unidad) y `leadsPortal` (consultas "Me Interesa").
- Acciones de store con patrón repository: `savePublicacionPortal`, `removePublicacionPortal`, `saveLeadPortal` (retornan `StoreResult`) + sincronización automática publicar/despublicar desde VU.
- Catálogo tipo grilla con filtros (operación, rango de precio, dormitorios) y ficha detallada (galería por metadatos+URL, mapa, condiciones contractuales).
- Contacto seguro: el lead notifica al propietario/corredor vía `notify()` con canal `email_simulado` sin revelar datos personales.
- Visibilidad configurable por administración: solo residentes o URL pública.
- Eventos AM: `PI_PROPERTY_LISTED`, `PI_PROPERTY_UNLISTED`, `PI_LEAD_CONTACT`.
- Bump `STORE_VERSION` 10 → 11 con migrate que inyecta las colecciones nuevas.

## Capabilities

### New Capabilities
- `PI-portal-inmobiliario`: Vitrina inmobiliaria con publicación automática por trigger de estado (VU), catálogo filtrable, contacto seguro vía bandeja simulada y visibilidad residentes/pública.

### Modified Capabilities
(ninguna)

## Impact

- Código: `k0mp4ss_fe/apps/web/lib/store.ts` (+2 colecciones, +3 acciones, migrate v11), `k0mp4ss_fe/apps/web/app/comunidad/portal/page.tsx` (nueva ruta ya enlazada en sidebar), seed opcional en `data/comunidad/`.
- Specs: nueva carpeta `openspec/specs/PI-portal-inmobiliario/`.
- No instala pdfmake ni toca parámetros legales CF (quedan para PL/CT).
