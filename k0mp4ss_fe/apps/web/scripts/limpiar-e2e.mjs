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
 * - Cada regla declara tabla + condiciones + motivo. NUNCA un barrido ciego `LIKE '%TEST%'`
 *   sobre todas las columnas de texto: uno anterior borró datos legítimos porque
 *   `arrendatario@test.cl` y los nombres de las comunidades demo contienen "TEST".
 * - `condiciones` son ALTERNATIVAS (se unen con OR); una alternativa puede llevar un AND
 *   interno cuando la fila de e2e se reconoce por la combinación de dos columnas (actas:
 *   `lugar` marcado O `minuta` marcada). Una regla AND-only perdería la mitad de las filas.
 * - Las reglas que dependen del estado (huérfanos, hijos) están ordenadas: hijos antes que
 *   padres, y el barrido de huérfanos DESPUÉS de purgar al padre. El orden del array es el
 *   orden de borrado.
 * - Allowlist dura: las 6 cuentas de login, las 2 comunidades demo (`comunidad-a`,
 *   `comunidad-b`) y las filas del seed (personas/unidades/vínculos) no se tocan. La
 *   transacción lo verifica ANTES de commitear: si un contador del seed baja, revierte todo.
 * - Hijos antes que padres, todo en UNA transacción; se imprime el conteo por tabla y el total.
 * - El motor se decide por el `DATABASE_URL` resuelto (`file:` → SQLite, `postgresql://` →
 *   Postgres): la misma tabla de reglas y el mismo modo de operación sirven a los dos. La
 *   diferencia de dialecto se resuelve en UNA capa (`adaptarSql`), no regla por regla:
 *   `LIKE`→`ILIKE` (en SQLite `LIKE` ya es insensible a mayúsculas ASCII; `ILIKE` es su
 *   equivalente), `?`→`$n` y los identificadores con mayúsculas entre comillas (Postgres
 *   pliega a minúsculas todo identificador sin citar, así que `Comunidad` o `elementoId`
 *   sin comillas no existen para el motor).
 * - Destino: borrar en una base gestionada exige declararla (`--destino=dev|produccion`).
 *   Sin ese flag `--apply` sólo borra en el SQLite local; un `--apply` copiado de la
 *   receta no puede vaciar una base publicada por inercia. La salida dice motor y destino,
 *   nunca la cadena de conexión ni el usuario.
 * - Idempotente: un dry-run inmediatamente después de un `--apply` informa 0 filas.
 *
 * Modo por defecto: DRY-RUN (informa y no borra nada). El borrado real exige `--apply`
 * explícito, igual que `e2e:higiene`, para que un operador nunca destruya datos por inercia.
 *
 * Uso (desde k0mp4ss_fe/apps/web):
 *   npm run e2e:limpiar                              # dry-run: reporta qué borraría
 *   npm run e2e:limpiar -- --dry-run                 # idem, explícito
 *   npm run e2e:limpiar -- --apply                   # borra de verdad (una transacción)
 *   npm run e2e:limpiar -- --apply --destino=dev     # borra en la base gestionada de dev
 *   npm run e2e:limpiar -- --help
 *
 * Playwright lo corre con `--apply` desde `globalSetup` (playwright.config.ts) para que
 * cada corrida arranque del mismo estado: sobre el SQLite local alcanza `--apply`; sobre una
 * base gestionada el hook tiene que declarar `--destino=dev`. En CI se omite salvo
 * `E2E_LIMPIEZA_CI=1`.
 *
 * Flags:
 *   --apply            ejecuta el borrado (sin este flag el script sólo informa)
 *   --dry-run          informa sin borrar; es el modo por defecto, se acepta explícito
 *   --destino <nombre> destino declarado: `local` | `dev` | `produccion` (obligatorio para
 *                      borrar en una base gestionada)
 *   --help             esta ayuda
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { PrismaClient } from "@prisma/client"
// El motor y la validez del valor los decide `lib/database-url.ts` (la misma pieza que usan
// las otras CLI de datos): acá se reusan sus funciones puras y su contrato de aviso, que
// nunca imprime el valor de la URL.
import {
  motivoPorElQueNoSirve,
  proveedorDeUrl,
  resolverUrlBase,
} from "../lib/database-url.ts"
// El guardia de entorno efectivo es el mismo de `datos:reset` (gana el más restrictivo).
import { entornoEfectivo } from "./datos-reset.mjs"

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/** Directorio del schema: Prisma resuelve las rutas `file:` relativas contra él. */
const PRISMA_DIR = path.join(APP_DIR, "prisma")

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

