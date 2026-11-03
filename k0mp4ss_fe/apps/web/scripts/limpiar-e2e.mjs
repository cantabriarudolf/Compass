#!/usr/bin/env node
/**
 * e2e:limpiar — purga el debris de las corridas e2e y deja la base como la dejó el seed.
 *
 * Por qué existe: la lane `e2e/crud` crea filas con marcadores (`TEST-*`, `QA-*`) y no
 * siempre las borra. Esas filas sobreviven a la corrida siguiente y cambian su resultado:
 * dos corridas consecutivas dieron el mismo conteo (43 passed / 4 failed) con fallas
 * distintas — `reservas` falló en la primera y pasó en la segunda sólo porque la base se
 * limpió a mano entre ambas, y `personal` hizo lo contrario. La suite se contamina sola.
 *
 * Reglas de la purga (tabla explícita en `REGLAS`, más abajo):
 * - Cada regla declara tabla + columna + patrón LIKE + motivo. NUNCA un barrido ciego
 *   `LIKE '%TEST%'` sobre todas las columnas de texto: uno anterior borró datos legítimos
 *   porque `arrendatario@test.cl` y los nombres de las comunidades demo contienen "TEST".
 * - Allowlist dura: las 6 cuentas de login, las 2 comunidades demo (`comunidad-a`,
 *   `comunidad-b`) y las filas del seed (personas/unidades/vínculos) no se tocan. La
 *   transacción lo verifica ANTES de commitear: si un contador del seed baja, revierte todo.
 * - Hijos antes que padres, todo en UNA transacción; se imprime el conteo por tabla y el total.
 * - Guarda de entorno (no opcional): sólo corre si DATABASE_URL es SQLite local (`file:…`).
 *   El proyecto tiene una base PostgreSQL/Neon de producción y este script jamás debe poder
 *   vaciarla: si la URL no es `file:…`, aborta y explica qué hacer. La URL no se imprime.
 * - Idempotente: un dry-run inmediatamente después de un `--apply` informa 0 filas.
 *
 * Modo por defecto: DRY-RUN (informa y no borra nada). El borrado real exige `--apply`
 * explícito, igual que `e2e:higiene`, para que un operador nunca destruya datos por inercia.
 *
 * Uso (desde k0mp4ss_fe/apps/web):
 *   npm run e2e:limpiar                 # dry-run: reporta qué borraría
 *   npm run e2e:limpiar -- --dry-run    # idem, explícito
 *   npm run e2e:limpiar -- --apply      # borra de verdad (una transacción)
 *   npm run e2e:limpiar -- --help
 *
 * Playwright lo corre con `--apply` desde `globalSetup` (playwright.config.ts) para que
 * cada corrida arranque del mismo estado. En CI se omite salvo `E2E_LIMPIEZA_CI=1`.
 *
 * Flags:
 *   --apply     ejecuta el borrado (sin este flag el script sólo informa)
 *   --dry-run   informa sin borrar; es el modo por defecto, se acepta explícito
 *   --help      esta ayuda
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { PrismaClient } from "@prisma/client"
// Reuso del resolvedor de entorno de datos:reset: misma precedencia (shell > .env) y
// misma guarda dura (sólo `file:` local, nunca la base gestionada).
import { entornoEfectivo, evaluarEntorno, resolverDatabaseUrl } from "./datos-reset.mjs"

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/** Cuentas de login del seed (seed:authz). Sus personas NUNCA se borran. */
const CUENTAS_LOGIN = [
  "admin@test.cl",
  "comite@test.cl",
  "conserjeria@test.cl",
  "residente@test.cl",
  "mantencion@test.cl",
  "arrendatario@test.cl",
]

/** Comunidades demo del seed: su nombre contiene "TEST" y aun así son legítimas. */
const COMUNIDADES_DEMO = ["comunidad-a", "comunidad-b"]

