/**
 * @vitest-environment node
 *
 * Parser CSV propio del importador de carga inicial (ODD carga-inicial-csv U1).
 * Cubre el contrato pedido: comillas con escape, comas y saltos de línea dentro
 * de comillas, BOM, CRLF/LF, encabezados normalizados a snake sin acentos,
 * filas vacías ignoradas y error legible si falta un encabezado esperado.
 */
import { describe, expect, it } from "vitest"
import { normalizarEncabezado, parsearCsv } from "@/lib/importar/csv"

describe("parsearCsv — filas con comillas", () => {
  it("soporta comas y saltos de línea dentro de campos entre comillas", () => {
    const csv = 'nombre,notas\n"Plaza, Central","primer renglón\nsegundo renglón"'
    const { encabezados, filas } = parsearCsv(csv)

    expect(encabezados).toEqual(["nombre", "notas"])
    expect(filas).toHaveLength(1)
    expect(filas[0]!.valores["nombre"]).toBe("Plaza, Central")
    expect(filas[0]!.valores["notas"]).toBe("primer renglón\nsegundo renglón")
  })

  it('un `""` dentro de un campo entre comillas es una comilla literal', () => {
    const csv = 'apodo,frase\n"El ""Jefe""","dijo ""hola"" y se fue"'
    const { filas } = parsearCsv(csv)

    expect(filas[0]!.valores["apodo"]).toBe('El "Jefe"')
    expect(filas[0]!.valores["frase"]).toBe('dijo "hola" y se fue')
  })

  it("numera las líneas reales del archivo cuando hay campos multilínea", () => {
    const csv = 'a,b\nuno,"dos\nmas\nlineas",x\ntres,cuatro'
    const { filas } = parsearCsv(csv)

    // La primera fila empieza en la línea 2; la segunda, en la 5 (las líneas
    // 3 y 4 quedaron consumidas por el campo entre comillas).
    expect(filas.map((f) => f.linea)).toEqual([2, 5])
  })
})

describe("parsearCsv — formato del archivo", () => {
  it("acepta CRLF y LF indistintamente", () => {
    const crlf = "a,b\r\n1,2\r\n3,4"
    const lf = "a,b\n1,2\n3,4"

    expect(parsearCsv(crlf).filas.map((f) => f.valores)).toEqual(
      parsearCsv(lf).filas.map((f) => f.valores)
    )
    expect(parsearCsv(crlf).filas).toHaveLength(2)
  })

  it("descarta el BOM al inicio del archivo", () => {
    const csv = "\ufeffa,b\n1,2"
    const { encabezados, filas } = parsearCsv(csv)

    expect(encabezados).toEqual(["a", "b"])
    expect(filas[0]!.valores).toEqual({ a: "1", b: "2" })
  })

  it("ignora las filas vacías sin correr la numeración de las demás", () => {
    const csv = "a,b\n\n1,2\n,,\n\n3,4\n"
    const { filas } = parsearCsv(csv)

    expect(filas).toHaveLength(2)
    expect(filas.map((f) => f.linea)).toEqual([3, 6])
  })

  it("una fila más corta que los encabezados completa con vacío", () => {
    const csv = "a,b,c\n1,2"
    const { filas } = parsearCsv(csv)

    expect(filas[0]!.valores).toEqual({ a: "1", b: "2", c: "" })
  })
})

describe("parsearCsv — encabezados", () => {
  it("normaliza encabezados con espacios y acentos a snake sin acentos", () => {
    const csv = "Macro Sector,Rol SII,Tipo  Unidad,Descripción,Año\nx,1,2,3,4"
    const { encabezados, filas } = parsearCsv(csv)

    expect(encabezados).toEqual([
      "macro_sector",
      "rol_sii",
      "tipo_unidad",
      "descripcion",
      "ano",
    ])
    expect(filas[0]!.valores["descripcion"]).toBe("3")
  })

  it("falla con un mensaje legible si falta un encabezado esperado", () => {
    const csv = "macro_sector,micro_sector\nTorre A,Piso 1"

    expect(() =>
      parsearCsv(csv, {
        encabezadosEsperados: ["macro_sector", "micro_sector", "rol_sii"],
      })
    ).toThrow(/rol_sii/)
  })

  it("no exige encabezados si nadie pide la verificación", () => {
    expect(() => parsearCsv("a,b\n1,2")).not.toThrow()
  })

  it("un archivo sin encabezados falla con mensaje claro", () => {
    expect(() => parsearCsv("", { encabezadosEsperados: ["a"] })).toThrow(
      /vac[íi]o|encabezados/i
    )
  })
})

describe("normalizarEncabezado", () => {
  it("recorta, baja a minúscula y reemplaza espacios por guión bajo", () => {
    expect(normalizarEncabezado("  Estado Ocupacion  ")).toBe("estado_ocupacion")
    expect(normalizarEncabezado("Prorrateo\tEspecial")).toBe("prorrateo_especial")
  })
})
