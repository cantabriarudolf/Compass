#!/usr/bin/env node
/**
 * Cuenta lo que el carril `db-prod` va a destruir ANTES de destruirlo.
 *
 * El 2026-11-08 el run `42697576526` borró cuatro columnas en dos tablas y el
 * paso «contar antes de borrar» no imprimió una sola línea: sólo buscaba
 * `DROP TABLE`, y la deriva era `DROP COLUMN`. La consecuencia es la peor que
 * puede tener una guarda: el log dice «listo» y nadie sabe qué se perdió.
 *
 * Este archivo existe separado del workflow para que la parte que decide QUÉ
 * se pierde se pueda probar sin GitHub ni Neon: es el parser, y lo consume
 * `test/db-prod-contar-perdidas.test.ts`. El conteo de filas sí necesita la
 * base real (`@prisma/client`) y vive acá abajo, en el CLI.
 *
 * Uso: node scripts/db-prod-contar-perdidas.mjs /tmp/deriva.sql
 * (desde `k0mp4ss_fe/apps/web`, que es el cwd del job).
 */
import { readFileSync } from "node:fs"

/** Identificador SQL entre comillas o desnudo. */
const ID = String.raw`"?([A-Za-z_][A-Za-z0-9_]*)"?`

/**
 * Descarta comentarios de PostgreSQL y de Prisma (`-- …` y `/* … *\/`).
 * Sólo se come el `--` cuando abre la línea: un `--` dentro de un literal no
 * aparece en el SQL que genera `migrate diff`, y comerse todo lo que sigue a
 * cualquier `--` sería la clase de atajo que convierte un parser en un adivino.
 */
export function sinComentarios(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((linea) => (linea.trimStart().startsWith("--") ? "" : linea))
    .join("\n")
}

/**
 * Las pérdidas que declara un script de `prisma migrate diff`.
 *
 * `DROP COLUMN` se resuelve **por sentencia y no por línea**: cuando Prisma
 * quita varias columnas de la misma tabla emite un solo `ALTER TABLE` con las
 * columnas en una lista separada por comas —
 *
 *   ALTER TABLE "controles_propiedad" DROP COLUMN "residenteVeMorosidad",
 *   DROP COLUMN "alertasResidentesActivas";
 *
 * — así que el nombre de la tabla aparece una vez y una búsqueda línea a línea
 * vería una sola columna (o ninguna) de las dos.
 *
 * @param {string} sql
 * @returns {Array<{ tipo: "tabla", nombre: string } | { tipo: "columna", tabla: string, columna: string }>}
 */
export function parsearPerdidas(sql) {
  const limpio = sinComentarios(sql)
  /** @type {Array<{ tipo: "tabla", nombre: string } | { tipo: "columna", tabla: string, columna: string }>} */
  const perdidas = []
  const vistos = new Set()

  const agregar = (perdida) => {
    const clave =
      perdida.tipo === "tabla"
        ? `tabla:${perdida.nombre}`
        : `columna:${perdida.tabla}.${perdida.columna}`
    if (vistos.has(clave)) return
    vistos.add(clave)
    perdidas.push(perdida)
  }

  // DROP TABLE [IF EXISTS] "a"[, "b"]… — admite la lista, aunque hoy Prisma
  // emita una sentencia por tabla.
  const tablas = /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?("?[A-Za-z_][A-Za-z0-9_]*"?(?:\s*,\s*"?[A-Za-z_][A-Za-z0-9_]*"?)*)/gi
  for (const coincidencia of limpio.matchAll(tablas)) {
    for (const trozo of coincidencia[1].split(",")) {
      const nombre = trozo.trim().replace(/^"|"$/g, "")
      if (nombre) agregar({ tipo: "tabla", nombre })
    }
  }

  // DROP COLUMN: la tabla sale del ALTER TABLE de la MISMA sentencia.
  for (const sentencia of limpio.split(";")) {
    const tabla = new RegExp(
      String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?` + ID,
      "i"
    ).exec(sentencia)
    if (!tabla) continue
    const nombreTabla = tabla[1].replace(/^"/, "").replace(/"$/, "")
    const columnas = new RegExp(
      String.raw`\bDROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?` + ID,
      "gi"
    )
    for (const columna of sentencia.matchAll(columnas)) {
      const nombreColumna = columna[1].replace(/^"/, "").replace(/"$/, "")
      agregar({ tipo: "columna", tabla: nombreTabla, columna: nombreColumna })
    }
  }

  return perdidas
}

/** Mensaje único cuando no hay nada que perder: que el log lo diga, no que calle. */
export const SIN_PERDIDAS =
  "PÉRDIDA · ninguna: el diff no borra tablas ni columnas."

/** Filas afectadas por una pérdida, contadas contra la base real. */
async function contar(prisma, perdida) {
  if (perdida.tipo === "tabla") {
    const filas = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM "${perdida.nombre}"`
    )
    return `PÉRDIDA · ${perdida.nombre}: ${filas[0].n} fila(s) se van con la tabla`
  }
  // Una columna no se lleva la fila: se lleva el valor. Se cuentan las filas que
  // lo tienen, que es lo que de verdad se pierde (y el total, para dimensionar).
  const filas = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS total, count("${perdida.columna}")::int AS conValor FROM "${perdida.tabla}"`
  )
  const { total, conValor } = filas[0]
  return `PÉRDIDA · ${perdida.tabla}.${perdida.columna}: ${conValor} de ${total} fila(s) con valor`
}

async function main() {
  const ruta = process.argv[2]
  if (!ruta) {
    console.error("Uso: node scripts/db-prod-contar-perdidas.mjs <script.sql>")
    process.exit(1)
  }
  const perdidas = parsearPerdidas(readFileSync(ruta, "utf8"))
  if (perdidas.length === 0) {
    console.log(SIN_PERDIDAS)
    return
  }

  const { PrismaClient } = await import("@prisma/client")
  const prisma = new PrismaClient()
  try {
    for (const perdida of perdidas) {
      try {
        console.log(await contar(prisma, perdida))
      } catch (error) {
        const detalle = String(error?.message ?? error).split("\n")[0]
        const nombre =
          perdida.tipo === "tabla"
            ? perdida.nombre
            : `${perdida.tabla}.${perdida.columna}`
        console.log(`PÉRDIDA · ${nombre}: no se pudo contar (${detalle})`)
      }
    }
  } finally {
    await prisma.$disconnect()
  }
}

// Sólo corre el CLI cuando se lo invoca como programa: el test importa el parser.
if (process.argv[1] && process.argv[1].endsWith("db-prod-contar-perdidas.mjs")) {
  await main()
}