const AYUDA = `e2e:limpiar — purga el debris TEST/QA de las corridas e2e (SQLite local)

  npm run e2e:limpiar              dry-run: reporta qué borraría (default)
  npm run e2e:limpiar -- --dry-run idem, explícito
  npm run e2e:limpiar -- --apply   borra de verdad, en una transacción

Flag       Descripción
--apply    Ejecuta el borrado. Sin este flag el script sólo informa.
--dry-run  Informa sin borrar. Es el modo por defecto; se acepta explícito.
--help     Esta ayuda

Guarda dura: no corre si DATABASE_URL no es un \`file:\` SQLite local (la base
gestionada se opera con backup:db/restore:db y decisión del owner). No imprime la URL.`

/* ---------- argumentos ---------- */

function leerArgs(args) {
  const opciones = { aplicar: false, ayuda: false }
  for (const arg of args) {
    if (arg === "--apply") opciones.aplicar = true
    else if (arg === "--dry-run") opciones.aplicar = false
    else if (arg === "--help" || arg === "-h") opciones.ayuda = true
    else throw new Error(`argumento desconocido: ${arg}\n\n${AYUDA}`)
  }
  return opciones
}

/* ---------- reglas de purga ---------- */

/**
 * Condición `columna LIKE patron`. En SQLite LIKE es case-insensitive para ASCII, así que
 * `QA-%` también cubre `Qa-…`/`qa-…` (los elementos RA de e2e se crean como `Qa-sala-…`).
 *
 * @param {string} columna
 * @param {string} patron
 */
function like(columna, patron) {
  return { sql: `${columna} LIKE ?`, params: [patron] }
}

/**
 * Tabla de reglas. `condiciones` se unen con OR; el orden del array es el orden de borrado
 * (hijos antes que padres: una reserva apunta a un elemento RA, un vínculo a persona/unidad,
 * un certificado a ambos).
 *
 * @typedef {{ tabla: string, motivo: string, condiciones: { sql: string, params: string[] }[] }} Regla
 * @type {Regla[]}
 */
