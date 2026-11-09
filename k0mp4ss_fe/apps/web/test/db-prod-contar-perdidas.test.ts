/**
 * @vitest-environment node
 *
 * El carril `db-prod` cuenta lo que va a destruir ANTES de destruirlo.
 *
 * El 2026-11-08 el run `42697576526` (unidad A2) borró cuatro columnas en dos
 * tablas y el paso «contar antes de borrar» no imprimió nada: su búsqueda era
 * `DROP TABLE` y la deriva era `DROP COLUMN`. Una guarda que calla cuando hay
 * pérdida es peor que no tenerla, porque el verde se lee como cobertura.
 *
 * Los casos fijan el contrato del parser con el SQL **tal como lo emite
 * `prisma migrate diff`**: un `ALTER TABLE` con las columnas en lista separada
 * por comas, que es la forma que rompía una búsqueda línea a línea.
 */
import { describe, expect, it } from "vitest"

import {
  SIN_PERDIDAS,
  parsearPerdidas,
  sinComentarios,
} from "../scripts/db-prod-contar-perdidas.mjs"

describe("db-prod · qué se pierde con el diff", () => {
  it("cuenta las DOS columnas del mismo ALTER TABLE, con su tabla", () => {
    // La deriva real de A2 sobre Neon: dos columnas por tabla, una sola vez el nombre.
    const sql = `-- DropColumn
ALTER TABLE "controles_propiedad" DROP COLUMN "residenteVeMorosidad",
DROP COLUMN "alertasResidentesActivas";

-- DropColumn
ALTER TABLE "controles_propiedad_archivados" DROP COLUMN "residenteVeMorosidad",
DROP COLUMN "alertasResidentesActivas";
`
    expect(parsearPerdidas(sql)).toEqual([
      { tipo: "columna", tabla: "controles_propiedad", columna: "residenteVeMorosidad" },
      { tipo: "columna", tabla: "controles_propiedad", columna: "alertasResidentesActivas" },
      { tipo: "columna", tabla: "controles_propiedad_archivados", columna: "residenteVeMorosidad" },
      { tipo: "columna", tabla: "controles_propiedad_archivados", columna: "alertasResidentesActivas" },
    ])
  })

  it("conserva el caso que ya funcionaba: DROP TABLE con su fila", () => {
    expect(parsearPerdidas(`-- DropTable\nDROP TABLE "documentos_co";\n`)).toEqual([
      { tipo: "tabla", nombre: "documentos_co" },
    ])
    // IF EXISTS y la lista de varias tablas en una sentencia.
    expect(parsearPerdidas(`DROP TABLE IF EXISTS "a", "b";`)).toEqual([
      { tipo: "tabla", nombre: "a" },
      { tipo: "tabla", nombre: "b" },
    ])
  })

  it("no cuenta lo que sólo se nombra en un comentario", () => {
    // La migración de A2 dice en prosa «no permite DROP COLUMN con FKs e índices
    // en juego»: si el parser no descarta comentarios, inventa una pérdida.
    const sql = `-- Esto borra una tabla: DROP TABLE "mentira";
/* DROP COLUMN "tampoco" */
DROP TABLE "verdad";
`
    expect(parsearPerdidas(sql)).toEqual([{ tipo: "tabla", nombre: "verdad" }])
  })

  it("una migración vacía no reporta pérdidas", () => {
    expect(parsearPerdidas("-- This is an empty migration.")).toEqual([])
    expect(SIN_PERDIDAS).toContain("ninguna")
  })

  it("acepta las formas sin comillas y con IF EXISTS", () => {
    const sql = `ALTER TABLE controles_propiedad DROP COLUMN IF EXISTS legado;
`
    expect(parsearPerdidas(sql)).toEqual([
      { tipo: "columna", tabla: "controles_propiedad", columna: "legado" },
    ])
    expect(sinComentarios("-- x\nDROP TABLE t;")).toContain("DROP TABLE t;")
  })

  it("no repite una pérdida declarada dos veces", () => {
    const sql = `ALTER TABLE "t" DROP COLUMN "c";
ALTER TABLE "t" DROP COLUMN "c";
`
    expect(parsearPerdidas(sql)).toEqual([{ tipo: "columna", tabla: "t", columna: "c" }])
  })
})
