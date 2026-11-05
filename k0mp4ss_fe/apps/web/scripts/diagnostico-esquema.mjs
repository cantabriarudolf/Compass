#!/usr/bin/env node
/**
 * scripts/diagnostico-esquema.mjs — ¿cuánto está atrás la base real del schema?
 *
 * Por qué existe: el job `Esquema de la base (Neon)` del CI corre
 * `prisma db push --skip-generate` contra la base real y falla con avisos que
 * nombran UNA parte del cambio:
 *
 *   ⚠️ There might be data loss when applying the changes:
 *   • A unique constraint covering the columns [comunidadId,folio] on the table
 *     `actas_gd` will be added.
 *
 * Ese aviso no dice cuánto falta ni qué más falta. La primera corrida real
 * (Neon, 2026-11) mostró que `actas_gd` no tenía la columna `folio`: la base
 * estaba atrás del schema, y `db push` sólo mencionaba el índice único.
 * Decidir `--accept-data-loss` —o cualquier otra medida— con un solo renglón a
 * la vista es una apuesta. Este script contesta la pregunta con la lista
 * COMPLETA: el SQL que `db push` intentaría aplicar, resumido para leerlo y
 * completo al final para auditarlo.
 *
 * Qué corre (y por qué ese comando):
 *   prisma migrate diff --from-url <DATABASE_URL>
 *                      --to-schema-datamodel prisma/schema.prisma --script
 *
 * `migrate diff` es la herramienta de Prisma para "qué le falta a esta base para
 * llegar a este schema", en SQL ejecutable; es de sólo lectura (no escribe en la
 * base, no emite migraciones) y no necesita shadow database: el shadow db sólo
 * se pide con `--from-migrations` / `--to-migrations`, que acá no se usan. Si el
 * comando igual falla (engine, permiso, red), el error se informa y el script
 * sigue: un diagnóstico que revienta justo cuando la base está rara no sirve.
 *
 * Qué reporta, en este orden:
 *   1. encabezado con el protocolo de la URL del entorno (nunca la URL);
 *   2. resumen legible, contado del SQL generado: cuántas `CREATE TABLE` (con
 *      nombres), cuántos `ALTER TABLE … ADD COLUMN` (tabla + columna), cuántos
 *      `DROP TABLE` / `DROP COLUMN` (los peligrosos, destacados) y cuántas
 *      sentencias de otra clase (agrupadas por tipo);
 *   3. el SQL completo al final, para que el detalle quede en el log;
 *   4. si el SQL vino vacío: «la base está al día con el schema». Eso también
 *      es una respuesta —y la mejor noticia posible para el `db push`.
 *
 * Regla que manda en el reporte (misma que `diagnostico-folios-actas.mjs`): lo
 * que no se pudo leer se informa como «NO VERIFICADO», jamás como 0. Un "0
 * sentencias / base al día" falso es peor que no tener respuesta, porque alguien
 * lo lee, concluye que el `db push` es seguro y lo aprueba.
 *
 * Veredicto para el CI (`GITHUB_OUTPUT`): además del informe humano escribe una
 * salida de máquina, `destructivo=false` o `destructivo=true`, para que el job
 * decida con un `if:` en vez de leer el log. `true` significa «no se puede
 * aplicar solo»: el diff trae algún `DROP TABLE` / `DROP COLUMN`, **o el diff no
 * se pudo calcular** (sin `DATABASE_URL`, CLI roto, timeout, error inesperado).
 * «No verificado» nunca vale como seguro — es exactamente el atajo que convirtió
 * un `--accept-data-loss` permanente en una apuesta.
 *
 * Es un diagnóstico, no un gate: SIEMPRE sale 0 y sólo lee. No aplica nada y no
 * reemplaza la decisión del owner; el job usa el veredicto para aplicar el push
 * cuando —y sólo cuando— la deriva es provablemente aditiva, y para frenar con
 * un mensaje cuando hay algo que una persona tiene que decidir.
 *
 * Nunca imprime `DATABASE_URL` (sólo su protocolo) ni credenciales de un error:
 * esto se lee en consolas y en los logs de CI. Mismo criterio de redacción que
 * `scripts/diagnostico-folios-actas.mjs` (`redactar`), copiado acá porque ese
 * script corre `main()` al importarse y no se puede reutilizar como módulo.
 *
 * Uso (desde k0mp4ss_fe/apps/web):
 *   DATABASE_URL=... node scripts/diagnostico-esquema.mjs
 *
 * `ESQUEMA_DESTINO` (opcional) cambia el schema de destino y existe por una
 * razón concreta: `migrate diff` exige que origen y destino sean del MISMO
 * proveedor ("a diff using 2 different providers like PostgreSQL and SQLite is
 * not supported"), así que la verificación local contra un SQLite descartable
 * necesita `ESQUEMA_DESTINO=prisma/schema.sqlite.prisma`. En el CI no se setea:
 * ahí la base es PostgreSQL y el destino es `prisma/schema.prisma`. Si la URL y
 * el destino no coinciden en proveedor, el reporte lo avisa arriba del resumen
 * (con proveedores distintos el SQL generado no significa nada).
 *
 * Lo corre el CI en el job `esquema`, en el paso siguiente al diagnóstico de
 * folios y anterior a `prisma db push`, con el mismo `DATABASE_URL`, la misma
 * `working-directory` y el mismo `if:` que el push. El paso declara un `id`
 * (`deriva_esquema`) y el push lee `steps.deriva_esquema.outputs.destructivo`.
 */

