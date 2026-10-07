# Design: qlab-poblamiento-api-rest

## Decisión 1 — El poblamiento escribe BD vía API, nunca el store

`cargarFase13FI` y `cargarFase15CT` dejan de llamar acciones del store y pasan a llamar las
rutas REST con `fetch` (helper `apiQA` que ya usa la fase PI, `app/admin/qa-lab/page.tsx:428`).
El store legacy queda para los consumidores que aún lo leen, no como destino de escritura.

**Por qué**: la BD es la fuente de verdad declarada (`RG - Reglas Generales.md:54`) y las
páginas leen API. Escribir al store es lo que produce el desfase.

## Decisión 2 — Reusar rutas y crear sólo las acciones que faltan

Reusar (`fondos-fi`, `egresos-fi`, `cobros-fi`, `emisiones-gc`, `certificados-ct`,
`personas`, `configuracion`, `liquidaciones`). Crear:

| Ruta nueva | Motivo | Patrón a copiar |
| --- | --- | --- |
| `POST /api/cobros-fi/[id]/pagar` | Hoy sólo hay `PUT` factory | `app/api/liquidaciones/[id]/confirmar/route.ts` (acción dedicada, evento de auditoría) |
| `POST /api/cobros-fi/[id]/mora` | Sin equivalente | idem |
| `POST /api/fondos-fi/[id]/retirar` | `retirarFondoFI` sin API | idem |
| `POST /api/certificados-ct` (reusar el existente) | Existe y no se usa desde el lab | `app/api/certificados-ct/route.ts:22` |

**Por qué**: minimizar superficie nueva y mantener el lenguaje de las rutas ya auditadas
(evento post-write, scoping por comunidad, guardas de inmutabilidad).

## Decisión 3 — Ids `test-*` fijos + upsert para idempotencia

Cada entidad poblada lleva un id determinista (`test-*-qa`, `test-*-fi`, `test-*-ct`) y las
rutas hacen upsert. Así "Poblar todo" dos veces no duplica y "Borrar todo" puede localizar el
residuo exacto. Es el modelo ya probado en PI (`test-pub-pi-qa` / `test-lead-pi-qa`).

## Decisión 4 — La higiene es de dos mundos y se prueba

`tieneDatosTest(state, bd?)` y `e2e:higiene` deben cubrir store + BD. El guard informa
"TEST-* limpio correctamente" sólo si **ambos** mundos están limpios; si queda residuo
inmutable (confirmadas por diseño), lo reporta como residuo honesto, no como limpieza completa.

## Decisión 5 — Gate de inmutabilidad en CT en la capa API

`removeCertificadoCT` es inmutable por diseño y hoy vive en el store. Al migrar CT, la regla
se aplica en la ruta API (rechazo explícito con 409 o 400 documentado), no en el cliente, para
que un consumidor distinto del lab no pueda saltarla. El gate deuda/saldo de
`page.tsx:1075-1095` se porta a la misma ruta.

## Alternativas descartadas

- **Tocar el store legacy**: congelado por decisión de arquitectura (STORE_VERSION=28); además
  multiplica el diff sin resolver el desfase.
- **`skip_specs`**: la migración cambia comportamiento observable del lab → sí toca specs, así
  que lleva deltas (2 requirements ADDED en `LAB-mejoras`).
- **Migrar las 4 fases en un solo change/ventana**: el recon lo descarta por tamaño (FI sola es
  una ventana). PI/PL ya están; este change cubre FI y CT.
- **Escribir a BD y espejar al store** (lo que hace PL de forma transitoria): se acepta sólo
  donde un consumidor legacy todavía lo exige; para FI/CT el objetivo es no espejar.
