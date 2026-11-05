#!/usr/bin/env node
/**
 * scripts/diagnostico-folios-actas.mjs — ¿por qué `prisma db push` se niega a
 * agregar el índice único `(comunidadId, folio)` de `actas_gd`?
 *
 * Por qué existe: el job `Esquema de la base (Neon)` del CI corre
 * `prisma db push --skip-generate` contra la base real y falla con
 *
 *   ⚠️ There might be data loss when applying the changes:
 *   • A unique constraint covering the columns [comunidadId,folio] on the table
 *     `actas_gd` will be added.
 *
 * El aviso es correcto pero ciego: `db push` no dice CUÁNTAS filas chocan ni en
 * qué comunidades, así que decidir `--accept-data-loss` es una apuesta. Este
 * script contesta la pregunta con números, sin decidir nada: es un diagnóstico,
 * no un gate (SIEMPRE sale 0), y sólo lee (no escribe ni emite DDL).
 *
 * Qué reporta (una sección por cosa que el índice único trata distinto):
 *   1. filas totales de `actas_gd`;
 *   2. cada grupo `(comunidadId, folio)` repetido, con su cantidad y hasta 3 ids
 *      de muestra — estos son los que hacen fallar el `db push`;
 *   3. filas con `folio` NULL (en PostgreSQL cada NULL es distinto en un índice
 *      único: NO colisionan, pero quedan sin foliar) y filas con `folio` vacío o
 *      sólo espacios (en PostgreSQL la cadena vacía SÍ es un valor y colisiona).
 *
 * Se banca una base sin la tabla (base nueva o esquema atrás): informa
 * `tabla ausente` y sale 0, porque un diagnóstico que revienta cuando falta la
 * tabla no sirve justo cuando más se lo necesita.
 *
 * Nunca imprime `DATABASE_URL` (sólo su protocolo) ni credenciales de un mensaje
 * de error: esto se lee en consolas y en los logs de CI.
 *
 * Uso (desde k0mp4ss_fe/apps/web):
 *   DATABASE_URL=... node scripts/diagnostico-folios-actas.mjs
 *
 * Lo corre el CI en el job `esquema` (paso anterior a `prisma db push`), con el
 * mismo `DATABASE_URL` que el push. Los números quedan en el log del job.
 */

/**
 * La URL se lee ANTES de tocar `@prisma/client`: al importarse, el client carga
 * los `.env*` del proyecto y deja su `DATABASE_URL` en `process.env` (comprobado:
 * con la variable ausente del entorno, después del import ya está seteada). Un
 * diagnóstico que consulta una base distinta de la que le pidieron es peor que
 * no correr, así que acá sólo cuenta lo que vino del entorno.
 */
const URL_BASE = process.env.DATABASE_URL?.trim() ?? ""
const { PrismaClient } = await import("@prisma/client")

/** Tabla y columnas del modelo `ActaGD` (`prisma/schema.prisma`). */
const TABLA = "actas_gd"
const COLUMNA_COMUNIDAD = "comunidadId"
const COLUMNA_FOLIO = "folio"

/** Cuántos ids de muestra por grupo repetido se imprimen. */
const MUESTRAS_POR_GRUPO = 3
/** Tope de grupos impresos: si hay más, se informa el resto sin detallar. */
const MAX_GRUPOS_IMPRESOS = 50
/** Tope de filas que trae la consulta de muestras (evita un log gigante). */
const MAX_FILAS_MUESTRA = 600

/* ---------- consultas (sin parámetros: SQL constante, nada interpolado) ---------- */

/**
 * Un `folio` "vacío" es cadena vacía o sólo espacios. `TRIM(NULL)` es NULL, así
 * que los NULL quedan afuera por construcción y se reportan por su lado.
 */
const FOLIO_VACIO = `TRIM("${COLUMNA_FOLIO}") = ''`

/** Sólo los folios que ocupan un valor del índice único (NULL y vacíos aparte). */
const FOLIO_CON_VALOR = `"${COLUMNA_FOLIO}" IS NOT NULL AND TRIM("${COLUMNA_FOLIO}") <> ''`

const SQL_TOTAL = `SELECT count(*) AS total FROM "${TABLA}"`

/** Grupos que hoy violan el índice único que el `db push` quiere crear. */
const SQL_GRUPOS_REPETIDOS = `
  SELECT "${COLUMNA_COMUNIDAD}" AS comunidad,
         "${COLUMNA_FOLIO}" AS folio,
         count(*) AS filas
  FROM "${TABLA}"
  WHERE ${FOLIO_CON_VALOR}
  GROUP BY "${COLUMNA_COMUNIDAD}", "${COLUMNA_FOLIO}"
  HAVING count(*) > 1
  ORDER BY count(*) DESC, "${COLUMNA_COMUNIDAD}" ASC, "${COLUMNA_FOLIO}" ASC`

