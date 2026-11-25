#!/usr/bin/env node
/**
 * scripts/jdd.mjs — cambia entre los dos juegos de datos del MISMO Postgres.
 *
 * Contexto (ventana `jdd-juego-de-datos`): el owner quiere partir la base de producción a
 * cero, cargar los defaults del sistema y después subir CSVs a mano como administrador. La
 * red de seguridad es una rama de Neon (`jdd1-pre-reset-20261125`). Este comando existe para
 * que ese reset sea REVERSIBLE: sin `snapshot`/`restore`, el wipe es un borrado de una sola
 * dirección.
 *
 * Reglas duras que implementa:
 *  1. Nunca imprime `DATABASE_URL`: sólo host y nombre de base.
 *  2. Sólo Postgres. La base SQLite de los tests (`prisma/perf-test.db`) no se toca desde acá.
 *  3. `wipe` y `restore` exigen `--confirmo=BORRAR` exacto; sin guarda imprimen el plan y
 *     salen con código 2. `--dry-run` imprime el plan y no escribe nada.
 *  4. El orden de tablas sale de `pg_constraint` (topológico), no de una lista fija.
 *  5. `restore` lee de una rama de Neon vía `neonctl connection-string`, trunca el destino y
 *     después inserta padres antes que hijos, una transacción por tabla y lotes de 500 filas.
 *  6. `seed` delega en los scripts existentes; no reimplementa seeds.
 *
 * Uso (desde k0mp4ss_fe/apps/web):
 *   npm run jdd -- estado
 *   npm run jdd -- estado --dry-run
 *   npm run jdd -- wipe --dry-run
 *   npm run jdd -- wipe --confirmo=BORRAR
 *   npm run jdd -- seed --comunidad=comunidad-a
 *   npm run jdd -- snapshot jdd2-pre-pruebas
 *   npm run jdd -- restore jdd1-pre-reset-20261125 --confirmo=BORRAR
 *
 * Variables: `DATABASE_URL` (Postgres), `NEON_PROJECT_ID` y `NEON_ORG_ID` (o `--project-id=` /
 * `--org-id=`). Sin `DATABASE_URL` en el entorno se lee `apps/web/.env`, misma convención que
 * `backup-db.mjs` y `restore-db.mjs`.
 */
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
/** Guarda única de borrado: el literal, tal cual, sin alias. */
const GUARDA = "BORRAR"
/** Filas por INSERT (requisito) y techo de parámetros por sentencia de Postgres (65535). */
const LOTE_FILAS = 500
const MAX_PARAMETROS = 30_000
/** `_prisma_migrations` no se trunca: sin su historial, `prisma migrate deploy` se rompe. */
const TABLAS_DEL_SISTEMA = new Set(["_prisma_migrations"])
const SALIDA_OK = 0
const SALIDA_ERROR = 1
const SALIDA_SIN_GUARDA = 2

/* ============================================================================
 * Piezas puras — las fija `test/jdd.test.ts`. Nada de red, base ni proceso acá.
 * ========================================================================== */

/**
 * @param {string[]} argv
 * @returns {{comando: string|null, posicional: string[], dryRun: boolean, confirmo: boolean,
 *   comunidad: string|null, proyecto: string|null, org: string|null, ayuda: boolean,
 *   desconocidos: string[]}}
 */
export function parsearArgs(argv = []) {
  const args = {
    comando: null,
    posicional: [],
    dryRun: false,
    confirmo: false,
    comunidad: null,
    proyecto: null,
    org: null,
    ayuda: false,
    desconocidos: [],
  }

  for (const token of argv) {
    if (typeof token !== "string" || token === "") continue
    if (!token.startsWith("-")) {
      if (args.comando === null) args.comando = token
      else args.posicional.push(token)
      continue
    }
    if (token === "--dry-run") {
      args.dryRun = true
      continue
    }
    if (token === "--help" || token === "-h") {
      args.ayuda = true
      continue
    }

    const corte = token.indexOf("=")
    const nombre = corte === -1 ? token.slice(2) : token.slice(2, corte)
    const valor = corte === -1 ? null : token.slice(corte + 1)

    switch (nombre) {
      case "confirmo":
        // Comparación exacta: `borrar`, `BORRAR ` o `BORRAR-TODO` NO habilitan el borrado.
        args.confirmo = valor === GUARDA
        break
      case "comunidad":
      case "comunidad-id":
        if (valor) args.comunidad = valor
        break
      case "project-id":
        if (valor) args.proyecto = valor
        break
      case "org-id":
        if (valor) args.org = valor
        break
      default:
        args.desconocidos.push(token)
    }
  }

  return args
}

/**
 * Clasifica la URL sin devolverla nunca: el resultado sólo lleva esquema, host y base.
 * @param {string} url
 * @returns {{ok: true, esquema: string, host: string, base: string} |
 *   {ok: false, esquema?: string, motivo: string}}
 */
