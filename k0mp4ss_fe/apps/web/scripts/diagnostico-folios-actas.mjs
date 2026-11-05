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
 *   2. si la columna `folio` existe (la base real puede estar atrás del schema);
 *   3. cada grupo `(comunidadId, folio)` repetido, con su cantidad y hasta 3 ids
 *      de muestra — estos son los que hacen fallar el `db push`;
 *   4. filas con `folio` NULL (en PostgreSQL cada NULL es distinto en un índice
 *      único: NO colisionan, pero quedan sin foliar) y filas con `folio` vacío o
 *      sólo espacios (en PostgreSQL la cadena vacía SÍ es un valor y colisiona).
 *
 * Regla que manda en todo el reporte: una consulta que no se pudo leer se
 * informa como «NO VERIFICADO», jamás como 0. Un "0 grupos / 0 filas" falso es
 * peor que no tener respuesta, porque alguien lo lee y concluye que el flag es
 * seguro. La primera corrida real (Neon, 2026-11) mostró justo eso: la tabla
 * existía SIN la columna `folio` y el script imprimía un limpio "0 grupos / 0
 * filas" sobre una consulta que había fallado con 42703.
 *
 * Por eso la falta de columna se detecta a propósito (consulta propia, antes de
 * las demás) y se informa como el hallazgo de esquema que es: la base está atrás
 * del schema. Cuenta aparte de "sin duplicados": no es lo mismo "no hay folios
 * repetidos" que "no se pudo mirar".
 *
 * Trampa que costó una corrida: en SQLite un `"folio"` que no resuelve a columna
 * se interpreta como el TEXTO 'folio' (double-quoted string fallback), así que
 * `SELECT count("folio")` sobre una tabla sin la columna devuelve 0 sin quejarse
 * — el mismo falso limpio, otra vez. La sonda usa referencias CALIFICADAS
 * (`"actas_gd"."folio"`), que un literal no puede reemplazar: falla en SQLite y
 * en PostgreSQL cuando la columna no existe, y es válida en los dos cuando sí.
 *
 * Se banca una base sin la tabla (base nueva o esquema atrás): informa
 * `NO VERIFICADO` y sale 0, porque un diagnóstico que revienta cuando falta la
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
/** Tope de un motivo de fallo, para que el resumen no se coma el log. */
const MAX_LARGO_MOTIVO = 300

/* ---------- consultas (sin parámetros: SQL constante, nada interpolado) ---------- */

/**
 * Un `folio` "vacío" es cadena vacía o sólo espacios. `TRIM(NULL)` es NULL, así
 * que los NULL quedan afuera por construcción y se reportan por su lado.
 */
const FOLIO_VACIO = `TRIM("${COLUMNA_FOLIO}") = ''`

/** Sólo los folios que ocupan un valor del índice único (NULL y vacíos aparte). */
const FOLIO_CON_VALOR = `"${COLUMNA_FOLIO}" IS NOT NULL AND TRIM("${COLUMNA_FOLIO}") <> ''`

const SQL_TOTAL = `SELECT count(*) AS total FROM "${TABLA}"`

/**
 * ¿Existen las columnas que el resto del reporte usa? Se pregunta primero y a
 * propósito: si falta alguna, esto falla con 42703 / "no such column" en vez de
 * dejar que el error salga por sorpresa en medio del reporte. `count` sobre una
 * tabla vacía devuelve 0, así que el caso "0 filas" no se confunde con "ausente".
 *
 * Las referencias van CALIFICADAS por el motivo del encabezado: en SQLite
 * `count("folio")` sin tabla se cae al literal 'folio' y contesta 0 sobre una
 * tabla que no tiene la columna. `count("actas_gd"."folio")` no tiene esa salida.
 */
const SQL_COLUMNAS = `SELECT count("${TABLA}"."${COLUMNA_COMUNIDAD}") AS comunidad,
       count("${TABLA}"."${COLUMNA_FOLIO}") AS folio
  FROM "${TABLA}"`

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

/**
 * Un mensaje de error de Prisma viene con saltos de línea y el SQL entero. El
 * resumen tiene que decir qué falló y por qué en UNA línea, así que se aplana y
 * se acota; cuando se acota queda el `…` a la vista, no un corte silencioso.
 */