const AYUDA = `e2e:limpiar — purga el debris TEST/QA de las corridas e2e (SQLite local o Postgres)

  npm run e2e:limpiar                          dry-run: reporta qué borraría (default)
  npm run e2e:limpiar -- --dry-run             idem, explícito
  npm run e2e:limpiar -- --apply               borra de verdad, en una transacción
  npm run e2e:limpiar -- --apply --destino=dev

Flag               Descripción
--apply            Ejecuta el borrado. Sin este flag el script sólo informa.
--dry-run          Informa sin borrar. Es el modo por defecto; se acepta explícito.
--destino <x>      Destino declarado: local | dev | produccion.
                   Una base gestionada exige declararlo para borrar.
--help             Esta ayuda

El motor sale del DATABASE_URL resuelto: \`file:\` → SQLite, \`postgresql://\` → Postgres.
La salida dice motor y destino; nunca imprime la cadena de conexión ni el usuario.

Guarda dura: no corre si el entorno efectivo es producción. Con \`--apply\` sobre una base
gestionada hace falta --destino=dev|produccion; el SQLite local no lo necesita.`

/* ---------- argumentos ---------- */

function leerArgs(args) {
  const opciones = { aplicar: false, ayuda: false, destino: null }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--apply") opciones.aplicar = true
    else if (arg === "--dry-run") opciones.aplicar = false
    else if (arg === "--help" || arg === "-h") opciones.ayuda = true
    else if (arg === "--destino") {
      opciones.destino = args[++i] ?? null
      if (!opciones.destino) throw new Error(`--destino necesita un nombre (ej.: --destino=dev)\n\n${AYUDA}`)
    } else if (arg.startsWith("--destino=")) {
      opciones.destino = arg.slice("--destino=".length)
    } else throw new Error(`argumento desconocido: ${arg}\n\n${AYUDA}`)
  }
  return opciones
}

/* ---------- el motor y el destino ---------- */

/** Destinos que el operador puede declarar, con la etiqueta que se imprime. */
export const DESTINOS = {
  local: "SQLite local",
  dev: "rama dev",
  produccion: "rama produccion",
}

/**
 * Motor que pide una URL de base; `null` si no declara uno soportado.
 *
 * @param {string} url
 * @returns {"sqlite" | "postgres" | null}
 */
export function motorDeUrl(url) {
  const proveedor = proveedorDeUrl(url)
  if (proveedor === "sqlite") return "sqlite"
  if (proveedor === "postgresql") return "postgres"
  return null
}

/**
 * Decide si la purga puede operar, y sobre qué. Función pura: la usan `main()` y los tests.
 *
 * Rechazos, en orden: entorno efectivo de producción (aunque la base parezca local),
 * `DATABASE_URL` ausente o inservible, motor desconocido, `--destino` fuera del catálogo o
 * de otro motor, y `--apply` sobre una base gestionada sin destino declarado. El último es
 * el que impide que un `--apply` copiado de la receta borre en producción por inercia.
 *
 * @param {{ databaseUrl?: string, destino?: string | null, aplicar?: boolean, appEnv?: string, nodeEnv?: string }} [opciones]
 * @returns {{ ok: boolean, motivo?: string, motor?: "sqlite" | "postgres", destino?: string | null, dbPath?: string }}
 */