export function evaluarUrl(url) {
  const crudo = typeof url === "string" ? url.trim() : ""
  if (!crudo) {
    return {
      ok: false,
      motivo:
        "Falta DATABASE_URL (ni en el entorno ni en apps/web/.env). Solo Postgres: este comando no toca otra base.",
    }
  }

  const esquema = crudo.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)?.[1]?.toLowerCase() ?? ""
  if (esquema !== "postgres" && esquema !== "postgresql") {
    return {
      ok: false,
      esquema,
      motivo:
        `Solo Postgres: DATABASE_URL usa el esquema "${esquema || "desconocido"}" y este comando no toca ` +
        "otra base (el carril SQLite de tests es aparte).",
    }
  }

  let parseada
  try {
    parseada = new URL(crudo)
  } catch {
    return {
      ok: false,
      esquema,
      motivo: "DATABASE_URL es Postgres pero no es una URL válida; no se muestra su contenido por seguridad.",
    }
  }

  const host = [parseada.hostname, parseada.port].filter(Boolean).join(":") || "(sin host)"
  let base = "(sin nombre)"
  try {
    base = decodeURIComponent(parseada.pathname).replace(/^\/+/, "") || "(sin nombre)"
  } catch {
    base = parseada.pathname.replace(/^\/+/, "") || "(sin nombre)"
  }

  return { ok: true, esquema, host, base }
}

/**
 * Orden topológico de tablas: los padres antes que los hijos. Determinista (alfabético entre
 * nodos listos) y con detección de ciclos: devuelve error en vez de colgarse o de ordenar a
 * ciegas. Las FKs hacia tablas fuera del conjunto y las auto-referencias se ignoran.
 *
 * @param {string[]} tablas
 * @param {{hija: string, padre: string}[]} fks
 * @returns {{ok: true, orden: string[]} | {ok: false, error: string}}
 */
export function ordenTopologico(tablas = [], fks = []) {
  const comparar = (a, b) => a.localeCompare(b, "es")
  const nodos = [...new Set(tablas.map(String))].sort(comparar)
  const conjunto = new Set(nodos)
  /** @type {Map<string, Set<string>>} hijos de cada padre */
  const hijos = new Map(nodos.map((tabla) => [tabla, new Set()]))
  /** @type {Map<string, number>} FKs entrantes que todavía no se satisfacen */
  const pendientes = new Map(nodos.map((tabla) => [tabla, 0]))

  for (const fk of Array.isArray(fks) ? fks : []) {
    const hija = fk?.hija
    const padre = fk?.padre
    if (!conjunto.has(hija) || !conjunto.has(padre) || hija === padre) continue
    if (hijos.get(padre).has(hija)) continue
    hijos.get(padre).add(hija)
    pendientes.set(hija, pendientes.get(hija) + 1)
  }

  const listos = nodos.filter((tabla) => pendientes.get(tabla) === 0)
  const orden = []
  while (listos.length > 0) {
    const tabla = listos.shift()
    orden.push(tabla)
    for (const hija of hijos.get(tabla)) {
      const quedan = pendientes.get(hija) - 1
      pendientes.set(hija, quedan)
      if (quedan === 0) {
        listos.push(hija)
        listos.sort(comparar)
      }
    }
  }

  if (orden.length !== nodos.length) {
    const enCiclo = nodos.filter((tabla) => pendientes.get(tabla) > 0)
    return {
      ok: false,
      error:
        `Hay un ciclo de claves foráneas entre: ${enCiclo.join(", ")}. ` +
        "No se ordena a ciegas: revisá el esquema antes de borrar o restaurar.",
    }
  }

  return { ok: true, orden }
}

/**
 * Resumen por tabla del restore: filas leídas del origen vs. escritas en el destino. Una tabla
 * del destino que no existe en el origen se informa como `faltante` y no invalida el resto.
 *
 * @param {{tablasDestino?: string[], tablasOrigen?: string[], leidas?: Record<string, number>,
 *   escritas?: Record<string, number>}} [datos]
 * @returns {{
 *   filas: {tabla: string, leidas: number, escritas: number,
 *     estado: "ok"|"descuadre"|"faltante"|"sin-destino"}[],
 *   totales: {leidas: number, escritas: number},
 *   faltantes: string[], sinDestino: string[], descuadres: string[], todoCuadra: boolean}}
 */
export function armarResumen({
  tablasDestino = [],
  tablasOrigen = [],
  leidas = {},
  escritas = {},
} = {}) {
  const enOrigen = new Set(tablasOrigen)
  const enDestino = new Set(tablasDestino)
  /** @type {{tabla: string, leidas: number, escritas: number, estado: string}[]} */
  const filas = []

  for (const tabla of tablasDestino) {
    const existe = enOrigen.has(tabla)
    const leidasTabla = existe ? Number(leidas[tabla] ?? 0) : 0
    const escritasTabla = existe ? Number(escritas[tabla] ?? 0) : 0
    const estado = !existe ? "faltante" : leidasTabla === escritasTabla ? "ok" : "descuadre"
    filas.push({ tabla, leidas: leidasTabla, escritas: escritasTabla, estado })
  }

  const sinDestino = []
  for (const tabla of tablasOrigen) {
    if (enDestino.has(tabla)) continue
    filas.push({ tabla, leidas: Number(leidas[tabla] ?? 0), escritas: 0, estado: "sin-destino" })
    sinDestino.push(tabla)
  }

  return {
    filas,
    totales: {
      leidas: filas.reduce((suma, fila) => suma + fila.leidas, 0),
      escritas: filas.reduce((suma, fila) => suma + fila.escritas, 0),
    },
    faltantes: filas.filter((fila) => fila.estado === "faltante").map((fila) => fila.tabla),
    sinDestino,
    descuadres: filas.filter((fila) => fila.estado === "descuadre").map((fila) => fila.tabla),
    todoCuadra: filas.every((fila) => fila.estado !== "descuadre"),
  }
}