/**
 * La URL se lee del entorno y se pasa EXPLÍCITA al CLI hijo. Sin eso, el CLI
 * carga los `.env*` del proyecto y consultaría la base de desarrollo mientras el
 * log diría que miró la de producción. Un diagnóstico que mira otra base es peor
 * que no correr.
 */
import { spawnSync } from "node:child_process"
import { appendFileSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"

const URL_BASE = process.env.DATABASE_URL?.trim() ?? ""
const ESQUEMA_DESTINO = process.env.ESQUEMA_DESTINO?.trim() || "prisma/schema.prisma"

/** Tope de espera del CLI: el job de CI tiene 10 min; esto es un diff, no un push. */
const MAX_ESPERA_MS = 300_000
/** Tope de un motivo de fallo, para que el resumen no se coma el log. */
const MAX_LARGO_MOTIVO = 300

/* ---------- utilidades (mismo criterio que diagnostico-folios-actas.mjs) ---------- */

/**
 * Quita de un texto cualquier rastro de la URL de la base: el valor completo y
 * las credenciales de una URL (`postgresql://usuario:clave@host`). Un mensaje de
 * error del CLI puede nombrar el host; el log de CI no tiene por qué verlo.
 */
function redactar(texto, urlBase) {
  let salida = String(texto ?? "")
  if (urlBase) salida = salida.split(urlBase).join("<DATABASE_URL>")
  return salida.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1***@")
}

/**
 * Un mensaje de error del CLI viene con saltos de línea y "Environment variables
 * loaded from .env". El resumen tiene que decir qué falló en UNA línea, así que
 * se aplana y se acota; cuando se acota queda el `…` a la vista, no un corte
 * silencioso.
 */
function unaLinea(texto) {
  const plano = String(texto ?? "").replace(/\s+/g, " ").trim()
  if (plano.length <= MAX_LARGO_MOTIVO) return plano
  return `${plano.slice(0, MAX_LARGO_MOTIVO - 1)}…`
}

/** Protocolo de la URL, sin el resto del valor: sirve para saber qué se miró. */
function protocoloDe(urlBase) {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(urlBase ?? "")
  return match ? match[1].toLowerCase() : "desconocido"
}

function lineaGuiones() {
  return "-".repeat(72)
}

/**
 * Contrato con el CI: GitHub le da a cada paso de `run` un archivo de salida en
 * `GITHUB_OUTPUT`, y lo que se escribe ahí (`clave=valor`) es lo que el `if:` de
 * los pasos siguientes puede leer. Sin ese archivo (uso local, a mano) no se
 * escribe nada: el informe humano de siempre ya está impreso.
 *
 * `destructivo=true` es el lado seguro de la moneda y por eso se usa también
 * cuando NO hay veredicto posible. Si la escritura falla, se avisa y no se
 * inventa un `false`: la salida queda vacía, el `if:` del push no se cumple y no
 * se aplica nada. Fallar abierto acá sería repetir el error que este script
 * existe para evitar.
 */
function escribirVeredicto(destructivo) {
  const archivo = process.env.GITHUB_OUTPUT?.trim()
  if (!archivo) return

  const valor = destructivo ? "true" : "false"
  try {
    appendFileSync(archivo, `destructivo=${valor}\n`)
    console.log(`veredicto para el CI (GITHUB_OUTPUT): destructivo=${valor}`)
  } catch (error) {
    console.log(
      `no se pudo escribir el veredicto en GITHUB_OUTPUT — ${unaLinea(redactar(error?.message, URL_BASE))}`
    )
    console.log(
      "el job leerá `destructivo` vacío: no se aplicará ningún cambio y el paso del gate humano lo dirá"
    )
  }
}

/* ---------- lectura del SQL ---------- */

/**
 * Parte el script SQL en sentencias sin romper nada:
 *   - ignora comentarios `--` (Prisma los usa como título, `-- AlterTable`);
 *   - NO corta en los `;` que están dentro de comillas simples o dobles, porque
 *     un `DEFAULT 'algo;x'` partiría una sentencia en dos y el conteo mentiría.
 * El SQL de Prisma en PostgreSQL no trae `$$`, así que no hay que parsear dólares.
 */
function sentenciasDeSql(sql) {
  const sentencias = []
  let actual = ""
  let comillaSimple = false
  let comillaDoble = false
  const texto = String(sql ?? "")

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]

    if (!comillaSimple && !comillaDoble && c === "-" && texto[i + 1] === "-") {
      while (i < texto.length && texto[i] !== "\n") i++
      actual += "\n"
      continue
    }
    if (!comillaDoble && c === "'") {
      // `''` es una comilla escapada dentro del literal, no el fin del literal.
      if (comillaSimple && texto[i + 1] === "'") {
        actual += "''"
        i++
        continue
      }
      comillaSimple = !comillaSimple
      actual += c
      continue
    }
    if (!comillaSimple && c === '"') {
      if (comillaDoble && texto[i + 1] === '"') {
        actual += '""'
        i++
        continue
      }
      comillaDoble = !comillaDoble
      actual += c
      continue
    }
    if (!comillaSimple && !comillaDoble && c === ";") {
      if (actual.trim()) sentencias.push(actual.trim())
      actual = ""
      continue
    }
    actual += c
  }
  if (actual.trim()) sentencias.push(actual.trim())
  return sentencias
}