export function evaluarDestino({
  databaseUrl = "",
  destino = null,
  aplicar = false,
  appEnv = "",
  nodeEnv = "",
} = {}) {
  const entorno = String(appEnv || "").toLowerCase()
  const runtime = String(nodeEnv || "").toLowerCase()
  if (entorno === "production" || entorno === "prod") {
    return {
      ok: false,
      motivo:
        "entorno efectivo de producción (NEXT_PUBLIC_APP_ENV/APP_ENV=production): la purga de una base publicada se decide con el owner, no con un npm run",
    }
  }
  if (runtime === "production") {
    return { ok: false, motivo: "NODE_ENV=production: la purga corre con la base de desarrollo" }
  }
  if (!databaseUrl) {
    return {
      ok: false,
      motivo: "DATABASE_URL ausente: definila en el entorno o en apps/web/.env antes de purgar",
    }
  }
  const defecto = motivoPorElQueNoSirve(databaseUrl, null)
  if (defecto) return { ok: false, motivo: `DATABASE_URL inservible: ${defecto}` }

  const motor = motorDeUrl(databaseUrl)
  if (motor === null) {
    return {
      ok: false,
      motivo:
        "DATABASE_URL no declara un motor soportado (file: para SQLite, postgresql:// para Postgres)",
    }
  }

  if (destino !== null && !Object.hasOwn(DESTINOS, destino)) {
    return {
      ok: false,
      motivo: `--destino desconocido: "${destino}". Valores: ${Object.keys(DESTINOS).join(", ")}`,
    }
  }

  if (motor === "sqlite") {
    if (destino !== null && destino !== "local") {
      return {
        ok: false,
        motivo: `--destino=${destino} es una base gestionada y DATABASE_URL apunta a SQLite local`,
      }
    }
    return {
      ok: true,
      motor,
      destino: "local",
      dbPath: path.resolve(PRISMA_DIR, databaseUrl.slice("file:".length)),
    }
  }

  if (destino === "local") {
    return {
      ok: false,
      motivo: "--destino=local es SQLite local y DATABASE_URL apunta a una base gestionada",
    }
  }
  if (destino === null && aplicar) {
    return {
      ok: false,
      motivo:
        "borrar en una base gestionada exige --destino explícito (--destino=dev o --destino=produccion)",
    }
  }
  return { ok: true, motor, destino }
}

/** Etiqueta del destino que se imprime (sin la cadena de conexión ni el usuario). */
function etiquetaDeDestino({ motor, destino, dbPath = "" }) {
  if (motor === "sqlite") return `SQLite local (${path.relative(APP_DIR, dbPath)})`
  return destino ? DESTINOS[destino] : "sin declarar"
}

/**
 * Cabecera de la corrida: modo, motor y destino. Es el contrato visible del dry-run.
 *
 * @param {{ modo: string, motor: string, destino?: string | null, dbPath?: string }} cabecera
 */
export function cabeceraDePurga({ modo, motor, destino = null, dbPath = "" }) {
  return `e2e:limpiar — modo: ${modo} · motor: ${motor} · destino: ${etiquetaDeDestino({ motor, destino, dbPath })}`
}

/* ---------- reglas de purga ---------- */