/**
 * Plan legible del wipe. Es sólo texto: no abre conexiones ni escribe. La sentencia impresa es
 * exactamente la que se ejecuta después de la guarda.
 *
 * @param {string[]} orden tablas en orden de dependencias
 * @param {{destino?: {host: string, base: string}|null, dryRun?: boolean, confirmo?: boolean,
 *   excluidas?: string[]}} [opciones]
 */
export function construirPlanWipe(orden = [], { destino = null, dryRun = true, confirmo = false, excluidas = [] } = {}) {
  const tablas = orden.filter((tabla) => !TABLAS_DEL_SISTEMA.has(tabla))
  const lineas = [
    "Plan de wipe (vaciar public)",
    `  Base destino : ${destino ? `${destino.host} / ${destino.base}` : "(sin conexión)"}`,
    `  Modo         : ${
      dryRun ? "simulación (--dry-run): no se escribe nada" : confirmo ? "EJECUCIÓN real" : "sin guarda: se aborta sin escribir"
    }`,
    `  Guarda       : --confirmo=${GUARDA} ${confirmo ? "✓ presente" : "✗ ausente"}`,
  ]
  if (excluidas.length > 0) {
    lineas.push(`  No se toca   : ${excluidas.join(", ")} (historial de migraciones de Prisma)`)
  }
  lineas.push(`  Tablas (${tablas.length}), en orden de dependencias:`)
  lineas.push(`    ${tablas.length > 0 ? tablas.join(" → ") : "(ninguna)"}`)
  lineas.push(
    `  Sentencia    : ${
      tablas.length > 0
        ? `TRUNCATE ${tablas.map((tabla) => `"${tabla}"`).join(", ")} RESTART IDENTITY CASCADE`
        : "TRUNCATE (no hay tablas: nada que borrar)"
    }`,
  )
  return lineas.join("\n")
}

/* ============================================================================
 * Utilidades de proceso y redacción
 * ========================================================================== */

/** Datos que no deben aparecer nunca en una salida (se registran al resolver la URL). */
let datosSensibles = []

function registrarDatosSensibles(...valores) {
  for (const valor of valores) {
    if (typeof valor !== "string" || valor.length < 6) continue
    datosSensibles.push(valor)
    try {
      const parseada = new URL(valor)
      if (parseada.password) datosSensibles.push(decodeURIComponent(parseada.password))
    } catch {
      // No es una URL: se redacta igual el literal completo.
    }
  }
  datosSensibles = [...new Set(datosSensibles)].sort((a, b) => b.length - a.length)
}

/** Reemplaza la URL, su password y cualquier `postgres://…` por un marcador. */
function redactar(texto) {
  let salida = String(texto ?? "")
  for (const dato of datosSensibles) salida = salida.split(dato).join("<oculta>")
  return salida.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgres://<oculta>")
}

/** Identificador SQL citado. */
function q(ident) {
  return `"${String(ident).replaceAll('"', '""')}"`
}

function esTablaDelSistema(tabla) {
  return TABLAS_DEL_SISTEMA.has(tabla)
}

function binarioNpm() {
  return process.platform === "win32" ? "npm.cmd" : "npm"
}

/* ============================================================================
 * Resolución de la base y conexión
 * ========================================================================== */

/**
 * `DATABASE_URL` del shell gana sobre `.env`/`.env.local` (misma convención que
 * `backup-db.mjs`, `restore-db.mjs` y `e2e-fresh.mjs`).
 *
 * @param {{entorno?: Record<string, string|undefined>, appDir?: string}} [opciones]
 * @returns {string|null}
 */
