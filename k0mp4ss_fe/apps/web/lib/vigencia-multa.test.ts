/**
 * @vitest-environment node
 *
 * S1 — el monto de la multa sale del maestro de infracciones **de la
 * comunidad**, con su ancla legal, y sin monto declarado no se multa.
 *
 * `multaDeVigenciaDeLaComunidad` es la traducción base → contrato: busca la fila
 * del maestro por comunidad y por el nombre canónico, y le delega la decisión a
 * `multaDisponible` (la regla pura ya probada en `lib/vigencia-registro.test.ts`).
 * Lo que se fija acá, todo observable por el resultado:
 *
 *   1. sin la fila del maestro no se multa, y el motivo nombra el tipo que falta
 *      y dice que no se multa (el sistema lo declara, no inventa un número);
 *   2. un monto en cero tampoco habilita: no hay monto por defecto;
 *   3. con monto positivo, la multa sale con ese monto y con su ancla legal, para
 *      que una pantalla pueda mostrar de dónde viene el número;
 *   4. el alcance es la comunidad: la fila de otra comunidad no cuenta.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  NOMBRE_TIPO_MULTA_VIGENCIA,
  multaDeVigenciaDeLaComunidad,
  propuestaDeMultaPermitida,
} from "@/lib/vigencia-multa"

const COM_A = "vig-multa-com-a"
const COM_B = "vig-multa-com-b"
const TIPO_A = "vig-multa-tipo-a"
const TIPO_B = "vig-multa-tipo-b"

describe("vigencia — la multa sale del maestro de la comunidad (S1)", () => {
  beforeAll(async () => {
    for (const [id, nombre, slug] of [
      [COM_A, "Comunidad Multa A", "vig-multa-com-a"],
      [COM_B, "Comunidad Multa B", "vig-multa-com-b"],
    ] as const) {
      await prisma.comunidad.upsert({
        where: { id },
        update: {},
        create: { id, nombre, slug },
      })
    }

    await prisma.tipoInfraccionIN.deleteMany({
      where: { comunidadId: { in: [COM_A, COM_B] } },
    })
    // La comunidad B declaró el tipo con su propio monto; la A no declaró nada.
    await prisma.tipoInfraccionIN.create({
      data: {
        id: TIPO_B,
        comunidadId: COM_B,
        nombre: NOMBRE_TIPO_MULTA_VIGENCIA,
        categoria: "grave",
        tipoSancion: "monto_fijo",
        valor: 20000,
        referenciaLegal: "Acta de asamblea ordinaria de 2026",
      },
    })
  })

  afterAll(async () => {
    try {
      await prisma.tipoInfraccionIN.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.comunidad.deleteMany({
        where: { id: { in: [COM_A, COM_B] } },
      })
    } catch {
      // limpieza best-effort
    }
  })

  it("sin el tipo en el maestro no se multa, y el motivo lo dice", async () => {
    const multa = await multaDeVigenciaDeLaComunidad(COM_A)
    expect(multa.disponible).toBe(false)
    if (multa.disponible) throw new Error("no debía haber multa disponible")
    expect(multa.motivo).toContain(NOMBRE_TIPO_MULTA_VIGENCIA)
    expect(multa.motivo).toContain("no se multa")
    expect(multa.referenciaLegal).toBeNull()
  })

  it("un monto en cero no habilita la multa (no hay monto por defecto)", async () => {
    await prisma.tipoInfraccionIN.create({
      data: {
        id: TIPO_A,
        comunidadId: COM_A,
        nombre: NOMBRE_TIPO_MULTA_VIGENCIA,
        categoria: "grave",
        tipoSancion: "monto_fijo",
        valor: 0,
        referenciaLegal: "Artículo 12 del reglamento de copropiedad",
      },
    })
    try {
      const multa = await multaDeVigenciaDeLaComunidad(COM_A)
      expect(multa.disponible).toBe(false)
      if (multa.disponible) throw new Error("un monto en cero no es una multa")
      expect(multa.motivo).toContain("no se multa")
    } finally {
      await prisma.tipoInfraccionIN.deleteMany({ where: { id: TIPO_A } })
    }
  })

  it("con monto declarado, devuelve el monto y su ancla legal", async () => {
    await prisma.tipoInfraccionIN.create({
      data: {
        id: TIPO_A,
        comunidadId: COM_A,
        nombre: NOMBRE_TIPO_MULTA_VIGENCIA,
        categoria: "grave",
        tipoSancion: "monto_fijo",
        valor: 35000,
        referenciaLegal: "Artículo 12 del reglamento de copropiedad",
      },
    })
    try {
      const multa = await multaDeVigenciaDeLaComunidad(COM_A)
      expect(multa.disponible).toBe(true)
      if (!multa.disponible) throw new Error("debía haber multa disponible")
      expect(multa.monto).toBe(35000)
      expect(multa.referenciaLegal).toBe(
        "Artículo 12 del reglamento de copropiedad"
      )
    } finally {
      await prisma.tipoInfraccionIN.deleteMany({ where: { id: TIPO_A } })
    }
  })

  it("la fila de otra comunidad no habilita la multa de esta", async () => {
    // La B declaró 20.000 en su maestro; la A sigue sin declarar el tipo.
    const deB = await multaDeVigenciaDeLaComunidad(COM_B)
    expect(deB.disponible).toBe(true)

    const deA = await multaDeVigenciaDeLaComunidad(COM_A)
    expect(deA.disponible).toBe(false)
  })
})

/**
 * S4 — cuándo se permite proponer la multa.
 *
 * Proponer es un acto explícito de la administración (D5: sin cron) y sólo
 * puede nacer cuando el caso está `habilitado_para_multa`, la comunidad declaró
 * el monto en su maestro y el ciclo todavía no tiene propuesta. La regla es pura
 * a propósito: recibe el veredicto y la disponibilidad ya resueltos y no consulta
 * la base, para que todo «no» traiga su motivo legible y ninguna ruta tenga que
 * re-derivar la decisión.
 */
