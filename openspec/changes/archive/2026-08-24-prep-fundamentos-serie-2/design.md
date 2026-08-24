## Context

El store (ST, v10) usa Zustand + persist sobre localStorage (~5MB prácticos). La serie de 15 módulos NSGC pendientes arranca con decisiones técnicas aún no codificadas en specs. El owner decidió el 2026-08-24: media por referencia, pdfmake como motor documental, notificaciones simuladas con bandeja y parametrización legal chilena mínima. Este change es documental: no toca código.

## Goals / Non-Goals

**Goals:**
- Dejar las 4 decisiones como requisitos verificables en ST/CF/MA antes de la Sesión 1 de la serie.
- Actualizar `project.md` para que el mapa OpenSpec ↔ NSGC refleje AU/SG/LAB-mejoras/DEV-qa-lab y la convención de alcance.
- Blindar el store contra crecimiento descontrolado de localStorage desde la Sesión 3 (CV).

**Non-Goals:**
- Instalar pdfmake o escribir librería de documentos (ocurre al implementar CT/PL).
- Implementar `notify()` en código o la UI del centro de notificaciones.
- Integración SMTP real, tramos de impuesto único, topes imponibles completos (queda para SG / PL completo).
- Modificar seeds existentes o versión del store (v10 sigue vigente; las colecciones nuevas entran con su módulo).

## Decisions

- **D1 Media por referencia**: se prohíbe payload binario en vez de limitarlo. Razón: cualquier límite base64 (150KB) erosiona la cuota igualmente y CV puede funcionar con URLs remotas de placeholder; los metadatos conservan el valor funcional (listados, auditoría).
- **D2 Notificaciones simuladas**: `notify()` se especifica como acción de store con canal `email_simulado`; los flujos NSGC que "envían correo" escriben en bandeja. Razón: mantiene mock-first sin cerrar la puerta al backend real (Auth.js/Prisma) — solo cambia la implementación de la acción.
- **D3 Parametrización mínima en CF + colecciones en MA**: parámetros globales mensuales (UF, tope gratificación, SIS) viven en CF singleton; catálogos previsionales (afp/salud/asignacionFamiliar) viven en MA porque son maestros CRUD con FK desde PE. Coincide con el patrón repository existente.
- **D4 pdfmake declarado en project.md, no en spec de capability**: la elección de librería es convención de proyecto, no comportamiento observable; entra a specs de CT/PL solo como restricción de salida (PDF con firma embebida).

## Risks / Trade-offs

- [Media por referencia] Las vistas pierden preview inline si no hay red → aceptado: placeholders locales por tipo MIME.
- [Notificaciones simuladas] Riesgo de confusión ("¿se envió realmente?") → mitigado: canal etiquetado `email_simulado` visible en la bandeja.

## Migration Plan

Sin migración de datos: este change no altera el schema del store. Los módulos futuros agregan sus colecciones al implementarse.

## Open Questions

Ninguna — D1–D4 resueltas con el owner el 2026-08-24.
