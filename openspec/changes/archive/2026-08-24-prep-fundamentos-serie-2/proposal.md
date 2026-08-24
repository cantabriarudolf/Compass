## Why

Antes de lanzar la serie de 15 módulos NSGC pendientes (Sesión 1: PI+AD+GD … Sesión 7: PL+CT+RE) hay que fijar 4 decisiones técnicas del owner tomadas el 2026-08-24: política de media/adjuntos frente al límite de ~5MB de localStorage, motor PDF, alcance de notificaciones y parametrización legal chilena para remuneraciones. Sin estas reglas en las specs, las sesiones 3+ (CV/IN/MT), 6 (FI) y 7 (PL/CT) tomarían decisiones ad-hoc incompatibles entre sí.

## What Changes

- Nueva regla **Media por Referencia** en ST: los adjuntos (CV imágenes, IN evidencias, MT facturas) guardan solo metadatos (nombre, tipo MIME, tamaño KB, URL/referencia); prohibido persistir base64/Blob en el store. CV consume URLs remotas.
- Nuevo **Centro de Notificaciones simulado** en ST: colección `notificaciones` + acción `notify()` centralizada con bandeja visible en UI; interfaz lista para conectar a backend real (Auth.js/Prisma) después. Email real queda fuera de alcance (SG).
- Nuevo motor **pdfmake** como estándar de generación documental para CT (certificados) y PL (liquidaciones), con firma digitalizada como imagen embebida.
- Nueva parametrización **legal chilena mínima** para PL: parámetros en CF (UF del mes, tope gratificación legal, tasa SIS) + colecciones en MA (`afp`, `salud`, `asignacionFamiliar`).
- Actualización de `openspec/specs/project.md`: convención "1 módulo NSGC = 1 change OpenSpec" y tabla cruzada actualizada con `AU-autenticacion-sesion`, `SG-hardening-despliegue`, `LAB-mejoras`, `DEV-qa-lab`.
- No toca código: este change es documental (specs + project.md). La instalación de pdfmake ocurre al implementar CT/PL.

## Capabilities

### New Capabilities
(ninguna)

### Modified Capabilities
- `ST-capa-datos-persistente`: media por referencia (sin payload binario) y centro de notificaciones simulado (`notify()`, bandeja, eventos AM).
- `CF-configuracion-global`: parámetros legales Chile para remuneraciones (UF mensual, tope gratificación, SIS) editables solo por administración y auditados.
- `MA-maestros-administrativos`: colecciones previsionales/legales `afp`, `salud`, `asignacionFamiliar` con patrón repository y seed por defecto.

## Impact

- Specs: `openspec/specs/{ST-capa-datos-persistente,CF-configuracion-global,MA-maestros-administrativos}/spec.md` vía deltas.
- Docs: `openspec/specs/project.md` (convenciones + tabla cruzada + lista de módulos pendientes).
- Código: ninguno en este change; condiciona implementaciones futuras (Sesión 3 CV usa URLs; Sesión 7 PL/CT usan pdfmake y maestros legales).