describe("vigencia — cuándo se permite proponer la multa (S4)", () => {
  const multaDeclarada = {
    disponible: true as const,
    monto: 35000,
    tipo: NOMBRE_TIPO_MULTA_VIGENCIA,
    referenciaLegal: "Artículo 12 del reglamento de copropiedad",
    tipoInfraccionId: "vig-multa-tipo-a",
  }

  const sinMonto = {
    disponible: false as const,
    motivo: `La comunidad no declaró en su maestro de infracciones el tipo «${NOMBRE_TIPO_MULTA_VIGENCIA}»: no se multa y no se inventa un monto.`,
    referenciaLegal: null,
    tipoInfraccionId: null,
  }

  it("con el caso habilitado, el monto declarado y el ciclo libre, la propuesta se permite", () => {
    expect(
      propuestaDeMultaPermitida({
        veredicto: { estado: "habilitado_para_multa" },
        multa: multaDeclarada,
        propuestaExistente: false,
      })
    ).toEqual({ permitida: true })
  })

  it("en cualquier otro estado la propuesta se rechaza nombrando el estado", () => {
    for (const estado of [
      "al_dia",
      "por_vencer",
      "requerido",
      "sin_declaracion",
    ] as const) {
      const decision = propuestaDeMultaPermitida({
        veredicto: { estado },
        multa: multaDeclarada,
        propuestaExistente: false,
      })
      expect(decision.permitida).toBe(false)
      if (decision.permitida) throw new Error(`no debía permitirse: ${estado}`)
      expect(decision.motivo).toContain(estado)
      expect(decision.motivo).toContain("no se propone")
    }
  })

  it("sin el monto declarado en el maestro, el rechazo repite el motivo de la multa", () => {
    const decision = propuestaDeMultaPermitida({
      veredicto: { estado: "habilitado_para_multa" },
      multa: sinMonto,
      propuestaExistente: false,
    })
    expect(decision.permitida).toBe(false)
    if (decision.permitida) throw new Error("no debía permitirse sin monto")
    expect(decision.motivo).toBe(sinMonto.motivo)
    expect(decision.motivo).toContain("no se multa")
  })

  it("con una propuesta ya escrita en el ciclo, la segunda se rechaza y no se duplica", () => {
    const decision = propuestaDeMultaPermitida({
      veredicto: { estado: "habilitado_para_multa" },
      multa: multaDeclarada,
      propuestaExistente: true,
    })
    expect(decision.permitida).toBe(false)
    if (decision.permitida) throw new Error("no debía permitirse dos veces")
    expect(decision.motivo).toContain("Ya hay una propuesta")
    expect(decision.motivo).toContain("ciclo")

    // La propuesta existente manda sobre el resto: un ciclo cerrado tampoco se
    // vuelve a proponer por la puerta del estado, y el motivo sigue siendo el mismo.
    const cerrada = propuestaDeMultaPermitida({
      veredicto: { estado: "al_dia" },
      multa: sinMonto,
      propuestaExistente: true,
    })
    expect(cerrada).toMatchObject({ permitida: false })
    if (cerrada.permitida) throw new Error("no debía permitirse")
    expect(cerrada.motivo).toBe(decision.motivo)
  })
})
