# NIGHT-AUDIT — Plan de Continuación (para otro chat)

> Estado verificado 2026-10-06. La verdad es el repo, no este archivo.
> Al retomar: leer `reporte.md` + este plan + `mem_context` (Engram, proyecto compass).

## Estado verificado

- HEAD `4fb6eef`, main en sync con origin. Tree SUCIO (sin commitear):
  manuales ST/AU/SG (documentación sg-*) + `next-env.d.ts` (generado) +
  `reporte.md` (72 líneas retocadas post-auditoría).
- `openspec validate --all`: **36 passed, 8 failed** (los 5 pre-existentes +
  los 3 sg-* nuevos: `sg-google-provider-prod-guard`,
  `sg-csp-enforcement`, `sg-jwt-maxage-verify` — implementados y commiteados
  `fa46f4a/b87809f/7f4357c` pero SIN deltas de spec → fallan validación).
- Engram: registrado (session summaries + observaciones de la noche presentes).

## Pendiente A — Cerrar los 3 sg-* (1 ventana)

1. Darles deltas de spec (o `skip_specs` si corresponde) hasta que
   `openspec validate <change> --type change` pase cada uno.
2. Verificar tests que trajeron (JWT maxAge, CSP runbook, auth guard).
3. `openspec archive <los-3> -y` + commit + push.
4. Criterio salida: validate 36/5 (solo los 5 pre-existentes de otras series).

## Pendiente B — Materializar planes 5-12 del reporte §7

En orden sugerido: `gd-periodos-directiva-complete` (código hecho, falta
tests+commit) → `fix-vercel-data-ignore-close` → `gd-ficha-gobernanza-impl`
→ `e2e-rojos-p3-complete` → slices `st-split-fase2` (IR primero) →
`openspec-validate-ecrud-fix`. Cada uno: serie/ventana con propose →
implementar → validar → archivar. NO tocar `au-google-sso` (bloqueado) ni
`st-migracion-postgres` (ya archivado).

## Pendiente C — Owner (nadie más puede)

1. Credenciales Google Cloud (`au-google-sso` listo, esperando).
2. `CLAVE_CIFRADO_DATOS` + `SENTRY_DSN` reales en Vercel.
3. Las 7 preguntas abiertas legales (§6.4 del reporte).
4. Checklist §4: validación visual por perfil en UI.

## Notas

- El reporte tiene 3 datos rancios (dice "ahead 5", 79 archivos unit,
  `e2e-rojos-crud` abierto): ya resueltos, no accionar.
- `next-env.d.ts` es generado: si el diff es solo versión de tipos,
  descartarlo, no commitearlo.