/**
 * Condición `columna LIKE patron`. En SQLite LIKE es insensible a mayúsculas para ASCII, así
 * que `QA-%` también cubre `Qa-…`/`qa-…` (los elementos RA de e2e se crean como `Qa-sala-…`).
 * La regla se escribe en la forma base: `adaptarSql` la convierte a `ILIKE` cuando el motor
 * es Postgres, que es donde esa insensibilidad sí hay que pedirla.
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
export const REGLAS = [
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
    tabla: "avisos_cv",
    motivo:
      "avisos creados por el spec del visor: el título lleva el marcador «QA ». Es el debris que apilaba publicados en el carrusel público y hacía fallar `e2e/crud/visor.spec.ts`; se borra antes que su plantilla y que su acta",
    condiciones: [like("titulo", "QA%")],
  },
  {
    tabla: "certificados_ct",
    motivo:
      "certificados emitidos para una persona/unidad de prueba (helper e2e y UI), o cuyo origenRef lleva el marcador test- en cualquier posición: el certificado de e2e referencia un vínculo de prueba («v-test-residente»), así que la coincidencia no está al inicio",
    condiciones: [
      like("personaId", "test-%"),
      like("unidadId", "test-%"),
      like("origenRef", "%test-%"),
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
    tabla: "egresos_fi",
    motivo:
      "egresos creados por el spec de finanzas con descripción «QA Egreso …». El seed describe los gastos en lenguaje natural («Útiles de Aseo», «Notaria»), nunca con el marcador, así que el prefijo es señal suficiente",
    condiciones: [like("descripcion", "QA%")],
  },
  {
    tabla: "actas_gd",
    motivo:
      "actas creadas por el spec del libro de actas: el lugar es «Sede QA» o la minuta lleva «QA ». Las dos columnas son ALTERNATIVAS (OR, no AND) porque el acta de e2e puede dejar la minuta vacía: una regla AND-only no reclamaría esas filas",
    condiciones: [like("lugar", "%QA%"), like("minuta", "%QA %")],
  },
  {
    tabla: "actas_gd_archivadas",
    motivo:
      "copias archivadas de un acta de prueba (borrado lógico): el archivo conserva lugar y minuta, así que se purga con el mismo predicado OR que actas_gd",
    condiciones: [like("lugar", "%QA%"), like("minuta", "%QA %")],
  },
  {
    tabla: "plantillas_co",
    motivo:
      "plantillas de comunicación creadas por el spec de CO con nombre «QA Plantilla …». Va después de avisos_cv porque el aviso apunta a su plantilla",
    condiciones: [like("nombre", "QA%")],
  },
  {
    tabla: "proveedores_pe",
    motivo: "proveedores creados por el spec de proveedores con nombre QA-/Qa-",
    condiciones: [like("nombre", "QA-%"), like("nombre", "Qa-%")],
  },
  {
    tabla: "notificaciones",
    motivo:
      "avisos generados por entidades de prueba (reportes QA-, encomiendas TEST-) —es el mayor volumen— y el aviso de recepción de una encomienda que ya no existe. Esa última alternativa se evalúa DESPUÉS de la regla de encomiendas_pe: el aviso sólo queda huérfano cuando el padre desapareció, y si corriera antes reclamaría nada y el aviso se apilaría para siempre",
    condiciones: [
      like("asunto", "%TEST%"),
      like("asunto", "%QA-%"),
      like("cuerpo", "%TEST%"),
      like("cuerpo", "%QA-%"),
      {
        sql: "asunto = ? AND NOT EXISTS (SELECT 1 FROM encomiendas_pe e WHERE e.destinatarioPersonaId = notificaciones.destinatarioPersonaId AND e.fechaRecepcion = notificaciones.fecha)",
        params: ["Encomienda recibida en conserjería"],
      },
    ],
  },
  {
    tabla: "eventos_auditoria",
    motivo:
      "bitácora de entidades de prueba: referenciaId test- o descripción que nombra un marcador TEST/QA-, más las formas huérfanas —recepción de una encomienda que ya no existe, sincronización de una nómina que ya no existe, y eventos sobre una visita cuyo nombre lleva el marcador «QA ». Corre después de encomiendas_pe y liquidaciones_pl, que son las que dejan huérfanas a las dos primeras",
    condiciones: [
      like("referenciaId", "test-%"),
      like("descripcion", "%TEST%"),
      like("descripcion", "%QA-%"),
      {
        sql: "tipoAccion = 'PE_ENCOMIENDA_RECIBIDA' AND referenciaId NOT IN (SELECT id FROM encomiendas_pe)",
        params: [],
      },
      {
        sql: "tipoAccion = 'PL_EXPENSE_SYNC' AND referenciaId NOT IN (SELECT id FROM liquidaciones_pl)",
        params: [],
      },
      {
        sql: "referenciaId IN (SELECT id FROM bitacora_visitas_pe WHERE nombre LIKE ?)",
        params: ["QA %"],
      },
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
export function whereDe(regla) {
  return regla.condiciones.map((c) => `(${c.sql})`).join(" OR ")
}

/** Parámetros de una regla, en el orden en que aparecen en el WHERE. */
export function paramsDe(regla) {
  return regla.condiciones.flatMap((c) => c.params)
}

