# agents.md — puente

La instrucción de agentes para Compass vive en **`AGENTS.md`** (raíz del repo). Ese es el único
archivo que hay que mantener, y el que las herramientas cargan como contexto.

Este documento existe solo porque varias herramientas y specs lo leen por convención. Su
contenido real está en `AGENTS.md` (contexto, stack, convenciones críticas, estilo de código y
los datos que nunca deben salir a modelos free).

Para artefactos de openspec —formato de deltas, capacidades válidas y las trampas que rompen el
`archive`— ver `openspec/CONVENCION-DELTAS.md` y el bloque `context` de `openspec/config.yaml`.

> Histórico (2026-10-06): este archivo declaraba una identidad "Antigravity (Google DeepMind)",
> apuntaba a `docs/03 - Mapa de Desarrollo` (ruta inexistente) y hablaba de "Golden Rules" sin
> mencionar el formato de deltas. Las convenciones de estilo que seguían vigentes se movieron a
> `AGENTS.md`.