export function resolverDatabaseUrl({ entorno = process.env, appDir = APP_DIR } = {}) {
  const delShell = entorno?.DATABASE_URL?.trim()
  if (delShell) return delShell

  for (const archivo of [".env", ".env.local"]) {
    const ruta = path.join(appDir, archivo)
    if (!existsSync(ruta)) continue
    const coincidencia = readFileSync(ruta, "utf8").match(/^\s*DATABASE_URL\s*=\s*(.+)$/m)
    if (!coincidencia) continue
    const valor = coincidencia[1].trim().replace(/^["']|["']$/g, "")
    if (valor) return valor
  }

  return null
}

/** Devuelve `{host, base}` o lanza con el motivo ya redactado. */
function destinoPostgres(url) {
  const chequeo = evaluarUrl(url)
  if (!chequeo.ok) throw new Error(chequeo.motivo)
  return chequeo
}

async function conectar(url, { soloLectura = false } = {}) {
  const { Client } = await import("pg")
  const cliente = new Client({
    connectionString: url,
    connectionTimeoutMillis: 20_000,
    application_name: "jdd",
  })
  await cliente.connect()
  if (soloLectura) {
    // La rama de Neon de la que se lee no debe recibir escrituras ni por accidente.
    await cliente.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
  }
  return cliente
}

async function listarTablas(cliente) {
  const { rows } = await cliente.query(`
    SELECT c.relname AS tabla
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY c.relname
  `)
  return rows.map((fila) => fila.tabla)
}

/** @returns {Promise<Map<string, string[]>>} columnas por tabla, en orden de definición */
async function listarColumnas(cliente) {
  const { rows } = await cliente.query(`
    SELECT table_name AS tabla, column_name AS columna
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND is_generated = 'NEVER'
      AND (identity_generation IS NULL OR identity_generation = 'BY DEFAULT')
    ORDER BY table_name, ordinal_position
  `)
  const mapa = new Map()
  for (const { tabla, columna } of rows) {
    if (!mapa.has(tabla)) mapa.set(tabla, [])
    mapa.get(tabla).push(columna)
  }
  return mapa
}

async function leerFks(cliente) {
  const { rows } = await cliente.query(`
    SELECT hija.relname AS hija, padre.relname AS padre
    FROM pg_constraint c
    JOIN pg_class hija ON hija.oid = c.conrelid
    JOIN pg_class padre ON padre.oid = c.confrelid
    JOIN pg_namespace nh ON nh.oid = hija.relnamespace
    JOIN pg_namespace np ON np.oid = padre.relnamespace
    WHERE c.contype = 'f' AND nh.nspname = 'public' AND np.nspname = 'public'
  `)
  const vistos = new Set()
  const fks = []
  for (const { hija, padre } of rows) {
    const clave = `${hija}\u0000${padre}`
    if (vistos.has(clave)) continue
    vistos.add(clave)
    fks.push({ hija, padre })
  }
  return fks
}

/** Tablas en orden de dependencias, calculado desde `pg_constraint`. */
async function ordenDeBase(cliente) {
  const [tablas, fks] = await Promise.all([listarTablas(cliente), leerFks(cliente)])
  const resultado = ordenTopologico(tablas, fks)
  if (!resultado.ok) throw new Error(resultado.error)
  return resultado.orden
}

async function contarFilas(cliente, tablas) {
  const conteos = {}
  for (const tabla of tablas) {
    try {
      const { rows } = await cliente.query(`SELECT count(*)::bigint AS filas FROM ${q(tabla)}`)
      conteos[tabla] = Number(rows[0].filas)
    } catch (error) {
      conteos[tabla] = null
      console.warn(`  ⚠ no se pudo contar ${tabla}: ${redactar(error.message)}`)
    }
  }
  return conteos
}

function sumarConteos(conteos) {
  return Object.values(conteos).reduce((suma, filas) => suma + (filas ?? 0), 0)
}

async function truncar(cliente, tablas) {
  const aTruncar = tablas.filter((tabla) => !esTablaDelSistema(tabla))
  if (aTruncar.length === 0) return 0
  await cliente.query(`TRUNCATE ${aTruncar.map(q).join(", ")} RESTART IDENTITY CASCADE`)
  return aTruncar.length
}

/* ============================================================================
 * Restore: lectura por cursor de la rama y escritura por lotes en el destino
 * ========================================================================== */

/**
 * Lotes de filas del origen mediante cursor: no carga la tabla entera en memoria. El cursor
 * vive en una transacción read-only de la rama y se cierra siempre.
 *
 * @param {import("pg").Client} origen
 * @param {string} tabla
 * @param {string[]} columnas
 * @param {number} [tamano]
 */
async function* leerLotes(origen, tabla, columnas, tamano = LOTE_FILAS) {
  await origen.query("BEGIN")
  try {
    await origen.query(
      `DECLARE jdd_lote NO SCROLL CURSOR FOR SELECT ${columnas.map(q).join(", ")} FROM ${q(tabla)}`,
    )
    try {
      while (true) {
        const { rows } = await origen.query(`FETCH FORWARD ${tamano} FROM jdd_lote`)
        if (rows.length === 0) return
        yield rows
        if (rows.length < tamano) return
      }
    } finally {
      await origen.query("CLOSE jdd_lote").catch(() => {})
    }
  } finally {
    await origen.query("COMMIT").catch(() => {})
  }
}

/**
 * Un `INSERT` multi-fila por lote, acotado también por cantidad de parámetros: 500 filas × 130
 * columnas supera el máximo de Postgres (65535), así que el lote baja solo cuando hace falta.
 */
async function insertarFilas(cliente, tabla, columnas, filas) {
  if (filas.length === 0 || columnas.length === 0) return
  const porParametros = Math.max(1, Math.floor(MAX_PARAMETROS / columnas.length))
  const tamano = Math.min(LOTE_FILAS, porParametros)
  const listaColumnas = columnas.map(q).join(", ")

  for (let inicio = 0; inicio < filas.length; inicio += tamano) {
    const trozo = filas.slice(inicio, inicio + tamano)
    const valores = []
    const grupos = trozo.map((fila) => {
      const marcas = columnas.map((columna) => {
        valores.push(fila[columna])
        return `$${valores.length}`
      })
      return `(${marcas.join(", ")})`
    })
    await cliente.query(`INSERT INTO ${q(tabla)} (${listaColumnas}) VALUES ${grupos.join(", ")}`, valores)
  }
}

/** Copia una tabla en una única transacción; si algo falla, rollback de la tabla y error con nombre. */
async function restaurarTabla({ origen, destino, tabla, columnas }) {
  let leidas = 0
  let escritas = 0

  await destino.query("BEGIN")
  try {
    for await (const filas of leerLotes(origen, tabla, columnas)) {
      leidas += filas.length
      await insertarFilas(destino, tabla, columnas, filas)
      escritas += filas.length
    }
    await destino.query("COMMIT")
  } catch (error) {
    await destino.query("ROLLBACK").catch(() => {})
    throw new Error(
      `Falló la tabla "${tabla}" (${leidas} filas leídas, ${escritas} escritas; rollback de esa tabla): ` +
        redactar(error.message),
    )
  }

  return { leidas, escritas }
}

/**
 * Tras truncar con `RESTART IDENTITY` e insertar ids explícitos, las secuencias quedan atrás y
 * el primer alta del sistema chocaría con la PK. Se ponen al día; best-effort por secuencia.
 */
async function resincronizarSecuencias(cliente, tablas) {
  const { rows } = await cliente.query(`
    SELECT c.relname AS tabla, a.attname AS columna
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND pg_get_serial_sequence(format('public.%I', c.relname), a.attname) IS NOT NULL
    ORDER BY c.relname, a.attnum
  `)

  const permitidas = new Set(tablas)
  let ajustadas = 0
  for (const { tabla, columna } of rows) {
    if (!permitidas.has(tabla) || esTablaDelSistema(tabla)) continue
    try {
      const { rows: estado } = await cliente.query(
        `SELECT COALESCE(MAX(${q(columna)}), 0)::bigint AS maximo, count(*)::bigint AS total FROM ${q(tabla)}`,
      )
      const maximo = Number(estado[0].maximo)
      const total = Number(estado[0].total)
      await cliente.query("SELECT setval(pg_get_serial_sequence($1, $2), $3::bigint, $4::boolean)", [
        `public.${q(tabla)}`,
        columna,
        total === 0 ? 1 : maximo,
        total !== 0,
      ])
      ajustadas += 1
    } catch (error) {
      console.warn(`  ⚠ no se pudo resincronizar ${tabla}.${columna}: ${redactar(error.message)}`)
    }
  }
  return ajustadas
}

/* ============================================================================
 * Neon
 * ========================================================================== */

function idsNeon(args) {
  const proyecto = args.proyecto ?? process.env.NEON_PROJECT_ID
  const org = args.org ?? process.env.NEON_ORG_ID
  if (!proyecto) {
    throw new Error("Falta el id del proyecto de Neon: definí NEON_PROJECT_ID (env) o pasá --project-id=<id>.")
  }
  if (!org) {
    throw new Error("Falta el id de la organización de Neon: definí NEON_ORG_ID (env) o pasá --org-id=<id>.")
  }
  return { proyecto, org }
}

/** Ejecuta `neonctl` capturando stdout (puede traer credenciales: nunca se imprime crudo). */
function neonctl(argumentos) {
  const resultado = spawnSync("neonctl", argumentos, { encoding: "utf8" })
  if (resultado.error?.code === "ENOENT") {
    throw new Error(
      "neonctl no está instalado o no está en el PATH. Instalalo (`npm i -g neonctl`) y volvé a intentar; " +
        "sin neonctl no hay snapshot ni restore desde una rama.",
    )
  }
  if (resultado.error) throw new Error(`No se pudo ejecutar neonctl: ${redactar(resultado.error.message)}`)
  if (resultado.status !== 0) {
    const detalle = (resultado.stderr || resultado.stdout || "").trim().split("\n").slice(-3).join(" | ")
    throw new Error(`neonctl falló (código ${resultado.status})${detalle ? `: ${redactar(detalle)}` : ""}`)
  }
  return resultado.stdout ?? ""
}

/** Cadena de conexión de una rama. Se registra como sensible y no se imprime nunca. */
function cadenaDeRama(rama, { proyecto, org }) {
  const salida = neonctl(["connection-string", rama, "--project-id", proyecto, "--org-id", org])
  const linea = salida
    .split("\n")
    .map((texto) => texto.trim())
    .filter((texto) => /^postgres(ql)?:\/\//i.test(texto))
    .pop()
  if (!linea) {
    throw new Error(
      `neonctl no devolvió una cadena de conexión para la rama "${rama}". Revisá el nombre o creá la rama con "snapshot".`,
    )
  }
  registrarDatosSensibles(linea)
  return linea
}

function extraerIdRama(salida) {
  try {
    const datos = JSON.parse(salida)
    const id = datos?.branch?.id ?? datos?.id ?? datos?.branches?.[0]?.id
    if (typeof id === "string" && id.length > 0) return id
  } catch {
    // Salida no-JSON (versión vieja o tabla): se busca el id abajo.
  }
  const coincidencia = salida.match(/\bbr-[a-z0-9-]+\b/i)
  return coincidencia ? coincidencia[0] : null
}

/* ============================================================================
 * Comandos
 * ========================================================================== */

function imprimirAyuda() {
  console.log(`
jdd — cambia entre los dos juegos de datos del MISMO Postgres.

Comandos (desde k0mp4ss_fe/apps/web):
  npm run jdd -- estado                          a qué base apunta y cuántas filas por tabla
  npm run jdd -- wipe --confirmo=BORRAR         vacía las tablas de public
  npm run jdd -- seed --comunidad=<id>          defaults del sistema (scripts existentes)
  npm run jdd -- restore <rama-neon>            trae de vuelta los datos de una rama de Neon
  npm run jdd -- snapshot <nombre>              crea una rama de Neon como copia de seguridad

Todos aceptan --dry-run: imprimen el plan y no escriben nada.
Guarda de borrado: --confirmo=BORRAR exacto (sin ella, wipe y restore salen con código 2).
Sólo Postgres: la base SQLite de los tests no se toca desde acá. La URL nunca se imprime.
Variables: DATABASE_URL, NEON_PROJECT_ID, NEON_ORG_ID (o --project-id=/--org-id=).
`)
}

async function cmdEstado({ args, url }) {
  const destino = destinoPostgres(url)
  console.log(`Base destino: ${destino.host} / ${destino.base}`)
  console.log(
    args.dryRun
      ? "Modo: sólo lectura (--dry-run no cambia nada acá: `estado` nunca escribe)"
      : "Modo: sólo lectura",
  )

  const cliente = await conectar(url)
  try {
    const tablas = await listarTablas(cliente)
    const conteos = await contarFilas(cliente, tablas)
    const ancho = Math.max(5, ...tablas.map((tabla) => tabla.length))
    for (const tabla of tablas) {
      const filas = conteos[tabla]
      const nota = esTablaDelSistema(tabla) ? "  (del sistema: no se toca en wipe/restore)" : ""
      console.log(`  ${tabla.padEnd(ancho)}  ${(filas === null ? "?" : String(filas)).padStart(8)}${nota}`)
    }
    console.log(
      `✓ ${tablas.length} tablas · ${sumarConteos(conteos)} filas en total · ` +
        `(wipe tocaría ${tablas.filter((tabla) => !esTablaDelSistema(tabla)).length})`,
    )
    console.log("Siguiente paso: `snapshot <nombre>` antes de tocar nada, `wipe` para volver a cero.")
  } finally {
    await cliente.end()
  }
  return SALIDA_OK
}

async function cmdWipe({ args, url }) {
  const destino = destinoPostgres(url)
  const cliente = await conectar(url)
  try {
    const orden = await ordenDeBase(cliente)
    const aBorrar = orden.filter((tabla) => !esTablaDelSistema(tabla))
    const antes = await contarFilas(cliente, aBorrar)

    console.log(
      construirPlanWipe(orden, {
        destino,
        dryRun: args.dryRun,
        confirmo: args.confirmo,
        excluidas: [...TABLAS_DEL_SISTEMA],
      }),
    )
    console.log(`  Filas a borrar: ${sumarConteos(antes)}`)

    if (args.dryRun) {
      console.log("✓ Simulación: no se escribió nada.")
      return SALIDA_OK
    }
    if (!args.confirmo) {
      console.error(`✗ Falta --confirmo=${GUARDA}. No se borró nada.`)
      return SALIDA_SIN_GUARDA
    }

    const tablasVaciadas = await truncar(cliente, aBorrar)
    const despues = await contarFilas(cliente, aBorrar)
    const quedan = sumarConteos(despues)

    console.log(`✓ wipe: ${tablasVaciadas} tablas vaciadas · ${sumarConteos(antes)} filas borradas`)
    if (quedan !== 0) {
      console.error(`✗ Verificación fallida: quedan ${quedan} filas en ${tablasVaciadas} tablas.`)
      return SALIDA_ERROR
    }
    console.log(`✓ Verificación: 0 filas en las ${tablasVaciadas} tablas · _prisma_migrations intacta`)
    console.log("Siguiente paso: `npm run jdd -- seed --comunidad=<id>` para cargar los defaults.")
    return SALIDA_OK
  } finally {
    await cliente.end()
  }
}

function pasosSeed(comunidad) {
  return [
    { etiqueta: "seed:authz (usuarios, roles y comunidades base)", args: ["run", "seed:authz"] },
    { etiqueta: "db:catalogo-nacional (catálogo nacional)", args: ["run", "db:catalogo-nacional"] },
    { etiqueta: "seed:datos (datos de la comunidad)", args: ["run", "seed:datos", "--", `--comunidad-id=${comunidad}`] },
    { etiqueta: "db:fondos-fi (fondos F/I de la comunidad)", args: ["run", "db:fondos-fi", "--", `--comunidad-id=${comunidad}`] },
  ]
}

async function cmdSeed({ args, url }) {
  if (!args.comunidad) {
    console.error("✗ Falta --comunidad=<id> (ej.: --comunidad=comunidad-a). No se ejecutó ningún seed.")
    return SALIDA_ERROR
  }

  const destino = destinoPostgres(url)
  const pasos = pasosSeed(args.comunidad)
  console.log(`Base destino: ${destino.host} / ${destino.base}`)
  console.log(`Seed de defaults del sistema · comunidad: ${args.comunidad}`)

  for (const [indice, paso] of pasos.entries()) {
    const visible = `${binarioNpm()} ${paso.args.join(" ")}`
    console.log(`▸ paso ${indice + 1}/${pasos.length}: ${paso.etiqueta}`)
    console.log(`  ${visible}`)

    if (args.dryRun) {
      console.log("  (simulación: no se ejecuta)")
      continue
    }

    const resultado = spawnSync(binarioNpm(), paso.args, {
      cwd: APP_DIR,
      stdio: "inherit",
      shell: process.platform === "win32",
    })
    if (resultado.error) {
      console.error(`✗ ${paso.etiqueta}: ${redactar(resultado.error.message)}`)
      return SALIDA_ERROR
    }
    if (resultado.status !== 0) {
      console.error(`✗ ${paso.etiqueta} falló (código ${resultado.status}); se corta acá y no se corre el resto.`)
      return SALIDA_ERROR
    }
    console.log(`✓ ${paso.etiqueta}`)
  }

  const total = pasos.length
  if (args.dryRun) {
    console.log(`✓ Simulación: ${total} pasos planificados, no se escribió nada.`)
  } else {
    console.log(`✓ seed completo: ${total}/${total} pasos · comunidad ${args.comunidad}`)
  }
  return SALIDA_OK
}

async function cmdSnapshot({ args, nombre }) {
  const { proyecto, org } = idsNeon(args)
  const comando = ["branches", "create", "--project-id", proyecto, "--no-secrets", "--org-id", org, "--name", nombre, "-o", "json"]

  console.log(`Plan de snapshot (rama de Neon "${nombre}")`)
  console.log(`  Proyecto     : ${proyecto}`)
  console.log(`  Organización : ${org}`)
  console.log(`  Comando      : neonctl ${comando.join(" ")}`)

  if (args.dryRun) {
    console.log("✓ Simulación: no se creó ninguna rama.")
    return SALIDA_OK
  }

  const salida = neonctl(comando)
  const id = extraerIdRama(salida)
  if (!id) {
    console.error("✗ neonctl creó la rama pero no se pudo leer su id en la salida. Revisá `neonctl branches list`.")
    return SALIDA_ERROR
  }
  console.log(`✓ rama creada: ${nombre} · id ${id}`)
  console.log(`  Para volver a este punto: npm run jdd -- restore ${nombre} --confirmo=${GUARDA}`)
  return SALIDA_OK
}

async function cmdRestore({ args, url, rama }) {
  const destino = destinoPostgres(url)
  const { proyecto, org } = idsNeon(args)

  console.log(`Plan de restore (rama "${rama}" → ${destino.host} / ${destino.base})`)
  console.log(`  Guarda       : --confirmo=${GUARDA} ${args.confirmo ? "✓ presente" : "✗ ausente"}`)
  console.log(`  Modo         : ${args.dryRun ? "simulación (--dry-run): no se escribe nada" : "EJECUCIÓN real"}`)

  const origenUrl = cadenaDeRama(rama, { proyecto, org })
  const origen = await conectar(origenUrl, { soloLectura: true })
  const cliente = await conectar(url)

  try {
    const [tablasOrigen, columnasOrigen] = await Promise.all([listarTablas(origen), listarColumnas(origen)])
    const columnasDestino = await listarColumnas(cliente)
    const orden = await ordenDeBase(cliente)
    const tablasDestino = orden.filter((tabla) => !esTablaDelSistema(tabla))
    const origenSet = new Set(tablasOrigen.filter((tabla) => !esTablaDelSistema(tabla)))

    const aCopiar = tablasDestino.filter((tabla) => origenSet.has(tabla))
    const faltantes = tablasDestino.filter((tabla) => !origenSet.has(tabla))
    const soloOrigen = [...origenSet].filter((tabla) => !columnasDestino.has(tabla))

    /** Columnas copiables por tabla: intersección origen∩destino, en orden del destino. */
    const columnasComunes = new Map()
    for (const tabla of aCopiar) {
      const deOrigen = columnasOrigen.get(tabla) ?? []
      const enDestino = new Set(columnasDestino.get(tabla) ?? [])
      columnasComunes.set(tabla, deOrigen.filter((columna) => enDestino.has(columna)))
    }

    const sinColumnas = aCopiar.filter((tabla) => (columnasComunes.get(tabla) ?? []).length === 0)
    const columnasIgnoradas = aCopiar.filter((tabla) => {
      const enDestino = new Set(columnasDestino.get(tabla) ?? [])
      return (columnasOrigen.get(tabla) ?? []).some((columna) => !enDestino.has(columna))
    })

    console.log(`  Origen       : ${tablasOrigen.length} tablas en public`)
    console.log(`  Destino      : ${tablasDestino.length} tablas en public (se truncan antes de insertar)`)
    console.log(`  Orden        : ${aCopiar.length} tablas, padres antes que hijos`)
    console.log(`    ${aCopiar.length > 0 ? aCopiar.join(" → ") : "(ninguna)"}`)
    if (faltantes.length > 0) {
      console.log(`  ⚠ No existen en el origen (${faltantes.length}): ${faltantes.join(", ")}. Se siguen igual.`)
    }
    if (soloOrigen.length > 0) {
      console.log(`  ⚠ No existen en el destino (${soloOrigen.length}): ${soloOrigen.join(", ")}. Se omiten.`)
    }
    if (sinColumnas.length > 0) {
      console.log(`  ⚠ Sin columnas en común (${sinColumnas.length}): ${sinColumnas.join(", ")}. Se omiten.`)
    }
    if (columnasIgnoradas.length > 0) {
      console.log(
        `  ⚠ Columnas del origen que no existen en el destino (${columnasIgnoradas.length} tablas): ` +
          `${columnasIgnoradas.join(", ")}. Se copian sólo las comunes.`,
      )
    }

    if (args.dryRun) {
      console.log("✓ Simulación: no se truncó ni se insertó nada.")
      return SALIDA_OK
    }
    if (!args.confirmo) {
      console.error(`✗ Falta --confirmo=${GUARDA}: no se truncó ni se insertó nada.`)
      return SALIDA_SIN_GUARDA
    }

    const vaciadas = await truncar(cliente, tablasDestino)
    console.log(`✓ destino truncado: ${vaciadas} tablas (RESTART IDENTITY CASCADE)`)

    const leidas = {}
    const escritas = {}
    let detenidoEn = null
    for (const tabla of aCopiar) {
      const columnas = columnasComunes.get(tabla) ?? []
      if (columnas.length === 0) continue
      try {
        const resultado = await restaurarTabla({ origen, destino: cliente, tabla, columnas })
        leidas[tabla] = resultado.leidas
        escritas[tabla] = resultado.escritas
        console.log(`  ✓ ${tabla}: ${resultado.leidas} leídas · ${resultado.escritas} escritas`)
      } catch (error) {
        detenidoEn = tabla
        console.error(`  ✗ ${redactar(error.message)}`)
        console.error("  El restore se detiene acá: seguir con los hijos dejaría huérfanos.")
        break
      }
    }

    const secuencias = detenidoEn ? 0 : await resincronizarSecuencias(cliente, aCopiar)
    if (secuencias > 0) console.log(`✓ secuencias resincronizadas: ${secuencias}`)

    const resumen = armarResumen({
      tablasDestino,
      tablasOrigen: [...origenSet],
      leidas,
      escritas,
    })
    const ancho = Math.max(5, ...resumen.filas.map((fila) => fila.tabla.length))
    console.log("Resumen por tabla:")
    for (const fila of resumen.filas) {
      const icono = fila.estado === "ok" ? "✓" : fila.estado === "faltante" ? "·" : "✗"
      const nota =
        fila.estado === "faltante"
          ? "  (no existe en el origen)"
          : fila.estado === "sin-destino"
            ? "  (no existe en el destino)"
            : fila.estado === "descuadre"
              ? "  (descuadre)"
              : ""
      console.log(
        `  ${icono} ${fila.tabla.padEnd(ancho)} leídas ${String(fila.leidas).padStart(7)} · escritas ${String(
          fila.escritas,
        ).padStart(7)}${nota}`,
      )
    }
    if (resumen.faltantes.length > 0) {
      console.log(`⚠ ${resumen.faltantes.length} tablas del destino no existen en el origen: ${resumen.faltantes.join(", ")}`)
    }
    console.log(
      `Totales: ${resumen.totales.leidas} leídas · ${resumen.totales.escritas} escritas · ` +
        `${aCopiar.length} tablas copiadas${detenidoEn ? ` · DETENIDO en "${detenidoEn}"` : ""}`,
    )

    if (detenidoEn) return SALIDA_ERROR
    if (!resumen.todoCuadra) {
      console.error(`✗ Descuadre en: ${resumen.descuadres.join(", ")}`)
      return SALIDA_ERROR
    }
    console.log("✓ restore completo: todo cuadró tabla por tabla.")
    return SALIDA_OK
  } finally {
    await origen.end().catch(() => {})
    await cliente.end().catch(() => {})
  }
}

/* ============================================================================
 * Entrada
 * ========================================================================== */

const COMANDOS_CON_BASE = new Set(["estado", "wipe", "seed", "restore"])
const COMANDOS = new Set([...COMANDOS_CON_BASE, "snapshot"])

async function main() {
  const args = parsearArgs(process.argv.slice(2))

  if (args.ayuda) {
    imprimirAyuda()
    return SALIDA_OK
  }
  if (!args.comando) {
    imprimirAyuda()
    console.error("✗ Falta el comando.")
    return SALIDA_ERROR
  }
  if (!COMANDOS.has(args.comando)) {
    console.error(`✗ Comando desconocido: ${args.comando}`)
    imprimirAyuda()
    return SALIDA_ERROR
  }
  if (args.desconocidos.length > 0) {
    console.error(
      `✗ Flag desconocido: ${args.desconocidos.join(", ")}. La única guarda de borrado es --confirmo=${GUARDA}.`,
    )
    return SALIDA_ERROR
  }

  let url = null
  if (COMANDOS_CON_BASE.has(args.comando)) {
    url = resolverDatabaseUrl()
    registrarDatosSensibles(url ?? "")
    const chequeo = evaluarUrl(url)
    if (!chequeo.ok) {
      console.error(`✗ ${chequeo.motivo}`)
      return SALIDA_ERROR
    }
  }

  switch (args.comando) {
    case "estado":
      return cmdEstado({ args, url })
    case "wipe":
      return cmdWipe({ args, url })
    case "seed":
      return cmdSeed({ args, url })
    case "snapshot": {
      const nombre = args.posicional[0]
      if (!nombre) {
        console.error("✗ Falta el nombre de la rama: npm run jdd -- snapshot <nombre>")
        return SALIDA_ERROR
      }
      if (!/^[a-z0-9][a-z0-9._-]{2,62}$/i.test(nombre)) {
        console.error(`✗ Nombre de rama inválido: "${nombre}". Usá letras, números, punto, guion o guion bajo.`)
        return SALIDA_ERROR
      }
      return cmdSnapshot({ args, nombre })
    }
    case "restore": {
      const rama = args.posicional[0]
      if (!rama) {
        console.error("✗ Falta la rama de Neon: npm run jdd -- restore <rama-neon>")
        return SALIDA_ERROR
      }
      if (!/^[a-z0-9][a-z0-9._@:-]{1,62}$/i.test(rama)) {
        console.error(`✗ Nombre de rama inválido: "${rama}".`)
        return SALIDA_ERROR
      }
      return cmdRestore({ args, url, rama })
    }
    default:
      return SALIDA_ERROR
  }
}

const esProgramaPrincipal = (() => {
  const entrada = process.argv[1]
  if (!entrada) return false
  try {
    return import.meta.url === pathToFileURL(entrada).href
  } catch {
    return false
  }
})()

if (esProgramaPrincipal) {
  main()
    .then((codigo) => {
      process.exitCode = codigo
    })
    .catch((error) => {
      console.error(`✗ jdd FALLO: ${redactar(error?.message ?? error)}`)
      process.exitCode = SALIDA_ERROR
    })
}
