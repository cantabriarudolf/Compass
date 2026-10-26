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
import { ENCABEZADOS_PERSONAS } from "@/lib/importar/personas"

// Encabezados canónicos del bloque personas en una sola cadena (se reusa acá
// y en el suite del import para verificar que parser y plantilla van juntos).
const ENCABEZADOS_PERSONAS_CON_COMA = ENCABEZADOS_PERSONAS.join(",")

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

describe("parsearCsv — separador (Excel español guarda con punto y coma)", () => {
  it("detecta el punto y coma y lo usa para separar", () => {
    const csv = `${ENCABEZADOS_PERSONAS_CON_COMA.replaceAll(",", ";")}\n12.345.678-5;María;Rojas;maria@test.cl;+56 9 6123 4567;residente`
    const { filas } = parsearCsv(csv, { encabezadosEsperados: ENCABEZADOS_PERSONAS })

    expect(filas[0]!.valores["rut"]).toBe("12.345.678-5")
    expect(filas[0]!.valores["nombres"]).toBe("María")
    expect(filas[0]!.valores["email"]).toBe("maria@test.cl")
    expect(filas[0]!.valores["roles"]).toBe("residente")
  })

  it("detecta la tabulación como separador", () => {
    const csv = `a\tb\n1\t2`
    const { encabezados, filas } = parsearCsv(csv)

    expect(encabezados).toEqual(["a", "b"])
    expect(filas[0]!.valores).toEqual({ a: "1", b: "2" })
  })

  it("con punto y coma respeta las comillas: un punto y coma citado queda dentro del campo", () => {
    const csv = `a;b\n"Plaza; Central";dato`
    const { filas } = parsearCsv(csv)

    expect(filas[0]!.valores["a"]).toBe("Plaza; Central")
    expect(filas[0]!.valores["b"]).toBe("dato")
  })

  it("un punto y coma dentro de comillas no confunde la detección de un archivo con coma", () => {
    const csv = 'a,b\n"dice; hola",2'
    const { filas } = parsearCsv(csv)

    expect(filas[0]!.valores["a"]).toBe("dice; hola")
    expect(filas[0]!.valores["b"]).toBe("2")
  })

  it("un separador citado en el encabezado no entra en el conteo (no produce empate)", () => {
    // Si el «;» citado del encabezado contara para la detección, quedaría un
    // empate contra la coma y daría error; fuera de comillas sólo hay comas.
    const csv = 'a,"b;d"\n1,x'
    const { encabezados, filas } = parsearCsv(csv)

    expect(encabezados).toEqual(["a", "b;d"])
    expect(filas[0]!.valores).toEqual({ a: "1", "b;d": "x" })
  })

  it("si no se puede decidir el separador falla con un mensaje que dice cuáles acepta", () => {
    // Una sola columna sin ninguno de los separadores aceptados.
    expect(() => parsearCsv("encabezado\nvalor")).toThrow(
      /separador.*coma|punto y coma|tabulaci/i
    )
  })
})

describe("normalizarEncabezado", () => {
  it("recorta, baja a minúscula y reemplaza espacios por guión bajo", () => {
    expect(normalizarEncabezado("  Estado Ocupacion  ")).toBe("estado_ocupacion")
    expect(normalizarEncabezado("Prorrateo\tEspecial")).toBe("prorrateo_especial")
  })
})