/** Nombre de tabla/columna citado o no: `"actas_gd"` y `actas_gd` son lo mismo. */
const IDENTIFICADOR = String.raw`("([^"]+)"|([A-Za-z_][\w$]*))`

/** El nombre capturado, sin comillas y sin la alternativa que no matcheó. */
function nombreDe(match, indice) {
  const citado = match[indice]
  if (citado) return citado
  return match[indice + 1] ?? "(sin nombre)"
}

/**
 * Clasifica cada sentencia por lo que HACE, no por su texto: el resumen cuenta
 * efectos (`ADD COLUMN`), no la forma del SQL. `otras` agrupa por tipo para que
 * se lea qué más toca el push sin imprimir sentencia por sentencia.
 */
function clasificar(sentencias) {
  const resultado = {
    crearTablas: [],
    columnasAgregadas: [],
    tablasBorradas: [],
    columnasBorradas: [],
    otras: [],
  }

  for (const sentencia of sentencias) {
    const plano = sentencia.replace(/\s+/g, " ").trim()

    const crearTabla = new RegExp(String.raw`^CREATE TABLE (?:IF NOT EXISTS )?${IDENTIFICADOR}`, "i").exec(plano)
    if (crearTabla) {
      resultado.crearTablas.push(nombreDe(crearTabla, 1))
      continue
    }

    const agregarColumna = new RegExp(
      String.raw`^ALTER TABLE (?:IF EXISTS )?${IDENTIFICADOR} ADD COLUMN ${IDENTIFICADOR}`,
      "i"
    ).exec(plano)
    if (agregarColumna) {
      resultado.columnasAgregadas.push(`${nombreDe(agregarColumna, 1)}.${nombreDe(agregarColumna, 3)}`)
      continue
    }

    const borrarColumna = new RegExp(
      String.raw`^ALTER TABLE (?:IF EXISTS )?${IDENTIFICADOR} DROP COLUMN ${IDENTIFICADOR}`,
      "i"
    ).exec(plano)
    if (borrarColumna) {
      resultado.columnasBorradas.push(`${nombreDe(borrarColumna, 1)}.${nombreDe(borrarColumna, 3)}`)
      continue
    }

    const borrarTabla = new RegExp(String.raw`^DROP TABLE (?:IF EXISTS )?${IDENTIFICADOR}`, "i").exec(plano)
    if (borrarTabla) {
      resultado.tablasBorradas.push(nombreDe(borrarTabla, 1))
      continue
    }

    resultado.otras.push(tipoDeSentencia(plano))
  }

  return resultado
}