const REGLAS = [
  {
    tabla: "reservas_ra",
    motivo: "reservas de amenities de prueba: el elemento desaparece con la regla de elementos_ra",
    condiciones: [
      {
        sql: "elementoId IN (SELECT id FROM elementos_ra WHERE nombre LIKE ? OR nombre LIKE ?)",
        params: ["QA%", "TEST%"],
      },
    ],
  },
  {
    tabla: "certificados_ct",
    motivo: "certificados emitidos para una persona/unidad de prueba (helper e2e y UI)",
    condiciones: [
      like("personaId", "test-%"),
      like("unidadId", "test-%"),
      like("origenRef", "test-%"),
    ],
  },
  {
    tabla: "solicitudes_ge",
    motivo: "solicitudes creadas por el spec de gestión con título QA-",
    condiciones: [like("titulo", "QA-%")],
  },
  {
    tabla: "trabajos_mt",
    motivo: "trabajos de mantenimiento creados por el spec de gestión con título QA-",
    condiciones: [like("titulo", "QA-%")],
  },
  {
    tabla: "liquidaciones_pl",
    motivo: "nóminas de trabajadores de prueba (el trabajador es una persona test-)",
    condiciones: [like("trabajadorPersonaId", "test-%")],
  },
  {
    tabla: "encomiendas_pe",
    motivo: "encomiendas del helper e2e: la descripción lleva el marcador TEST-",
    condiciones: [like("descripcionPaquete", "TEST-%")],
  },
  {
    tabla: "bitacora_visitas_pe",
    motivo:
      "visitas registradas por los specs de portería y de conserjería. El campo pasa por una normalización de título, así que el marcador queda como «Test-…» y no como «TEST-…»: LIKE en SQLite es insensible a mayúsculas, de modo que el patrón en minúsculas cubre ambos.",
    condiciones: [like("nombre", "test-%")],
  },
  {
    tabla: "reportes_re",
    motivo: "reportes emitidos por el spec de reportería con título QA-",
    condiciones: [like("titulo", "QA-%")],
  },
  {
    tabla: "infracciones_in",
    motivo:
      "multas sobre una unidad QA- (o huérfanas de una unidad ya borrada): los antecedentes de e2e empiezan con «QA <timestamp>»",
    condiciones: [
      { sql: "unidadId IN (SELECT id FROM unidades WHERE numero LIKE ?)", params: ["QA-%"] },
      like("antecedentes", "QA %"),
    ],
  },
  {
    tabla: "recursos_ir",
    motivo: "insumos creados por el spec de recursos con nombre QA-",
    condiciones: [like("nombre", "QA-%")],
  },
  {
    tabla: "fondos_fi",
    motivo: "fondos creados por el spec de finanzas con nombre QA-",
    condiciones: [like("nombre", "QA-%")],
  },
  {
    tabla: "proveedores_pe",
    motivo: "proveedores creados por el spec de proveedores con nombre QA-/Qa-",
    condiciones: [like("nombre", "QA-%"), like("nombre", "Qa-%")],
  },
  {
    tabla: "notificaciones",
    motivo:
      "avisos generados por entidades de prueba (reportes QA-, encomiendas TEST-): es el mayor volumen",
    condiciones: [
      like("asunto", "%TEST%"),
      like("asunto", "%QA-%"),
      like("cuerpo", "%TEST%"),
      like("cuerpo", "%QA-%"),
    ],
  },
  {
    tabla: "eventos_auditoria",
    motivo:
      "bitácora de entidades de prueba: referenciaId test- o descripción que nombra un marcador TEST/QA-",
    condiciones: [
      like("referenciaId", "test-%"),
      like("descripcion", "%TEST%"),
      like("descripcion", "%QA-%"),
    ],
  },
  {
    tabla: "maestros_banco",
    motivo: "banco creado por el spec de maestros con nombre TEST-",
    condiciones: [like("nombre", "TEST-%")],
  },
  {
    tabla: "maestros_contacto_emergencia",
    motivo: "contacto de emergencia creado por el spec de maestros con nombre TEST-",
    condiciones: [like("nombre", "TEST-%")],
  },
  {
    tabla: "maestros_condicion_especial",
    motivo: "condición especial creada por el spec de maestros con nombre TEST-",
    condiciones: [like("nombre", "TEST-%")],
  },
  {
    tabla: "maestros_estado_ocupacion",
    motivo: "estado de ocupación creado por el spec de maestros con nombre TEST-",
    condiciones: [like("nombre", "TEST-%")],
  },
  {
    tabla: "maestros_categoria_macro",
    motivo: "categoría macro creada por el spec de maestros con nombre TEST-",
    condiciones: [like("nombre", "TEST-%")],
  },
  {
    tabla: "maestros_categoria_micro",
    motivo: "categoría micro creada por el spec de maestros con nombre TEST-",
    condiciones: [like("nombre", "TEST-%")],
  },
  {
    tabla: "maestros_categoria_unidad",
    motivo: "categoría de unidad creada por el spec de maestros con nombre TEST-",
    condiciones: [like("nombre", "TEST-%")],
  },
  {
    tabla: "maestros_estado_inmobiliario",
    motivo: "estado inmobiliario creado por el spec de maestros con nombre TEST-",
    condiciones: [like("nombre", "TEST-%")],
  },
  {
    tabla: "vinculos",
    motivo: "vínculos que apuntan a una persona test- o a una unidad QA- (se borran antes que sus padres)",
    condiciones: [
      { sql: "personaId IN (SELECT id FROM personas WHERE id LIKE ?)", params: ["test-%"] },
      { sql: "unidadId IN (SELECT id FROM unidades WHERE numero LIKE ?)", params: ["QA-%"] },
    ],
  },
  {
    tabla: "unidades",
    motivo: "unidades creadas por la UI de estructura/tipos: el número lleva el marcador QA-",
    condiciones: [like("numero", "QA-%")],
  },
  {
    tabla: "tipos_unidad",
    motivo: "tipos de unidad creados por el spec de tipos con nombre QA-",
    condiciones: [like("nombre", "QA-%")],
  },
  {
    tabla: "elementos_ra",
    motivo: "amenities de prueba: nombre Qa-/QA-/TEST (el seed usa «Quincho 1», «Piscina», …)",
    condiciones: [like("nombre", "QA%"), like("nombre", "TEST%")],
  },
  {
    tabla: "personas",
    motivo:
      "personas del helper e2e (id test-…); se excluyen las personas de las 6 cuentas de login y nunca se mira email ni nombre",
    condiciones: [
      {
        sql: "id LIKE ? AND id NOT IN (SELECT personaId FROM usuarios WHERE personaId IS NOT NULL)",
        params: ["test-%"],
      },
    ],
  },
]

