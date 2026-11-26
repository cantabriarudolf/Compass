/**
 * @vitest-environment node
 *
 * `scripts/jdd.mjs` — interruptor entre los dos juegos de datos del MISMO Postgres.
 *
 * Se prueban sólo las piezas puras: parseo de argumentos, clasificación de la URL, orden
 * topológico de tablas, el resumen del restore, el preflight del origen y el diagnóstico del
 * estado mixto. Nada de base ni de red: el script mueve datos de producción, así que la
 * decisión (qué comando, contra qué motor, en qué orden, si cuadró) es lo que hay que blindar
 * antes de tocar un solo registro.
 */
import { describe, expect, it } from "vitest"
import {
  armarResumen,
  evaluarGuardasRestore,
  evaluarPreflightRestore,
  evaluarRestoreCompletado,
  evaluarUrl,
  ordenTopologico,
  parsearArgs,
  pasosSeed,
  textoEstadoMixto,
} from "../scripts/jdd.mjs"

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

  it("reconoce --permitir-vacio como escape hatch explícito del restore", () => {
    expect(parsearArgs(["restore", "jdd1", "--permitir-vacio"]).permitirVacio).toBe(true)
    expect(parsearArgs(["restore", "jdd1"]).permitirVacio).toBe(false)
    expect(parsearArgs(["restore", "jdd1", "--permitir-vacio"]).desconocidos).toEqual([])
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

describe("evaluarGuardasRestore — la guarda conserva su precedencia", () => {
  const origenVacio = evaluarPreflightRestore({ filasOrigen: { comunidad: 0 }, permitirVacio: false })
  const origenConFilas = evaluarPreflightRestore({ filasOrigen: { comunidad: 4 }, permitirVacio: false })

  it("ejecuta cuando hay guarda y el origen tiene filas", () => {
    expect(evaluarGuardasRestore({ confirmo: true, preflight: origenConFilas })).toEqual({
      accion: "ejecutar",
      codigo: 0,
    })
  })

  it("sigue saliendo con 2 sin --confirmo=BORRAR aunque el origen esté vacío", () => {
    expect(evaluarGuardasRestore({ confirmo: false, preflight: origenVacio })).toEqual({
      accion: "sin-guarda",
      codigo: 2,
    })
  })

  it("sigue simulando con --dry-run: sale 0 y no escribe", () => {
    expect(evaluarGuardasRestore({ dryRun: true, confirmo: true, preflight: origenVacio })).toEqual({
      accion: "simular",
      codigo: 0,
    })
    expect(evaluarGuardasRestore({ dryRun: true, confirmo: false, preflight: origenConFilas }).accion).toBe("simular")
  })

  it("aborta con 1 cuando hay guarda pero el origen está vacío", () => {
    expect(evaluarGuardasRestore({ confirmo: true, preflight: origenVacio })).toEqual({
      accion: "abortar",
      codigo: 1,
    })
  })
})

describe("evaluarPreflightRestore — el origen se cuenta antes de truncar", () => {
  it("aborta si el origen está vacío y no hay --permitir-vacio, y dice que no se truncó", () => {
    const r = evaluarPreflightRestore({ filasOrigen: { comunidad: 0, unidad: 0 }, permitirVacio: false })

    expect(r.abortar).toBe(true)
    expect(r.totalOrigen).toBe(0)
    expect(r.motivo).toMatch(/no se trunc/i)
    expect(r.motivo).toContain("--permitir-vacio")
    expect(r.motivo).toMatch(/vaciaría la base destino/)
  })

  it("procede con --permitir-vacio aunque el origen esté vacío", () => {
    const r = evaluarPreflightRestore({ filasOrigen: { comunidad: 0 }, permitirVacio: true })

    expect(r.abortar).toBe(false)
    expect(r.totalOrigen).toBe(0)
    expect(r.motivo).toContain("--permitir-vacio")
  })

  it("procede cuando el origen tiene filas", () => {
    const r = evaluarPreflightRestore({ filasOrigen: { comunidad: 3, unidad: 9 }, permitirVacio: false })

    expect(r.abortar).toBe(false)
    expect(r.totalOrigen).toBe(12)
    expect(r.motivo).toContain("12 filas")
  })

  it("trata un conteo ilegible (null) como cero filas y aborta por precaución", () => {
    const r = evaluarPreflightRestore({ filasOrigen: { comunidad: null, unidad: null }, permitirVacio: false })

    expect(r.totalOrigen).toBe(0)
    expect(r.abortar).toBe(true)
  })
})

describe("evaluarRestoreCompletado — cero filas escritas no es éxito", () => {
  it("clasifica como fallo un restore que no escribió ninguna fila", () => {
    const r = evaluarRestoreCompletado({ totalEscrito: 0, detenidoEn: null })

    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/0 filas escritas/)
    expect(r.motivo).not.toMatch(/todo cuadró/i)
  })

  it("clasifica como éxito un restore que escribió filas sin detenerse", () => {
    expect(evaluarRestoreCompletado({ totalEscrito: 7, detenidoEn: null }).ok).toBe(true)
  })

  it("clasifica como fallo un restore detenido aunque haya escrito algo", () => {
    const r = evaluarRestoreCompletado({ totalEscrito: 7, detenidoEn: "cobro_gc" })

    expect(r.ok).toBe(false)
    expect(r.motivo).toContain("cobro_gc")
  })
})

describe("textoEstadoMixto — qué quedó a medias y cómo recuperar", () => {
  it("nombra copiadas, la tabla fallida y las no intentadas, más el snapshot de recuperación", () => {
    const texto = textoEstadoMixto({
      copiadas: ["comunidad", "unidad"],
      fallida: "cobro_gc",
      noIntentadas: ["pago", "gasto"],
      escritas: { comunidad: 3, unidad: 9 },
    })

    expect(texto).toMatch(/copiadas/i)
    expect(texto).toMatch(/Fallida/)
    expect(texto).toMatch(/sin intentar|no intentad/i)
    expect(texto).toContain("cobro_gc")
    expect(texto).toContain("pago")
    expect(texto).toContain("comunidad (3)")
    expect(texto).toContain("jdd1-pre-reset-20261125")
    expect(texto).toMatch(/restore jdd1-pre-reset-20261125/)
  })

  it("acepta otro snapshot de recuperación sin perder la instrucción", () => {
    const texto = textoEstadoMixto({
      copiadas: [],
      fallida: "unidad",
      noIntentadas: ["pago"],
      snapshot: "jdd2-pre-pruebas",
    })

    expect(texto).toContain("jdd2-pre-pruebas")
    expect(texto).not.toContain("jdd1-pre-reset-20261125")
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

describe("pasosSeed — el seed del sistema no reemplaza al bulk de la comunidad", () => {
  const pasosDeDatos = (pasos: { args: string[] }[]) => pasos.filter((paso) => paso.args[1] === "seed:datos")

  it("sin --con-datos agrega seed:datos --solo-sistema como último paso", () => {
    const pasos = pasosSeed("comunidad-a", false)

    expect(pasos.at(-1)).toEqual({
      etiqueta: "seed:datos --solo-sistema (configuración y maestros de estructura)",
      args: ["run", "seed:datos", "--", "--comunidad-id=comunidad-a", "--solo-sistema"],
    })
    expect(pasosDeDatos(pasos)).toHaveLength(1)
    expect(pasos).toHaveLength(4)
  })

  it("con --con-datos usa el bulk completo y no repite el paso de sistema", () => {
    const pasos = pasosSeed("comunidad-a", true)

    expect(pasos.map((paso) => paso.args[1])).toEqual([
      "seed:authz",
      "db:catalogo-nacional",
      "seed:datos",
      "db:fondos-fi",
    ])
    expect(pasosDeDatos(pasos)).toEqual([
      {
        etiqueta: "seed:datos (datos de la comunidad, bulk de data/)",
        args: ["run", "seed:datos", "--", "--comunidad-id=comunidad-a"],
      },
    ])
    expect(JSON.stringify(pasos)).not.toContain("--solo-sistema")
    expect(pasos).toHaveLength(4)
  })
})