/**
 * Nombre corto de una sentencia "de otra clase". Se reconocen las formas que
 * emite `migrate diff` en PostgreSQL; lo que no matchea se nombra con sus dos
 * primeras palabras, para que igual se lea qué es (nunca "otra: otra").
 */
function tipoDeSentencia(plano) {
  const reglas = [
    [/^CREATE (?:UNIQUE )?INDEX/i, "CREATE INDEX"],
    [/^DROP INDEX/i, "DROP INDEX"],
    [/^ALTER TABLE .* ADD CONSTRAINT/i, "ALTER TABLE … ADD CONSTRAINT"],
    [/^ALTER TABLE .* ALTER COLUMN/i, "ALTER TABLE … ALTER COLUMN"],
    [/^ALTER TABLE .* RENAME/i, "ALTER TABLE … RENAME"],
    [/^ALTER TABLE .* DROP CONSTRAINT/i, "ALTER TABLE … DROP CONSTRAINT"],
    [/^CREATE SEQUENCE|^ALTER SEQUENCE|^DROP SEQUENCE/i, "SEQUENCE"],
    [/^ALTER TYPE|^CREATE TYPE|^DROP TYPE/i, "TYPE"],
    [/^COMMENT ON/i, "COMMENT ON"],
  ]
  const regla = reglas.find(([patron]) => patron.test(plano))
  if (regla) return regla[1]
  const palabras = plano.split(" ").slice(0, 2).join(" ").toUpperCase()
  return palabras || "(vacía)"
}

/* ---------- ejecución del CLI ---------- */

/**
 * `migrate diff` exige que origen y destino sean del mismo proveedor. Cuando no
 * lo son NO falla: devuelve un SQL sin sentido (comprobado: un `DROP TABLE` de
 * todas las tablas al comparar un SQLite contra el datamodel PostgreSQL), y ese
 * aviso falso de pérdida de datos es peor que no tener salida. Por eso se
 * compara el proveedor del schema destino con el protocolo de la URL y se avisa
 * a la vista; el comando se corre igual, porque acá no se bloquea nada.
 */
const PROVEEDOR_DEL_PROTOCOLO = { file: "sqlite", sqlite3: "sqlite", postgres: "postgresql" }

function avisoDeProveedor(urlBase, destino) {
  let proveedor = null
  try {
    const texto = readFileSync(destino, "utf8")
    proveedor = /datasource\s+\w+\s*\{[^}]*?provider\s*=\s*"([a-z0-9]+)"/i.exec(texto)?.[1]?.toLowerCase() ?? null
  } catch {
    // El schema no se puede leer: no es asunto de este aviso (el CLI lo dirá).
    return null
  }
  if (!proveedor) return null

  const protocolo = protocoloDe(urlBase)
  const deLaBase = PROVEEDOR_DEL_PROTOCOLO[protocolo] ?? protocolo
  if (deLaBase === proveedor) return null

  return (
    `OJO: la base es ${deLaBase} y ${destino} declara ${proveedor}; \`migrate diff\` exige el mismo ` +
    "proveedor, así que este SQL puede no significar nada (¿falta ESQUEMA_DESTINO?)"
  )
}

/**
 * El CLI de Prisma instalado (`prisma/build/index.js`), ejecutado con el mismo
 * Node que corre este script. Se resuelve desde el directorio del proyecto, así
 * que funciona con el hoisting del monorepo y en Windows. `npx` queda de
 * respaldo: si el paquete no está instalado, npx puede querer bajarlo de la red
 * y acá no se instala nada.
 */
function comandosDelDiff(destino, urlBase) {
  let ejecutable = null
  let argumentosBase = []
  try {
    ejecutable = process.execPath
    argumentosBase = [createRequire(import.meta.url).resolve("prisma/build/index.js")]
  } catch {
    ejecutable = "npx"
    argumentosBase = ["prisma"]
  }
  return {
    ejecutable,
    argumentos: [
      ...argumentosBase,
      "migrate",
      "diff",
      "--from-url",
      urlBase,
      "--to-schema-datamodel",
      destino,
      "--script",
    ],
  }
}