/** WHERE completo de una regla (cada condición entre paréntesis, unidas con OR). */
function whereDe(regla) {
  return regla.condiciones.map((c) => `(${c.sql})`).join(" OR ")
}

/** Parámetros de una regla, en el orden en que aparecen en el WHERE. */
function paramsDe(regla) {
  return regla.condiciones.flatMap((c) => c.params)
}

/* ---------- ejecución ---------- */

/** Ejecuta un COUNT(*) y devuelve número (SQLite puede entregar BigInt). */
async function contar(tx, sql, params = []) {
  const filas = await tx.$queryRawUnsafe(sql, ...params)
  return Number(filas[0]?.n ?? 0)
}

/**
 * Filas del seed que la purga NO puede tocar: personas que no son test-, unidades que no son
 * QA- y vínculos entre ambas. Se miden antes y después dentro de la misma transacción.
 */
async function contarSeed(tx) {
  const [personasSeed, vinculosSeed, unidadesSeed] = await Promise.all([
    contar(tx, "SELECT COUNT(*) AS n FROM personas WHERE id NOT LIKE ?", ["test-%"]),
    contar(
      tx,
      "SELECT COUNT(*) AS n FROM vinculos WHERE personaId NOT LIKE ? AND unidadId NOT IN (SELECT id FROM unidades WHERE numero LIKE ?)",
      ["test-%", "QA-%"]
    ),
    contar(tx, "SELECT COUNT(*) AS n FROM unidades WHERE numero NOT LIKE ?", ["QA-%"]),
  ])
  return { personasSeed, vinculosSeed, unidadesSeed }
}

/**
 * Allowlist dura, verificada DENTRO de la transacción: si algo protegido desapareció, se
 * lanza el error y Prisma revierte todo el borrado.
 */
async function verificarAllowlist(tx, antes) {
  const cuentas = await contar(
    tx,
    `SELECT COUNT(*) AS n FROM personas WHERE id IN (SELECT personaId FROM usuarios WHERE email IN (${CUENTAS_LOGIN.map(() => "?").join(", ")}))`,
    CUENTAS_LOGIN
  )
  const comunidades = await contar(
    tx,
    `SELECT COUNT(*) AS n FROM Comunidad WHERE id IN (${COMUNIDADES_DEMO.map(() => "?").join(", ")})`,
    COMUNIDADES_DEMO
  )
  const despues = await contarSeed(tx)

  const fallas = []
  if (cuentas !== CUENTAS_LOGIN.length) fallas.push(`cuentas de login: ${cuentas}/${CUENTAS_LOGIN.length}`)
  if (comunidades !== COMUNIDADES_DEMO.length) fallas.push(`comunidades demo: ${comunidades}/${COMUNIDADES_DEMO.length}`)
  for (const clave of Object.keys(antes)) {
    if (despues[clave] !== antes[clave]) fallas.push(`${clave}: ${antes[clave]} → ${despues[clave]}`)
  }
  if (fallas.length > 0) {
    throw new Error(`allowlist violada (se revierte la transacción): ${fallas.join("; ")}`)
  }
}

