/**
 * @vitest-environment node
 *
 * `scripts/jdd.mjs` — interruptor entre los dos juegos de datos del MISMO Postgres.
 *
 * Se prueban sólo las piezas puras: parseo de argumentos, clasificación de la URL, orden
 * topológico de tablas y el resumen del restore. Nada de base ni de red: el script mueve
 * datos de producción, así que la decisión (qué comando, contra qué motor, en qué orden,
 * si cuadró) es lo que hay que blindar antes de tocar un solo registro.
 */
import { describe, expect, it } from "vitest"
import { armarResumen, evaluarUrl, ordenTopologico, parsearArgs } from "../scripts/jdd.mjs"

/** Fila de FK tal como la devuelve `pg_constraint`: hija depende de padre. */
interface Fk {
  hija: string
  padre: string
}

/** El orden como valor plano; falla el test con el mensaje del ciclo si no hay orden. */
function ordenDe(tablas: string[], fks: Fk[]): string[] {
  const r = ordenTopologico(tablas, fks)
  if (!r.ok) throw new Error(`no debía fallar: ${r.error}`)
  return r.orden
}

describe("parsearArgs — la guarda de borrado se gana con el literal exacto", () => {
  it("habilita con --confirmo=BORRAR exacto", () => {
    const args = parsearArgs(["--confirmo=BORRAR"])

    expect(args.confirmo).toBe(true)
  })

  it("no habilita con minúsculas, otro texto ni el prefijo", () => {
    for (const crudo of ["--confirmo=borrar", "--confirmo=OTRO", "--confirmo=BORRAR-TODO", "--confirmo="]) {
      expect(parsearArgs([crudo]).confirmo, crudo).toBe(false)
    }
  })

  it("no habilita con el flag ausente ni separado por espacio", () => {
    expect(parsearArgs([]).confirmo).toBe(false)
    expect(parsearArgs(["wipe"]).confirmo).toBe(false)
    expect(parsearArgs(["--confirmo", "BORRAR"]).confirmo).toBe(false)
  })

  it("separa comando, posicionales y flags", () => {
    const args = parsearArgs(["restore", "jdd1-pre-reset-20261125", "--confirmo=BORRAR", "--dry-run"])

    expect(args.comando).toBe("restore")
    expect(args.posicional).toEqual(["jdd1-pre-reset-20261125"])
    expect(args.confirmo).toBe(true)
    expect(args.dryRun).toBe(true)
  })

  it("toma la comunidad y no confunde un flag desconocido con uno válido", () => {
    const args = parsearArgs(["seed", "--comunidad=comunidad-a", "--si-se-que-borro"])

    expect(args.comunidad).toBe("comunidad-a")
    expect(args.desconocidos).toEqual(["--si-se-que-borro"])
  })
})

describe("evaluarUrl — sólo Postgres, y sin eco del secreto", () => {
  it("rechaza la base SQLite de tests (file:./perf-test.db)", () => {
    const r = evaluarUrl("file:./perf-test.db")

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toMatch(/Solo Postgres/)
    expect(r.motivo).not.toContain("perf-test")
  })

  it("rechaza cualquier esquema que no sea postgres/postgresql", () => {
    for (const url of ["https://ejemplo.test/db", "mysql://host/base", "sqlite://archivo.db", ""]) {
      expect(evaluarUrl(url).ok, url).toBe(false)
    }
  })

  it("acepta postgres y postgresql mostrando host y base, nunca la URL", () => {
    const r = evaluarUrl("postgresql://usuario:secreto@ep-cool-1234.neon.tech:5432/compass?sslmode=require")

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.host).toBe("ep-cool-1234.neon.tech:5432")
    expect(r.base).toBe("compass")
    expect(JSON.stringify(r)).not.toContain("secreto")
    expect(evaluarUrl("postgres://u:p@localhost:5432/compass").ok).toBe(true)
  })
})

describe("ordenTopologico — padres antes que hijos, ciclo es error", () => {
  it("ordena comunidad → unidad → cobro_gc aunque lleguen desordenadas", () => {
    const orden = ordenDe(
      ["cobro_gc", "unidad", "comunidad"],
      [
        { hija: "unidad", padre: "comunidad" },
        { hija: "cobro_gc", padre: "unidad" },
        { hija: "cobro_gc", padre: "comunidad" },
      ],
    )

    expect(orden.indexOf("comunidad")).toBeLessThan(orden.indexOf("unidad"))
    expect(orden.indexOf("unidad")).toBeLessThan(orden.indexOf("cobro_gc"))
    expect(orden).toHaveLength(3)
  })

  it("es determinista: sin FKs ordena alfabético", () => {
    expect(ordenDe(["unidad", "cobro_gc", "comunidad"], [])).toEqual(["cobro_gc", "comunidad", "unidad"])
  })

  it("detecta un ciclo y devuelve error en vez de colgarse", () => {
    const r = ordenTopologico(
      ["a", "b", "c"],
      [
        { hija: "a", padre: "b" },
        { hija: "b", padre: "a" },
      ],
    )

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/ciclo/i)
    expect(r.error).toContain("a")
    expect(r.error).toContain("b")
    expect(r.error).not.toContain("c,")
  })

  it("ignora autos-referencias y FKs hacia tablas fuera del conjunto", () => {
    expect(ordenDe(["unidad"], [{ hija: "unidad", padre: "unidad" }])).toEqual(["unidad"])
    expect(ordenDe(["unidad"], [{ hija: "unidad", padre: "ajena" }])).toEqual(["unidad"])
  })
})

describe("armarResumen — origen con menos tablas que destino", () => {
  it("marca la tabla ausente en el origen como faltante y sigue", () => {
    const r = armarResumen({
      tablasDestino: ["comunidad", "unidad", "cobro_gc"],
      tablasOrigen: ["comunidad", "unidad"],
      leidas: { comunidad: 2, unidad: 5 },
      escritas: { comunidad: 2, unidad: 5 },
    })

    expect(r.filas.map((f) => f.tabla)).toEqual(["comunidad", "unidad", "cobro_gc"])
    expect(r.filas[2]).toEqual({ tabla: "cobro_gc", leidas: 0, escritas: 0, estado: "faltante" })
    expect(r.faltantes).toEqual(["cobro_gc"])
    expect(r.totales).toEqual({ leidas: 7, escritas: 7 })
    expect(r.todoCuadra).toBe(true)
  })

  it("marca descuadre cuando se leyeron más filas de las que se escribieron", () => {
    const r = armarResumen({
      tablasDestino: ["unidad"],
      tablasOrigen: ["unidad"],
      leidas: { unidad: 5 },
      escritas: { unidad: 4 },
    })

    expect(r.filas[0]?.estado).toBe("descuadre")
    expect(r.todoCuadra).toBe(false)
  })
})