/**
 * Corre el diff y devuelve `{ ok, sql, motivo }`. Nunca lanza: cualquier fallo
 * (engine, permiso, red, schema inválido) se convierte en un motivo legible y
 * redactado, porque el script no puede tumbar el job.
 */
function leerDiff(urlBase, destino) {
  try {
    const { ejecutable, argumentos } = comandosDelDiff(destino, urlBase)

    const salida = spawnSync(ejecutable, argumentos, {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: MAX_ESPERA_MS,
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        // Explícita: gana sobre cualquier `.env*` que el CLI cargue por su cuenta.
        DATABASE_URL: urlBase,
        // Sin consulta de telemetría/update: un diagnóstico no necesita red extra.
        CHECKPOINT_DISABLE: "1",
      },
    })

    if (salida.error) {
      return { ok: false, motivo: unaLinea(redactar(`no se pudo ejecutar el CLI: ${salida.error.message}`, urlBase)) }
    }
    if (salida.status !== 0) {
      const stderr = String(salida.stderr ?? "").trim()
      const stdout = String(salida.stdout ?? "").trim()
      const detalle = stderr || stdout || "(sin salida)"
      return {
        ok: false,
        motivo: unaLinea(redactar(`prisma migrate diff salió con código ${salida.status}: ${detalle}`, urlBase)),
      }
    }
    return { ok: true, sql: String(salida.stdout ?? "") }
  } catch (error) {
    return { ok: false, motivo: unaLinea(redactar(`no se pudo correr el diff: ${error?.message}`, urlBase)) }
  }
}

/* ---------- reporte ---------- */

/** "1 sentencia" / "3 sentencias", para que el resumen no diga "1 sentencias". */
function plural(cantidad, singular, plural_) {
  return `${cantidad} ${cantidad === 1 ? singular : plural_}`
}

function listaONinguna(nombres, vacio) {
  return nombres.length > 0 ? nombres.join(", ") : vacio
}

/**
 * El resumen legible. Se arma con etiquetas fijas (`CREATE TABLE`,
 * `ALTER TABLE ... ADD COLUMN`, `DROP TABLE`, `DROP COLUMN`) porque son las
 * mismas palabras con las que `db push` avisa: así el log se busca con lo que ya
 * está en el error del job.
 */
/**
 * La única definición de «destructivo» del script: sentencias que borran datos de
 * la base (`DROP TABLE` / `DROP COLUMN`). Se cuenta desde la clasificación, no
 * desde el texto del SQL, y la usan el informe y el veredicto para que no puedan
 * decir cosas distintas.
 */
function borraDatos(deriva) {
  return deriva.tablasBorradas.length + deriva.columnasBorradas.length
}

function imprimirResumen(deriva) {
  const otrasPorTipo = new Map()
  for (const tipo of deriva.otras) otrasPorTipo.set(tipo, (otrasPorTipo.get(tipo) ?? 0) + 1)
  const otrasDetalle = [...otrasPorTipo.entries()]
    .map(([tipo, cantidad]) => `${tipo} (${cantidad})`)
    .join(", ")

  console.log("resumen de la deriva — esto es lo que `prisma db push` intentaría aplicar:")
  console.log(`  CREATE TABLE: ${deriva.crearTablas.length} — ${listaONinguna(deriva.crearTablas, "ninguna tabla nueva")}`)
  console.log(
    `  ALTER TABLE ... ADD COLUMN: ${deriva.columnasAgregadas.length} — ${listaONinguna(deriva.columnasAgregadas, "ninguna columna nueva")}`
  )
  console.log(
    `  ⚠️ PELIGROSO — DROP TABLE: ${deriva.tablasBorradas.length} — ${listaONinguna(deriva.tablasBorradas, "ninguna tabla se borra")}`
  )
  console.log(
    `  ⚠️ PELIGROSO — DROP COLUMN: ${deriva.columnasBorradas.length} — ${listaONinguna(deriva.columnasBorradas, "ninguna columna se borra")}`
  )
  console.log(
    `  otras sentencias: ${deriva.otras.length} — ${otrasDetalle || "ninguna de otra clase"}`
  )

  const destructivas = borraDatos(deriva)
  if (destructivas > 0) {
    console.log("")
    console.log(
      `  ATENCIÓN: ${destructivas} sentencia(s) borran datos de la base real. Esto NO se aplica solo`
    )
    console.log(
      "  (`db push` sin `--accept-data-loss` falla): la decisión es del owner, y acá no se toma."
    )
  }
}