/* ---------- ejecución ---------- */

/**
 * Adapta un fragmento de SQL al motor destino. SQLite es la forma base (la que escribe la
 * tabla de reglas) y recibe el SQL sin cambios; Postgres necesita tres cosas, y las tres se
 * resuelven ACÁ y no regla por regla:
 *
 *   1. `LIKE` → `ILIKE`. En SQLite `LIKE` ya ignora mayúsculas en ASCII, así que las reglas
 *      usan patrones en minúsculas o mayúsculas sin distinguir (`test-%` cubre «Test-…»).
 *      En Postgres `LIKE` distingue: sin este cambio, la mitad del debris (`Qa-…`,
 *      `Test-…`) quedaría fuera y se apilaría para siempre.
 *   2. `?` → `$n`. Prisma pasa el SQL tal cual al motor y cada uno numera sus parámetros.
 *   3. Identificadores con mayúsculas entre comillas. Postgres pliega a minúsculas todo
 *      identificador sin citar: `Comunidad` o `elementoId` sin comillas no existen para el
 *      motor (en SQLite sí, porque compara sin distinguir mayúsculas).
 *
 * Lo que está entre comillas simples es un literal y no se toca; lo que ya está entre
 * comillas dobles tampoco. Ninguna condición usa `ESCAPE`, así que no hay nada más que
 * traducir.
 *
 * @param {string} sql
 * @param {"sqlite" | "postgres"} motor
 */
export function adaptarSql(sql, motor) {
  if (motor !== "postgres") return sql
  let salida = ""
  let parametro = 0
  let i = 0
  while (i < sql.length) {
    const actual = sql[i]
    if (actual === "'" || actual === '"') {
      const cierre = actual
      salida += actual
      i++
      while (i < sql.length) {
        const dentro = sql[i]
        salida += dentro
        i++
        if (dentro !== cierre) continue
        // Comilla escapada ('' o ""): el literal sigue abierto.
        if (sql[i] === cierre) {
          salida += cierre
          i++
          continue
        }
        break
      }
      continue
    }
    if (actual === "?") {
      parametro += 1
      salida += `$${parametro}`
      i++
      continue
    }
    if (/[A-Za-z_]/.test(actual)) {
      let j = i
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) j++
      salida += palabraParaPostgres(sql.slice(i, j))
      i = j
      continue
    }
    salida += actual
    i++
  }
  return salida
}

/**
 * Palabras clave del SQL que escribe la purga: no son identificadores que haya que citar.
 * La lista es cerrada a propósito: es el dialecto de este archivo. Si una regla nueva usa
 * otra palabra clave, se suma acá; el test de la traducción marca cualquier identificador
 * con mayúsculas que quede sin citar, que es el síntoma de haberse olvidado.
 */
const PALABRAS_CLAVE = new Set([
  "select",
  "count",
  "from",
  "where",
  "and",
  "or",
  "not",
  "in",
  "exists",
  "as",
  "delete",
  "like",
  "ilike",
  "is",
  "null",
])