/**
 * Ids de los grupos repetidos en una sola consulta. El `IN` de fila vale en
 * PostgreSQL y en SQLite (3.15+), así que no hay placeholders por proveedor.
 */
const SQL_MUESTRAS = `
  SELECT "${COLUMNA_COMUNIDAD}" AS comunidad,
         "${COLUMNA_FOLIO}" AS folio,
         "id" AS id
  FROM "${TABLA}"
  WHERE ${FOLIO_CON_VALOR}
    AND ("${COLUMNA_COMUNIDAD}", "${COLUMNA_FOLIO}") IN (
      SELECT "${COLUMNA_COMUNIDAD}", "${COLUMNA_FOLIO}"
      FROM "${TABLA}"
      WHERE ${FOLIO_CON_VALOR}
      GROUP BY "${COLUMNA_COMUNIDAD}", "${COLUMNA_FOLIO}"
      HAVING count(*) > 1
    )
  ORDER BY "${COLUMNA_COMUNIDAD}" ASC, "${COLUMNA_FOLIO}" ASC, "id" ASC
  LIMIT ${MAX_FILAS_MUESTRA}`

const SQL_SIN_FOLIO = `SELECT count(*) AS total FROM "${TABLA}" WHERE "${COLUMNA_FOLIO}" IS NULL`

const SQL_FOLIO_VACIO = `SELECT count(*) AS total FROM "${TABLA}" WHERE ${FOLIO_VACIO}`

/** Comunidades donde la cadena vacía ya alcanza el índice único (2+ filas). */
const SQL_VACIOS_REPETIDOS = `
  SELECT "${COLUMNA_COMUNIDAD}" AS comunidad, count(*) AS filas
  FROM "${TABLA}"
  WHERE ${FOLIO_VACIO}
  GROUP BY "${COLUMNA_COMUNIDAD}"
  HAVING count(*) > 1
  ORDER BY count(*) DESC, "${COLUMNA_COMUNIDAD}" ASC`

/* ---------- utilidades ---------- */

/** `count(*)` llega como BigInt en PostgreSQL y como number en SQLite. */
function numero(valor) {
  if (typeof valor === "bigint") return Number(valor)
  return typeof valor === "number" ? valor : Number(valor ?? 0)
}

/**
 * Quita de un texto cualquier rastro de la URL de la base: el valor completo y
 * las credenciales de una URL (`postgresql://usuario:clave@host`). Un mensaje de
 * error de Prisma puede nombrar el host; el log de CI no tiene por qué verlo.
 */
function redactar(texto, urlBase) {
  let salida = String(texto ?? "")
  if (urlBase) salida = salida.split(urlBase).join("<DATABASE_URL>")
  return salida.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1***@")
}

/** ¿El error dice que la tabla todavía no existe? (P2021 y raw 42P01 / no such table) */
function esTablaAusente(error) {
  const codigo = String(error?.code ?? "")
  const mensaje = String(error?.message ?? "")
  return (
    codigo === "P2021" ||
    /does not exist in the current database|no such table|42P01|relation .* does not exist/i.test(
      mensaje
    )
  )
}

/** Protocolo de la URL, sin el resto del valor: sirve para saber qué se consultó. */
function protocoloDe(urlBase) {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(urlBase ?? "")
  return match ? match[1].toLowerCase() : "desconocido"
}

function lineaGuiones() {
  return "-".repeat(72)
}

/* ---------- reporte ---------- */

/**
 * Lee los números de la base y los imprime. Devuelve `null` si la tabla no
 * existe (el llamador informa el caso) o los contadores del resumen.
 */
