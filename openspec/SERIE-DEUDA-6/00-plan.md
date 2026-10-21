# Serie Deuda 6 — Store legacy en la UI, fase 1 (lectura + cableado de hooks)

> Toda ventana DEBE leer este archivo al iniciar, marcar su fila **EN CURSO** y actualizarla antes de
> cerrar. **Modo**: delegado con workers desde el chat orquestador. El orquestador audita cada retorno
> contra el repo y lanza la ventana siguiente. **Ninguna ventana pushea, mergea ni abre PR.**

## Origen y alcance

Auditoría read-only del 2026-10-21 (`openspec/BACKLOG-100.md` §Deuda viva verificada): quedan
**13 archivos / 147 usos** de `useCompassStore` (zustand legacy `@deprecated`). Tres son excepciones
justificadas (`admin/qa-lab`, `admin/dev-dashboard`, `admin/mantenimiento`: operan sobre
localStorage/semillas). Esta serie ataca **solo la parte de riesgo bajo**: lectura pura con hook
existente y cableado de hooks cuya ruta API **ya existe**.

**Fuera de alcance (deuda declarada, no se toca acá)**: transiciones PE (5), entregar/resolver
solicitud IR, reportes RE (generar/distribuir/vista), adelantos PL, cobranza FI, publicar acta en CV
(`comunidad/visor`). Todos esos exigen endpoints nuevos con contrato de negocio y quedan para fase 2.

## Ventanas

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| V1 | `comunidad/certificados` — `liquidacionesPL` + `cobrosFI` del store → `useLiquidaciones` + `useCobrosFI` | PENDIENTE | — |
| V2 | `visor-mensajes` — quitar `caducarAvisosCV` del store: caducidad vía API (acción mínima reutilizando el contrato existente) | PENDIENTE | — |
| V3 | `finanzas/multas` — cablear `use-in`: aplicar/desestimar/apelar (rutas ya existen) y migrar la página | PENDIENTE | — |
| V4 | `inventario/proyectos` — cablear `use-mt`: verificar garantías + actualizar pago de trabajo (rutas ya existen) y migrar la página | PENDIENTE | — |
| V5 | Cierre: gates completos, `BACKLOG-100.md`, avance NSGC, deuda restante declarada, informe | PENDIENTE | — |

**MÁXIMO: 5 ventanas.** Lo que no entre se declara como deuda fase 2 en V5; no se improvisa.

## Prerrequisito de base

- Rama **`noche/deuda-6`** creada por el orquestador desde `main`. Prohibido pushear y prohibido mergear.
- Fingerprint de `main` al materializar: `tsc` 0 · `eslint` exit 0 · suite verde con cobertura global
  **94.31 / 85.82 / 93.61**, `lib/**` **99.49**, `lib/store.ts` **99.95** (sin cubrir solo `:4323` y
  `:5131`, declarados inalcanzables por diseño) · `openspec validate --all` **35/35** · `STORE_VERSION = 28`.

## Reglas duras (válidas en TODAS las ventanas)

1. **Un commit por work-unit**, convencional en español, commiteando **solo** los archivos del cambio.
2. **Prohibido `git push`, `gh`, merge, PR y `prisma migrate`.** Prohibido tocar `prisma/dev.db`,
   `Data/NSGC/backups/`, `.env*` y cualquier secreto.
3. **`STORE_VERSION = 28` congelado.** No cambiar el shape persistido ni el contrato de los hooks.
4. **No usar `gentle_review`/RDD** en esta serie (el switch está global `on`; una review bloquea al
   owner esperando una selección). La verificación es: gates + auditoría del orquestador.
5. **Método openspec**: un único change `ui-legacy-store-fase1` (creado en V1) con `skip_specs: true`
   justificado (paridad de comportamiento, sin cambio de contrato observable). `check-delta-coverage`
   debe dar `0 que romperían el archive`. **No archivar**: el archive exige CI verde observado y esta
   serie no pushea.
6. **Gate por ventana**: `npx tsc --noEmit` 0 · `npm run lint` 0 problemas · `npm test` verde con los
   pisos vigentes. e2e **no** se corre en esta máquina (2 cores; flakes documentados en `qa-estado.json`).
7. **Paridad estricta**: mismos textos, mismos permisos, mismas columnas, mismo orden. Si la migración
   exige decidir un contrato nuevo o cambiar comportamiento visible → **BLOQUEADO** con la evidencia
   exacta en la Bitácora; no se improvisa.
8. **Término oficial "comunidad"** (RG §4). Sin placeholders; datos realistas.

## Protocolo de retorno

Cada ventana devuelve, en su respuesta final: fila de la tabla actualizada · commits · gates con
salidas exactas · archivos tocados · qué quedó fuera y por qué · `BLOQUEADO` si aplica (con evidencia).
El orquestador audita (`git diff`, gates si hace falta) antes de lanzar la siguiente.

## Bitácora

- **2026-10-21** — Serie materializada tras la auditoría de la deuda. Base: `main` en `e8d74d5`
  (BACKLOG al día, sin push). Rama `noche/deuda-6`.
