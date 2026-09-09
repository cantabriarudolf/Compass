# Tasks: produccion-p2-config-produccion

## 1. Tarea 1 — `vercel.json`

- [x] 1.1 Crear `vercel.json` con `framework: nextjs` y `regions: ["scl1"]`.
- [x] 1.2 Decisión documentada: SIN bloque `headers` — `next.config.mjs` ya envía
  la suite de seguridad (HSTS incluido) y `proxy.ts` setea CSP-RO en runtime;
  duplicar en el edge produce headers repetidos. Con dominio real, añadir aquí:
  HSTS con `preload` y (tras 7 días de telemetría) CSP enforcement.
  NOTA: JSON no soporta comentarios → la documentación vive en este tasks.md,
  en la Bitácora de `00-plan.md` y en el reporte de la ventana.

## 2. Tarea 2 — `output: 'standalone'` en Next.js

- [x] 2.1 Añadir `output: "standalone"` a `next.config.mjs`.
- [x] 2.2 Verificar que el config carga (`node` import) y que `next build` no
  rompe (build puede fallar por red/Google Fonts según la ventana — ver reporte).

## 3. Tarea 3 — `lib/env-guard.ts` mejorado

- [x] 3.1 Endurecer `isWriteApiEnabled()`: solo true si runtime Node es de
  desarrollo real (`NODE_ENV=development`; `test` para vitest) Y el entorno
  efectivo (`getAppEnv()`) no está forzado a producción. Documentado en el código.
- [x] 3.2 Añadir `isProduction()`, `isDevelopment()`, `requireEnv(name)`.
- [x] 3.3 `test/env-guard.test.ts` con 12 casos (bug corregido, fallbacks,
  isProduction/isDevelopment, requireEnv producción/desarrollo).

## 4. Tarea 4 — Scripts de build prod

- [x] 4.1 Añadir `build:analyze` (`ANALYZE=true next build`) + envoltorio
  condicional con `@next/bundle-analyzer` en `next.config.mjs`.
- [ ] 4.2 Instalar `@next/bundle-analyzer` como devDependency — BLOQUEADO:
  la instalación muta `k0mp4ss_fe/package-lock.json`, fuera de las superficies
  autorizadas; escalado al owner (`npm i -D @next/bundle-analyzer -w web`).
  Hasta entonces `build:analyze` falla con ERR_MODULE_NOT_FOUND solo cuando
  se ejecuta (los builds normales no tocan el paquete).
- [x] 4.3 Comentario en `package.json` con variables de entorno obligatorias
  de producción (DATABASE_URL, AUTH_SECRET; NEXT_PUBLIC_APP_ENV recomendada).

## 5. Tarea 5 — Validación final

- [x] 5.1 `npx tsc --noEmit` → 0 errores.
- [x] 5.2 `npm test` → suite completa verde (542 tests).
- [x] 5.3 `npm run lint` → 0 errores; 11 warnings preexistentes fuera de
  superficie (proxy.ts ×8, e2e/crud/punto-cero.spec.ts ×1,
  scripts/fix-rut-seeds.cjs ×2) — escalados al owner desde P1.
- [x] 5.4 `openspec validate --all` → 36/36 sin fallos (incluye fix skip_specs
  para revision-arquitectura y revision-integraal, y para el change de P1).