function unaLinea(texto) {
  const plano = String(texto ?? "").replace(/\s+/g, " ").trim()
  if (plano.length <= MAX_LARGO_MOTIVO) return plano
  return `${plano.slice(0, MAX_LARGO_MOTIVO - 1)}…`
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

/**
 * ¿El error dice que falta una columna? (P2022 y raw 42703 / no such column). Es
 * el caso de la base real: `actas_gd` existe pero sin `folio`, o sea atrás del
 * schema. Distinguirlo importa: no es un fallo de conexión ni una tabla ausente.
 */
function esColumnaAusente(error) {
  const codigo = String(error?.code ?? "")
  const mensaje = String(error?.message ?? "")
  return codigo === "P2022" || /column .*does not exist|no such column|42703/i.test(mensaje)
}

/**
 * Qué columna nombra el error, para no decir "falta folio" cuando la que falta
 * era otra. PostgreSQL: `column "x" does not exist`. SQLite: `no such column: t.x`.
 */
function columnaDelError(error) {
  const mensaje = String(error?.message ?? "")
  // PostgreSQL: `column "x" does not exist` y también `column t.x does not exist`
  // según cómo se citó; se sacan comillas y calificador para quedarse con el nombre.
  const postgres =
    /column "([^"]+)" does not exist/i.exec(mensaje) ??
    /column\s+(\S+)\s+does not exist/i.exec(mensaje)
  if (postgres) return postgres[1].replace(/"/g, "").split(".").pop()
  const sqlite = /no such column: (?:[\w"]+\.)?"?([\w]+)"?/i.exec(mensaje)
  return sqlite ? sqlite[1] : null
}

/**
 * Traduce un error a la frase que va al reporte: qué se sabe del esquema o, si no
 * es un problema de esquema, el mensaje ya redactado y en una línea.
 */
function motivoDeFallo(error) {
  if (esTablaAusente(error)) return `la tabla ${TABLA} no existe en esta base`
  if (esColumnaAusente(error)) {
    const columna = columnaDelError(error) ?? COLUMNA_FOLIO
    return `la base no tiene la columna "${columna}": está atrás del schema`
  }
  const codigo = error?.code ? `${error.code}: ` : ""
  return unaLinea(`${codigo}${redactar(error?.message, URL_BASE)}`)
}

/** Protocolo de la URL, sin el resto del valor: sirve para saber qué se consultó. */
function protocoloDe(urlBase) {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(urlBase ?? "")
  return match ? match[1].toLowerCase() : "desconocido"
}

function lineaGuiones() {
  return "-".repeat(72)
}

/**
 * Una consulta que no puede fallar en silencio: devuelve el resultado o el error,
 * y quien llama decide qué hacer. Nunca lanza, para que un chequeo caído no se
 * lleve puesto el resto del reporte.
 */
async function consultar(prisma, sql) {
  try {
    const filas = await prisma.$queryRawUnsafe(sql)
    return { ok: true, filas: Array.isArray(filas) ? filas : [] }
  } catch (error) {
    return { ok: false, error }
  }
}

/**
 * La última línea del reporte. Tres estados, nunca dos: verificado con números,
 * verificado con 0, o NO VERIFICADO con el chequeo y el motivo que lo tumbó.
 */
function lineaDeResumen({ resumen, fallos, hallazgos }) {
  const motivosDeEsquema = hallazgos.filter((h) => h.esquema).map((h) => h.motivo)
  if (motivosDeEsquema.length > 0) {
    return `folios duplicados: NO VERIFICADO — ${motivosDeEsquema.join("; ")} (no se puede saber si hay folios repetidos)`
  }
  if (fallos.length > 0) {
    const detalle = fallos.map((fallo) => `${fallo.chequeo} (${fallo.motivo})`).join("; ")
    return `folios duplicados: NO VERIFICADO — falló: ${detalle}`
  }
  if (resumen.filasTotales === 0) {
    return `folios duplicados: 0 grupos / 0 filas — verificado: ${TABLA} tiene 0 filas, nada que duplicar`
  }
  return `folios duplicados: ${resumen.grupos} grupos / ${resumen.filasDuplicadas} filas — verificado`
}

/* ---------- reporte ---------- */

/**
 * Lee los números de la base y los imprime. Devuelve lo que pudo y lo que no:
 * `{ resumen, fallos, hallazgos }`, que es lo que arma la línea final. Un fallo
 * temprano (tabla o columna ausente) corta las consultas que dependen de ella,
 * porque reintentarlas sólo agregaría ruido al mismo motivo.
 */
async function diagnosticar(prisma) {
  const fallos = []
  const hallazgos = []
  const resumen = { filasTotales: null, grupos: null, filasDuplicadas: null }

  const pedir = async (chequeo, sql) => {
    const lectura = await consultar(prisma, sql)
    if (!lectura.ok) fallos.push({ chequeo, motivo: motivoDeFallo(lectura.error) })
    return lectura
  }
  const ultimoMotivo = () => fallos[fallos.length - 1]?.motivo ?? "motivo desconocido"

  // 1) Filas totales. Si esto no se puede leer no hay ningún número que dar: se
  //    informa el motivo y se corta (las demás consultas corren en la misma base).
  const total = await pedir("filas totales", SQL_TOTAL)
  if (!total.ok) {
    const motivo = ultimoMotivo()
    console.log(`filas en ${TABLA}: NO VERIFICADO — ${motivo}`)
    if (esTablaAusente(total.error)) hallazgos.push({ esquema: true, motivo })
    console.log("")
    console.log("consultas sin hacer: grupos repetidos, muestras de ids, folios sin valor")
    return { resumen, fallos, hallazgos }
  }
  resumen.filasTotales = numero(total.filas[0]?.total)
  console.log(`filas en ${TABLA}: ${resumen.filasTotales}`)
  if (resumen.filasTotales === 0) console.log(`  0 filas, nada que duplicar.`)

  // 2) ¿Existen las columnas? Se pregunta antes de usarlas para no confundir "la
  //    base no tiene la columna" con "no hay folios repetidos".
  const columnas = await pedir(`columnas (${COLUMNA_COMUNIDAD}, ${COLUMNA_FOLIO})`, SQL_COLUMNAS)
  if (!columnas.ok) {
    const motivo = ultimoMotivo()
    console.log(`columnas en ${TABLA}: NO VERIFICADO — ${motivo}`)
    if (esColumnaAusente(columnas.error)) {
      hallazgos.push({ esquema: true, motivo })
      console.log(`  hallazgo de esquema: no es "sin duplicados", es "no se pudo mirar"`)
    }
    console.log("")
    console.log("consultas sin hacer: grupos repetidos, muestras de ids, folios sin valor")
    return { resumen, fallos, hallazgos }
  }
  console.log(`columnas en ${TABLA}: "${COLUMNA_COMUNIDAD}" y "${COLUMNA_FOLIO}" existen`)

  // 3) Grupos repetidos: los que hacen fallar el `db push`.
  console.log("")
  console.log("grupos (comunidadId, folio) repetidos — son los que bloquean el db push:")
  const grupos = await pedir("grupos repetidos", SQL_GRUPOS_REPETIDOS)
  if (!grupos.ok) {
    console.log(`  NO VERIFICADO — ${ultimoMotivo()}`)
  } else {
    resumen.grupos = grupos.filas.length
    resumen.filasDuplicadas = grupos.filas.reduce((suma, grupo) => suma + numero(grupo.filas), 0)
    if (grupos.filas.length === 0) {
      console.log("  ninguno: ningún folio con valor se repite dentro de su comunidad")
    } else {
      const muestras = await pedir("muestras de ids", SQL_MUESTRAS)
      const idsPorGrupo = new Map()
      for (const fila of muestras.ok ? muestras.filas : []) {
        const clave = `${fila.comunidad}\u0000${fila.folio}`
        const ids = idsPorGrupo.get(clave) ?? []
        if (ids.length < MUESTRAS_POR_GRUPO) ids.push(String(fila.id))
        idsPorGrupo.set(clave, ids)
      }

      for (const grupo of grupos.filas.slice(0, MAX_GRUPOS_IMPRESOS)) {
        const ids = idsPorGrupo.get(`${grupo.comunidad}\u0000${grupo.folio}`) ?? []
        const muestrasTexto = ids.length > 0 ? ids.join(", ") : "(sin muestra)"
        console.log(
          `  comunidad=${grupo.comunidad} folio=${grupo.folio} → ${numero(grupo.filas)} filas · ids: ${muestrasTexto}`
        )
      }
      if (grupos.filas.length > MAX_GRUPOS_IMPRESOS) {
        console.log(
          `  … y ${grupos.filas.length - MAX_GRUPOS_IMPRESOS} grupo(s) más (no se detallan para no inundar el log)`
        )
      }
      if (!muestras.ok) {
        console.log(`  muestras de ids: NO VERIFICADO — ${ultimoMotivo()}`)
      } else if (muestras.filas.length >= MAX_FILAS_MUESTRA) {
        console.log(
          `  (muestras truncadas a ${MAX_FILAS_MUESTRA} filas: los conteos de arriba sí son completos)`
        )
      }
    }
  }

  // 4) Folios sin valor: el índice único no los trata como un repetido.
  console.log("")
  console.log("folios sin valor — el índice único los trata distinto que a un folio repetido:")
  const sinFolio = await pedir(`filas con ${COLUMNA_FOLIO} NULL`, SQL_SIN_FOLIO)
  if (!sinFolio.ok) {
    console.log(`  NULL: NO VERIFICADO — ${ultimoMotivo()}`)
  } else {
    console.log(
      `  NULL: ${numero(sinFolio.filas[0]?.total)} fila(s) — en PostgreSQL cada NULL es distinto en el índice único: no chocan, quedan sin foliar`
    )
  }
  const vacios = await pedir(`filas con ${COLUMNA_FOLIO} vacío`, SQL_FOLIO_VACIO)
  if (!vacios.ok) {
    console.log(`  vacío o sólo espacios: NO VERIFICADO — ${ultimoMotivo()}`)
  } else {
    console.log(
      `  vacío o sólo espacios: ${numero(vacios.filas[0]?.total)} fila(s) — la cadena vacía SÍ es un valor en el índice único`
    )
  }
  const vaciosRepetidos = await pedir("vacíos repetidos por comunidad", SQL_VACIOS_REPETIDOS)
  if (!vaciosRepetidos.ok) {
    console.log(`  comunidades con 2+ vacíos: NO VERIFICADO — ${ultimoMotivo()}`)
  } else if (vaciosRepetidos.filas.length > 0) {
    const detalle = vaciosRepetidos.filas
      .map((fila) => `comunidad=${fila.comunidad} (${numero(fila.filas)})`)
      .join(", ")
    console.log(
      `  ATENCIÓN: ${vaciosRepetidos.filas.length} comunidad(es) con 2+ folios vacíos, estos también violan el índice único: ${detalle}`
    )
  }

  return { resumen, fallos, hallazgos }
}

async function main() {
  console.log(lineaGuiones())
  console.log(`diagnóstico de folios de actas — tabla ${TABLA}`)
  console.log(lineaGuiones())

  if (!URL_BASE) {
    console.log("sin DATABASE_URL en el entorno: no hay base que consultar.")
    console.log("")
    console.log("folios duplicados: NO VERIFICADO — sin DATABASE_URL en el entorno: no hay base que consultar")
    return
  }

  console.log(`base: ${protocoloDe(URL_BASE)} (URL tomada de DATABASE_URL, no se imprime)`)
  console.log("")

  // El cliente se construye ADENTRO del try: si `@prisma/client` no está
  // generado, el error ("did not initialize yet…") tiene que salir por el mismo
  // camino legible que un fallo de conexión, no como una excepción opaca.
  let prisma = null
  try {
    let resultado
    try {
      prisma = new PrismaClient({ datasourceUrl: URL_BASE })
      resultado = await diagnosticar(prisma)
    } catch (error) {
      // Es un diagnóstico: un fallo de conexión no debe pintar el job de rojo,
      // pero tiene que dejar de ser opaco. Se informa sin filtraciones.
      const motivo = motivoDeFallo(error)
      console.log(`no se pudo consultar la base — ${motivo}`)
      resultado = { resumen: {}, fallos: [{ chequeo: "conexión a la base", motivo }], hallazgos: [] }
    }

    console.log("")
    console.log(lineaGuiones())
    console.log(lineaDeResumen(resultado))
  } finally {
    await prisma?.$disconnect().catch(() => {})
  }
}

// Diagnóstico, no gate: pase lo que pase el job sigue y el `db push` decide.
main().catch((error) => {
  console.log(`diagnóstico de folios de actas: falló inesperadamente — ${unaLinea(error?.name ?? "Error")}`)
  console.log("")
  console.log(`folios duplicados: NO VERIFICADO — falló el diagnóstico inesperadamente (${unaLinea(error?.name ?? "Error")})`)
})
