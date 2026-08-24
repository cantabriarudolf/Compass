---
description: "Atajo: valida todos los módulos activos sin cerrar (equivale a /valida-datos --all-active --partial) - sin argumentos"
---

Ejecuta validación de capa de datos ST para **todos los changes activos** sin archivar. Es un atajo sin argumentos para `/valida-datos --all-active --partial`.

Haz exactamente lo mismo que `/valida-datos --all-active --partial` descrito en `valida-datos.md`: itera `openspec/changes/*` no archivados, ejecuta checklist 1..7 por cada uno + chequeo global de `Rank` DAG `ST:9`, corrige solo lo dentro de valida-datos, no muevas nada a `openspec/changes/archive/`, no commitees. Reporta informe en chileno por módulo + tabla global Rank.

No requiere argumentos. Si el usuario escribe `/va`, asume `--all-active --partial` automáticamente.
