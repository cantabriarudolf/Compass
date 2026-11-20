// @vitest-environment jsdom
/**
 * R3 · un solo vocabulario para el estado de cuenta de la persona.
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` (hallazgo 3) encontró cinco
 * copias independientes de `activa · inactiva · bloqueada`: el `z.enum` inline de
 * `PersonaSchema`, un array propio en `app/api/personas/route.ts`, el mapa de
 * etiquetas de `app/comunidad/personas/page.tsx`, la unión inline de la semilla
 * (`data/comunidad/personas.ts`) y un comentario en `prisma/schema.prisma` — que
 * es el único "enum" que existe, porque el schema no declara ninguno: la columna
 * es `String` y la base acepta cualquier palabra.
 *
 * La pantalla ya pagó este defecto: usaba los plurales `activos|inactivos|bloqueados`
 * contra el dato `activa|inactiva|bloqueada`, así que «el filtro y sus contadores
 * nunca coincidían con nadie» (está escrito en `personas/page.tsx`). Con cinco
 * copias, renombrar un valor en una deja la pestaña en 0 y el total de la lista sin
 * cuadrar, y nada rompe la compilación.
 *
 * Este archivo hace esa divergencia imposible por construcción:
 *
 *   1. Hay UN catálogo (`ESTADOS_CUENTA_PERSONA`) con su schema y su tipo.
 *   2. El schema de la persona no declara el suyo: es la MISMA referencia (`toBe`).
 *   3. La ruta valida con el predicado del catálogo (`esEstadoCuentaPersona`), así
 *      que el plural histórico sigue devolviendo 400 y no puede volver por una
 *      lista local (el 400 textual lo pina `test/componentes/personas-filtros-servidor.test.ts`,
 *      que necesita base; acá se fija la decisión, que no la necesita).
 *   4. La semilla declara el tipo del catálogo: un valor fuera de él no compila.
 *   5. Las etiquetas son un `Record` del tipo completo: un estado nuevo rompe la
 *      compilación en vez de pintarse crudo, y ninguna etiqueta es el valor de la
 *      columna ni el plural que rompió la pantalla.
 */

import { describe, expect, it } from "vitest"
import {
  ESTADOS_CUENTA_PERSONA,
  EstadoCuentaPersonaSchema,
  PersonaSchema,
  esEstadoCuentaPersona,
} from "@/lib/schemas"
import { ETIQUETA_ESTADO_CUENTA } from "@/lib/api/use-personas"
import { personas } from "@/data/comunidad/personas"

/** Los tres estados que la columna persiste hoy, escritos a mano y en singular. */
const CATALOGO_ESCRITO_HOY = ["activa", "inactiva", "bloqueada"] as const

/** Los plurales que la pantalla usaba contra el dato: nunca vuelven a ser un filtro. */
const PLURALES_HISTORICOS = ["activos", "inactivos", "bloqueados"] as const

describe("R3 — un catálogo, y en singular", () => {
  it("son exactamente los tres estados que persiste `Persona.estadoCuenta`", () => {
    expect([...ESTADOS_CUENTA_PERSONA]).toEqual([...CATALOGO_ESCRITO_HOY])
  })

  it("el schema de la persona no declara su propio enum: es la misma referencia", () => {
    // `toBe` y no `toEqual`: una copia con los mismos valores vuelve a divergir en
    // silencio en cuanto alguien edite una de las dos listas (mismo patrón que
    // `test/lib/catalogo-entrega-correo.test.ts`).
    expect(PersonaSchema.shape.estadoCuenta).toBe(EstadoCuentaPersonaSchema)
  })
})