/** Traduce una palabra suelta: comodín, palabra clave o identificador a citar. */
function palabraParaPostgres(palabra) {
  const clave = palabra.toLowerCase()
  if (clave === "like") return "ILIKE"
  if (PALABRAS_CLAVE.has(clave)) return palabra
  return /[A-Z]/.test(palabra) ? `"${palabra}"` : palabra
}

/** Consulta de conteo de una regla, en la forma base (SQLite). */
function consultaCuenta(regla) {
  return `SELECT COUNT(*) AS n FROM ${regla.tabla} WHERE ${whereDe(regla)}`
}

/** Consulta de borrado de una regla, en la forma base (SQLite). */
function consultaBorrado(regla) {
  return `DELETE FROM ${regla.tabla} WHERE ${whereDe(regla)}`
}

/**
 * Sentencias de una regla en el dialecto del motor. Las usan el dry-run, el borrado y los
 * tests: si alguien cambia el predicado, las tres cosas ven el mismo SQL.
 *
 * @param {Regla} regla
 * @param {"sqlite" | "postgres"} motor
 */
export function sqlDeCuenta(regla, motor = "sqlite") {
  return adaptarSql(consultaCuenta(regla), motor)
}

/** @param {Regla} regla @param {"sqlite" | "postgres"} motor */
export function sqlDeBorrado(regla, motor = "sqlite") {
  return adaptarSql(consultaBorrado(regla), motor)
}

/** Ejecuta un COUNT(*) y devuelve número (los dos motores pueden entregar BigInt). */
async function contar(tx, sql, params = [], motor = "sqlite") {
  const filas = await tx.$queryRawUnsafe(adaptarSql(sql, motor), ...params)
  return Number(filas[0]?.n ?? 0)
}

/**
 * Filas del seed que la purga NO puede tocar: personas que no son test-, unidades que no son
 * QA- y vínculos entre ambas. Se miden antes y después dentro de la misma transacción.
 */
async function contarSeed(tx, motor) {
  const [personasSeed, vinculosSeed, unidadesSeed] = await Promise.all([
    contar(tx, "SELECT COUNT(*) AS n FROM personas WHERE id NOT LIKE ?", ["test-%"], motor),
    contar(
      tx,
      "SELECT COUNT(*) AS n FROM vinculos WHERE personaId NOT LIKE ? AND unidadId NOT IN (SELECT id FROM unidades WHERE numero LIKE ?)",
      ["test-%", "QA-%"],
      motor
    ),
    contar(tx, "SELECT COUNT(*) AS n FROM unidades WHERE numero NOT LIKE ?", ["QA-%"], motor),
  ])
  return { personasSeed, vinculosSeed, unidadesSeed }
}

/**
 * Allowlist dura, verificada DENTRO de la transacción: si algo protegido desapareció, se
 * lanza el error y Prisma revierte todo el borrado.
 */
