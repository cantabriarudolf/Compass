/**
 * @vitest-environment node
 *
 * Los BORDES de `lib/aviso-cobro` que el camino feliz no toca.
 *
 * `lib/aviso-cobro.ts` entró al `include` de cobertura en la unidad de higiene
 * de loaders: el camino normal (período, reserva, multa, deuda anterior, huella)
 * ya está probado en `test/api/avisos-cobro.test.ts`,
 * `test/lib/aviso-cobro-consolidado.test.ts` y `test/lib/aviso-cobro-hash.test.ts`.
 * Lo que faltaba medir son las salidas que existen para que el documento NO
 * mienta:
 *
 *   1. una versión del reglamento cuyos números no parsean se DECLARA no
 *      computable, no se imprime como 0 %;
 *   2. una línea de un concepto que no es gasto común ni multa no se pierde: va
 *      a `otros` con su nombre, y su fondo se resuelve (o se declara sin
 *      nombre), nunca se confunde con la reserva;
 *   3. la huella se niega a firmar un contenido que no puede representar (un
 *      número no finito, un tipo que no es dato);
 *   4. el código de verificación no entra en un bucle infinito: si no encuentra
 *      uno libre, falla en vez de repetir el mismo para siempre.
 */
import { describe, it, expect, vi } from "vitest"
import {
  contenidoAviso,
  hashContenido,
  nuevoCodigoVerificacion,
  type CobroDelAviso,
} from "@/lib/aviso-cobro"
import type { ResumenMensual } from "@/lib/resumen-mensual"

// El código se deriva de `randomUUID`: se fija para poder agotar la búsqueda.
// `createHash` sigue siendo el real (la huella no se simula).
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>()
  return { ...actual, randomUUID: () => "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }
})

const PERIODO = "2026-09"
const EMISION = "2026-09-05"

const UNIDAD = { id: "u-101", numero: "101", etiqueta: "Departamento", prorrateo: 0.6 }

const FONDOS = [
  { id: "f-gc", nombre: "Gasto común", tipo: "gasto_comun" },
  { id: "f-res", nombre: "Fondo de reserva", tipo: "reserva" },
]

const PARAMETROS = {
  porcentajeReserva: 10,
  diasPagoGc: 10,
  tasaMoraMensualPct: 1,
  topeMoraPct: 50,
  cuotasCorte: 3,
  diasPreavisoCorte: 5,
  ipcActivo: false,
  reservaIncluidaEnPresupuesto: false,
}

const RESUMEN: ResumenMensual = {
  periodo: PERIODO,
  desde: "2026-09-01",
  hasta: "2026-09-30",
  ingresos: { total: 0, deCobros: 0, manuales: 0, cantidad: 0, detalle: [] },
  egresos: { total: 0, cantidad: 0, detalle: [] },
  saldoCaja: { inicial: 0, ingresosAcumulados: 0, egresosAcumulados: 0, alCierre: 0 },
}

function cargo(lineas: CobroDelAviso["lineas"]): CobroDelAviso {
  return {
    id: "cobr-1",
    periodo: PERIODO,
    concepto: "gasto_comun",
    descripcion: `Gasto Común ${PERIODO}`,
    montoBase: 4_000,
    lineas,
    fondoId: "f-gc",
    fechaCargo: `${PERIODO}-01`,
    fechaVencimiento: null,
    moras: [],
    pagos: [],
  }
}

function contenido(opciones: {
  parametros: typeof PARAMETROS | null
  lineas: CobroDelAviso["lineas"]
}) {
  return contenidoAviso({
    periodo: PERIODO,
    fechaEmision: EMISION,
    unidad: UNIDAD,
    reglamento: {
      id: "reg-1",
      version: 3,
      vigenteDesde: "2026-01",
      fuenteInstrumento: "Reglamento Los Almendros",
      formaContribucion: "coeficiente",
      parametros: opciones.parametros,
    },
    fondos: FONDOS,
    cobros: [cargo(opciones.lineas)],
    cobrosAnteriores: [],
    resumen: RESUMEN,
  })
}

describe("contenidoAviso — lo que la ley pide y no se puede computar", () => {
  it("una versión con parámetros ilegibles se declara, no se imprime como 0 %", () => {
    const aviso = contenido({
      parametros: null,
      lineas: [{ concepto: "gasto_comun", monto: 4_000, fondoId: "f-gc" }],
    })
    expect(aviso.noComputables.map((n) => n.motivo)).toEqual(["parametros_invalidos"])
    expect(aviso.noComputables[0]!.campo).toBe("participacion.porcentajeReserva")
    expect(aviso.participacion.porcentajeReserva).toBeNull()
    // El resto del documento sigue siendo computable.
    expect(aviso.montos.gastoComun).toBe(4_000)
  })

  it("una línea de otro concepto va a `otros` con su nombre, y su fondo se resuelve", () => {
    const aviso = contenido({
      parametros: PARAMETROS,
      lineas: [
        { concepto: "gasto_comun", monto: 1_000, fondoId: "f-gc" },
        // Sin `fondoId`: la línea hereda el fondo del cargo.
        { concepto: "consumo", monto: 2_500 },
        // Con un fondo que la comunidad ya no tiene: el nombre se declara ausente.
        { concepto: "garantia_ra", monto: 500, fondoId: "f-fantasma" },
      ],
    })

    expect(aviso.montos.gastoComun).toBe(1_000)
    expect(aviso.montos.otros).toEqual([
      { concepto: "consumo", monto: 2_500 },
      { concepto: "garantia_ra", monto: 500 },
    ])
    // La plata no se pierde: el exigible suma todas las líneas.
    expect(aviso.montos.exigible).toBe(4_000)
    expect(aviso.detalle.map((l) => l.fondoId)).toEqual(["f-gc", "f-gc", "f-fantasma"])
    expect(aviso.detalle.map((l) => l.fondoNombre)).toEqual([
      "Gasto común",
      "Gasto común",
      null,
    ])
  })
})

describe("hashContenido — se niega a firmar lo que no puede representar", () => {
  it("un número no finito no tiene huella", () => {
    expect(() => hashContenido({ monto: Number.POSITIVE_INFINITY })).toThrow(TypeError)
    expect(() => hashContenido({ monto: Number.NaN })).toThrow(
      "El contenido del aviso no puede llevar un número no finito."
    )
  })

  it("un tipo que no es dato no se serializa en silencio", () => {
    expect(() => hashContenido({ valor: Symbol("no-es-dato") })).toThrow(
      "El contenido del aviso no puede llevar un valor de tipo symbol."
    )
  })
})

describe("nuevoCodigoVerificacion — bucle acotado", () => {
  it("si no encuentra un código libre, falla en vez de repetir el mismo", () => {
    // `randomUUID` está fijo: el único código posible ya está tomado.
    expect(() => nuevoCodigoVerificacion(new Set(["VC-AAAAAAAA"]))).toThrow(
      "No se pudo generar un código de verificación único."
    )
    // Con el código libre lo entrega, así que el fallo de arriba es la
    // exhaustión y no un mock que devuelve vacío.
    expect(nuevoCodigoVerificacion(new Set())).toBe("VC-AAAAAAAA")
  })
})