describe("R3 — el validador rechaza los plurales históricos", () => {
  it("acepta los tres estados del catálogo", () => {
    for (const estado of CATALOGO_ESCRITO_HOY) {
      expect(EstadoCuentaPersonaSchema.safeParse(estado).success).toBe(true)
    }
  })

  it("rechaza los plurales con los que la pantalla filtraba", () => {
    for (const plural of PLURALES_HISTORICOS) {
      expect(EstadoCuentaPersonaSchema.safeParse(plural).success).toBe(false)
      expect(esEstadoCuentaPersona(plural)).toBe(false)
    }
  })

  it("rechaza cualquier otra palabra, aunque cambie la caja o venga vacía", () => {
    for (const fuera of ["ACTIVA", "Activa", "activo", "suspendida", "", " "]) {
      expect(EstadoCuentaPersonaSchema.safeParse(fuera).success).toBe(false)
      expect(esEstadoCuentaPersona(fuera)).toBe(false)
    }
  })

  it("la ruta valida con el mismo predicado, no con una lista propia", () => {
    // `?estadoCuenta=activos` es el valor que la pantalla mandaba contra `activa` y nunca
    // coincidía con nadie: con el predicado del catálogo sigue siendo un 400.
    for (const estado of CATALOGO_ESCRITO_HOY) expect(esEstadoCuentaPersona(estado)).toBe(true)
    expect(esEstadoCuentaPersona("activos")).toBe(false)
  })
})

/** Persona mínima válida (el RUT es uno real, el del resto de la suite). */
const PERSONA_VALIDA = {
  id: "r3-p-1",
  rut: "15.123.456-9",
  nombreCompleto: "Ana Rojas Soto",
  nombres: "Ana",
  apellidos: "Rojas Soto",
  email: "ana.r3@test.cl",
  telefonoMovil: "+56911111111",
  estadoCuenta: "activa",
  condicionesEspecialesIds: [],
  roles: ["residente"],
}

describe("R3 — la persona guardada no puede traer un estado fuera del catálogo", () => {
  it("acepta la persona con cada estado del catálogo", () => {
    for (const estado of CATALOGO_ESCRITO_HOY) {
      const resultado = PersonaSchema.safeParse({ ...PERSONA_VALIDA, estadoCuenta: estado })
      expect(resultado.success, JSON.stringify(resultado.success ? {} : resultado.error.issues)).toBe(
        true
      )
    }
  })

  it("rechaza la persona con el plural histórico, en el campo del estado", () => {
    const resultado = PersonaSchema.safeParse({ ...PERSONA_VALIDA, estadoCuenta: "activos" })

    expect(resultado.success).toBe(false)
    if (resultado.success) return
    expect(resultado.error.issues.map((issue) => issue.path.join("."))).toEqual(["estadoCuenta"])
  })
})

describe("R3 — la semilla no declara su propia unión", () => {
  it("cada fila del padrón trae un estado del catálogo", () => {
    expect(personas.length).toBeGreaterThan(0)
    for (const persona of personas) {
      expect(ESTADOS_CUENTA_PERSONA).toContain(persona.estadoCuenta)
    }
  })

  it("la semilla usa los tres estados: el padrón no es todo `activa`", () => {
    const distintos = [...new Set(personas.map((persona) => persona.estadoCuenta))].sort()
    expect(distintos).toEqual([...CATALOGO_ESCRITO_HOY].sort())
  })
})

describe("R3 — la pantalla pinta etiquetas, no los valores de la columna", () => {
  it("el mapa de etiquetas cubre exactamente los tres estados", () => {
    expect(Object.keys(ETIQUETA_ESTADO_CUENTA).sort()).toEqual([...CATALOGO_ESCRITO_HOY].sort())
  })

  it("ninguna etiqueta es el valor crudo ni el plural histórico", () => {
    for (const estado of CATALOGO_ESCRITO_HOY) {
      const etiqueta = ETIQUETA_ESTADO_CUENTA[estado].toLowerCase()

      expect(etiqueta.trim().length).toBeGreaterThan(0)
      expect(etiqueta).not.toBe(estado)
      for (const plural of PLURALES_HISTORICOS) {
        expect(etiqueta).not.toBe(plural)
      }
    }
  })
})