/**
 * La línea que resume todo y la que se busca en el log. Cuatro estados, nunca
 * tres: al día, pendiente sin pérdida, pendiente CON pérdida, y NO VERIFICADO.
 */
function lineaDeResumen({ deriva, motivo }) {
  if (motivo) return `deriva de esquema: NO VERIFICADO — ${motivo}`
  if (!deriva) return "deriva de esquema: NO VERIFICADO — motivo desconocido"

  const total =
    deriva.crearTablas.length +
    deriva.columnasAgregadas.length +
    deriva.tablasBorradas.length +
    deriva.columnasBorradas.length +
    deriva.otras.length

  if (total === 0) {
    return "deriva de esquema: la base está al día con el schema — 0 sentencias pendientes"
  }

  const destructivas = borraDatos(deriva)
  const pendientes = plural(total, "sentencia pendiente", "sentencias pendientes")
  const conteo =
    `${deriva.crearTablas.length} CREATE TABLE, ` +
    `${deriva.columnasAgregadas.length} ADD COLUMN, ` +
    `${deriva.tablasBorradas.length} DROP TABLE, ` +
    `${deriva.columnasBorradas.length} DROP COLUMN, ` +
    `${deriva.otras.length} otras`

  if (destructivas > 0) {
    return (
      `deriva de esquema: ${pendientes} — ${conteo} · ⚠️ ${destructivas} de ellas destruyen datos: ` +
      "decidir --accept-data-loss acá es una decisión con datos en juego, no un trámite"
    )
  }
  return `deriva de esquema: ${pendientes} — ${conteo} · nada destructivo`
}

async function main() {
  console.log(lineaGuiones())
  console.log(`diagnóstico de deriva de esquema — base (DATABASE_URL) contra ${ESQUEMA_DESTINO}`)
  console.log(lineaGuiones())

  if (!URL_BASE) {
    console.log("sin DATABASE_URL en el entorno: no hay base que comparar.")
    console.log("")
    console.log(lineaGuiones())
    console.log(
      "deriva de esquema: NO VERIFICADO — sin DATABASE_URL en el entorno: no hay base que comparar"
    )
    escribirVeredicto(true)
    return
  }

  console.log(`base: ${protocoloDe(URL_BASE)} (URL tomada de DATABASE_URL, no se imprime)`)
  console.log("")

  const aviso = avisoDeProveedor(URL_BASE, ESQUEMA_DESTINO)
  if (aviso) {
    console.log(aviso)
    console.log("")
  }

  const lectura = leerDiff(URL_BASE, ESQUEMA_DESTINO)
  if (!lectura.ok) {
    console.log(`no se pudo generar el SQL de la deriva — ${lectura.motivo}`)
    console.log("")
    console.log(lineaGuiones())
    console.log(lineaDeResumen({ motivo: lectura.motivo }))
    escribirVeredicto(true)
    return
  }

  const sentencias = sentenciasDeSql(lectura.sql)
  const deriva = clasificar(sentencias)
  const totalSentencias = sentencias.length

  if (totalSentencias === 0) {
    console.log("la base está al día con el schema: `prisma migrate diff` no devolvió ninguna sentencia.")
    console.log("")
    console.log(lineaGuiones())
    console.log(lineaDeResumen({ deriva }))
    escribirVeredicto(false)
    return
  }

  imprimirResumen(deriva)
  console.log("")
  console.log(lineaGuiones())

  // El SQL completo al final: el resumen de arriba se lee, esto se audita.
  console.log(`SQL completo — ${plural(totalSentencias, "sentencia", "sentencias")} que \`prisma db push\` intentaría aplicar:`)
  console.log("")
  console.log(lectura.sql.trimEnd())
  console.log("")
  console.log(lineaGuiones())
  console.log(lineaDeResumen({ deriva }))
  escribirVeredicto(borraDatos(deriva) > 0)
}

// Diagnóstico, no gate: pase lo que pase el job sigue y el `db push` decide.
main().catch((error) => {
  console.log(`diagnóstico de deriva de esquema: falló inesperadamente — ${unaLinea(error?.name ?? "Error")}`)
  console.log("")
  console.log(
    `deriva de esquema: NO VERIFICADO — falló el diagnóstico inesperadamente (${unaLinea(error?.name ?? "Error")})`
  )
  // Un diagnóstico que revienta tampoco sabe si el diff es aditivo: no se aplica.
  escribirVeredicto(true)
})