/** Dry-run: conteo por regla, sin abrir transacción de escritura. */
async function informar(db) {
  const filas = []
  for (const regla of REGLAS) {
    const n = await contar(db, `SELECT COUNT(*) AS n FROM ${regla.tabla} WHERE ${whereDe(regla)}`, paramsDe(regla))
    if (n > 0) filas.push({ tabla: regla.tabla, n })
  }
  return filas
}

/** Borrado real: una transacción, hijos → padres, con verificación de allowlist antes del commit. */
async function aplicar(db) {
  return db.$transaction(
    async (tx) => {
      const antes = await contarSeed(tx)
      const filas = []
      for (const regla of REGLAS) {
        const n = await tx.$executeRawUnsafe(
          `DELETE FROM ${regla.tabla} WHERE ${whereDe(regla)}`,
          ...paramsDe(regla)
        )
        if (Number(n) > 0) filas.push({ tabla: regla.tabla, n: Number(n) })
      }
      await verificarAllowlist(tx, antes)
      return filas
    },
    { timeout: 60_000 }
  )
}

function imprimir(filas, total, modo) {
  const ancho = Math.max(...REGLAS.map((r) => r.tabla.length))
  for (const { tabla, n } of filas) {
    console.log(`  ${tabla.padEnd(ancho)}  ${String(n).padStart(4)}`)
  }
  const vacias = REGLAS.length - filas.length
  if (vacias > 0) console.log(`  (${vacias} tabla${vacias === 1 ? "" : "s"} sin filas que borrar)`)
  if (modo === "aplicar") {
    console.log(`e2e:limpiar — ${total} fila${total === 1 ? "" : "s"} purgada${total === 1 ? "" : "s"} en total`)
  } else if (total === 0) {
    console.log("e2e:limpiar — base limpia: 0 filas a purgar (dry-run)")
  } else {
    console.log(`e2e:limpiar — dry-run: ${total} fila${total === 1 ? "" : "s"} a purgar; no se borró nada (--apply para ejecutar)`)
  }
}

function leerEnv() {
  const contenidos = []
  for (const archivo of [".env", ".env.local"]) {
    const ruta = path.join(APP_DIR, archivo)
    if (existsSync(ruta)) contenidos.push(readFileSync(ruta, "utf8"))
  }
  return contenidos
}

async function main() {
  const opciones = leerArgs(process.argv.slice(2))
  if (opciones.ayuda) {
    console.log(AYUDA)
    return
  }

  const databaseUrl = resolverDatabaseUrl(process.env, leerEnv())
  const veredicto = evaluarEntorno({
    databaseUrl,
    appEnv: entornoEfectivo(process.env),
    nodeEnv: process.env.NODE_ENV ?? "",
  })
  if (!veredicto.ok) {
    console.error(`e2e:limpiar — ABORTADO: ${veredicto.motivo}`)
    console.error("  Esta purga sólo opera sobre la base SQLite local de desarrollo; no se tocó nada.")
    process.exitCode = 1
    return
  }

  // El client de Prisma lee DATABASE_URL del entorno: fijarlo evita que un
  // `prisma generate` previo del schema PostgreSQL apunte a otra base.
  process.env.DATABASE_URL = databaseUrl

  const modo = opciones.aplicar ? "aplicar" : "dry-run"
  console.log(
    `e2e:limpiar — modo: ${modo} · base: SQLite local (${path.relative(APP_DIR, veredicto.dbPath)})`
  )

  const db = new PrismaClient()
  try {
    const filas = modo === "aplicar" ? await aplicar(db) : await informar(db)
    const total = filas.reduce((suma, fila) => suma + fila.n, 0)
    imprimir(filas, total, modo)
  } finally {
    await db.$disconnect()
  }
}

if (process.argv[1] && process.argv[1].endsWith("limpiar-e2e.mjs")) {
  main().catch((err) => {
    console.error(`\ne2e:limpiar — ABORTADO: ${err.message}`)
    process.exitCode = 1
  })
}