async function verificarAllowlist(tx, antes, motor) {
  const cuentas = await contar(
    tx,
    `SELECT COUNT(*) AS n FROM personas WHERE id IN (SELECT personaId FROM usuarios WHERE email IN (${CUENTAS_LOGIN.map(() => "?").join(", ")}))`,
    CUENTAS_LOGIN,
    motor
  )
  const comunidades = await contar(
    tx,
    `SELECT COUNT(*) AS n FROM Comunidad WHERE id IN (${COMUNIDADES_DEMO.map(() => "?").join(", ")})`,
    COMUNIDADES_DEMO,
    motor
  )
  const despues = await contarSeed(tx, motor)

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

/**
 * Filas que una regla reclamaría. La usan el dry-run y los tests de la tabla de reglas.
 * El default es SQLite (el motor de los tests y del e2e local); la purga pasa siempre el
 * motor que resolvió del `DATABASE_URL`. Si alguien lo olvida sobre Postgres, el error del
 * motor es inmediato (`no existe la columna elementoid`), no un borrado de más.
 */
export async function contarRegla(db, regla, motor = "sqlite") {
  return contar(db, consultaCuenta(regla), paramsDe(regla), motor)
}

/**
 * Borra las filas que la regla reclama y devuelve cuántas eran. Es el ÚNICO camino de borrado:
 * `aplicar` y los tests llaman acá, para que el predicado probado sea el que corre de verdad.
 */
export async function borrarRegla(db, regla, motor = "sqlite") {
  const n = await db.$executeRawUnsafe(sqlDeBorrado(regla, motor), ...paramsDe(regla))
  return Number(n)
}

/** Dry-run: conteo por regla, sin abrir transacción de escritura. */
async function informar(db, motor) {
  const filas = []
  for (const regla of REGLAS) {
    const n = await contarRegla(db, regla, motor)
    if (n > 0) filas.push({ tabla: regla.tabla, n })
  }
  return filas
}

/** Borrado real: una transacción, hijos → padres, con verificación de allowlist antes del commit. */
async function aplicar(db, motor) {
  return db.$transaction(
    async (tx) => {
      const antes = await contarSeed(tx, motor)
      const filas = []
      for (const regla of REGLAS) {
        const n = await borrarRegla(tx, regla, motor)
        if (n > 0) filas.push({ tabla: regla.tabla, n })
      }
      await verificarAllowlist(tx, antes, motor)
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

/** Archivos de entorno leídos por el resolvedor, en orden de precedencia. */
function leerEnv() {
  const archivos = []
  for (const nombre of [".env", ".env.local"]) {
    const ruta = path.join(APP_DIR, nombre)
    if (existsSync(ruta)) archivos.push({ nombre, contenido: readFileSync(ruta, "utf8") })
  }
  return archivos
}

async function main() {
  const opciones = leerArgs(process.argv.slice(2))
  if (opciones.ayuda) {
    console.log(AYUDA)
    return
  }

  // El resolvedor es el mismo de las CLI de datos: shell > .env > .env.local, y avisa qué
  // candidato descartó (nunca el valor). Acá no se filtra por el cliente generado: el motor
  // lo pide la URL, y si el cliente no coincide el que avisa es Prisma.
  let resuelta
  try {
    resuelta = resolverUrlBase({
      entorno: process.env,
      archivos: leerEnv(),
      proveedorEsperado: null,
    })
  } catch (error) {
    console.error(`e2e:limpiar — ABORTADO: ${error.message}`)
    console.error("  No se tocó nada.")
    process.exitCode = 1
    return
  }
  for (const descartado of resuelta.descartados) {
    console.warn(`[db-url] descartado: ${descartado}`)
  }

  const veredicto = evaluarDestino({
    databaseUrl: resuelta.url,
    destino: opciones.destino,
    aplicar: opciones.aplicar,
    appEnv: entornoEfectivo(process.env),
    nodeEnv: process.env.NODE_ENV ?? "",
  })
  if (!veredicto.ok) {
    console.error(`e2e:limpiar — ABORTADO: ${veredicto.motivo}`)
    console.error("  No se tocó nada.")
    process.exitCode = 1
    return
  }

  // El client de Prisma lee DATABASE_URL del entorno: fijarlo evita que un
  // `prisma generate` previo del schema PostgreSQL apunte a otra base.
  process.env.DATABASE_URL = resuelta.url

  const modo = opciones.aplicar ? "aplicar" : "dry-run"
  console.log(
    cabeceraDePurga({ modo, motor: veredicto.motor, destino: veredicto.destino, dbPath: veredicto.dbPath })
  )
  if (veredicto.motor === "postgres" && !veredicto.destino) {
    console.log("  destino no declarado: sólo lectura; para borrar usá --apply --destino=dev|produccion")
  }

  const db = new PrismaClient()
  try {
    const filas = modo === "aplicar" ? await aplicar(db, veredicto.motor) : await informar(db, veredicto.motor)
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