async function diagnosticar(prisma) {
  const total = numero((await prisma.$queryRawUnsafe(SQL_TOTAL))?.[0]?.total)
  console.log(`filas en ${TABLA}: ${total}`)

  console.log("")
  console.log("grupos (comunidadId, folio) repetidos — son los que bloquean el db push:")
  const grupos = await prisma.$queryRawUnsafe(SQL_GRUPOS_REPETIDOS)
  const filasDuplicadas = grupos.reduce((suma, grupo) => suma + numero(grupo.filas), 0)

  if (grupos.length === 0) {
    console.log("  ninguno: ningún folio con valor se repite dentro de su comunidad")
  } else {
    const muestras = await prisma.$queryRawUnsafe(SQL_MUESTRAS)
    const idsPorGrupo = new Map()
    for (const fila of muestras) {
      const clave = `${fila.comunidad}\u0000${fila.folio}`
      const ids = idsPorGrupo.get(clave) ?? []
      if (ids.length < MUESTRAS_POR_GRUPO) ids.push(String(fila.id))
      idsPorGrupo.set(clave, ids)
    }

    for (const grupo of grupos.slice(0, MAX_GRUPOS_IMPRESOS)) {
      const ids = idsPorGrupo.get(`${grupo.comunidad}\u0000${grupo.folio}`) ?? []
      const muestrasTexto = ids.length > 0 ? ids.join(", ") : "(sin muestra)"
      console.log(
        `  comunidad=${grupo.comunidad} folio=${grupo.folio} → ${numero(grupo.filas)} filas · ids: ${muestrasTexto}`
      )
    }
    if (grupos.length > MAX_GRUPOS_IMPRESOS) {
      console.log(
        `  … y ${grupos.length - MAX_GRUPOS_IMPRESOS} grupo(s) más (no se detallan para no inundar el log)`
      )
    }
    if (muestras.length >= MAX_FILAS_MUESTRA) {
      console.log(
        `  (muestras truncadas a ${MAX_FILAS_MUESTRA} filas: los conteos de arriba sí son completos)`
      )
    }
  }

  console.log("")
  console.log("folios sin valor — el índice único los trata distinto que a un folio repetido:")
  const sinFolio = numero((await prisma.$queryRawUnsafe(SQL_SIN_FOLIO))?.[0]?.total)
  const vacios = numero((await prisma.$queryRawUnsafe(SQL_FOLIO_VACIO))?.[0]?.total)
  console.log(
    `  NULL: ${sinFolio} fila(s) — en PostgreSQL cada NULL es distinto en el índice único: no chocan, quedan sin foliar`
  )
  console.log(
    `  vacío o sólo espacios: ${vacios} fila(s) — la cadena vacía SÍ es un valor en el índice único`
  )
  const vaciosRepetidos = await prisma.$queryRawUnsafe(SQL_VACIOS_REPETIDOS)
  if (vaciosRepetidos.length > 0) {
    const detalle = vaciosRepetidos
      .map((fila) => `comunidad=${fila.comunidad} (${numero(fila.filas)})`)
      .join(", ")
    console.log(
      `  ATENCIÓN: ${vaciosRepetidos.length} comunidad(es) con 2+ folios vacíos, estos también violan el índice único: ${detalle}`
    )
  }

  return { grupos: grupos.length, filas: filasDuplicadas }
}

async function main() {
  console.log(lineaGuiones())
  console.log(`diagnóstico de folios de actas — tabla ${TABLA}`)
  console.log(lineaGuiones())

  if (!URL_BASE) {
    console.log("sin DATABASE_URL en el entorno: no hay base que consultar.")
    console.log("")
    console.log("folios duplicados: 0 grupos / 0 filas")
    return
  }

  console.log(`base: ${protocoloDe(URL_BASE)} (URL tomada de DATABASE_URL, no se imprime)`)
  console.log("")

  // El cliente se construye ADENTRO del try: si `@prisma/client` no está
  // generado, el error ("did not initialize yet…") tiene que salir por el mismo
  // camino legible que un fallo de conexión, no como una excepción opaca.
  let prisma = null
  try {
    let resumen
    try {
      prisma = new PrismaClient({ datasourceUrl: URL_BASE })
      resumen = await diagnosticar(prisma)
    } catch (error) {
      if (esTablaAusente(error)) {
        console.log(`tabla ausente: ${TABLA} no existe en esta base (nada que duplicar).`)
        console.log("")
        console.log("folios duplicados: 0 grupos / 0 filas")
        return
      }
      // Es un diagnóstico: un fallo de conexión no debe pintar el job de rojo,
      // pero tiene que dejar de ser opaco. Se informa sin filtraciones.
      const codigo = error?.code ? `${error.code}: ` : ""
      console.log(`no se pudo consultar la base — ${codigo}${redactar(error?.message, URL_BASE)}`)
      console.log("")
      console.log("folios duplicados: 0 grupos / 0 filas")
      return
    }

    console.log("")
    console.log(`folios duplicados: ${resumen.grupos} grupos / ${resumen.filas} filas`)
  } finally {
    await prisma?.$disconnect().catch(() => {})
  }
}

// Diagnóstico, no gate: pase lo que pase el job sigue y el `db push` decide.
main().catch((error) => {
  console.log(`diagnóstico de folios de actas: falló inesperadamente — ${error?.name ?? "Error"}`)
  console.log("")
  console.log("folios duplicados: 0 grupos / 0 filas")
})
