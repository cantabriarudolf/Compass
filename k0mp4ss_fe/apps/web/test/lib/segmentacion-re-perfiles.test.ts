/** @vitest-environment node */
/**
 * R5 · la segmentación de reportes tiene UN vocabulario y no puede emitir a cero
 * destinatarios en silencio.
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` (hallazgo 5) encontró el
 * mismo vocabulario de perfiles y tenencias en cuatro lugares sin relación: las
 * tuplas de `lib/reporteria-utils.ts` (que nadie importaba: sólo alimentaban un
 * tipo), el `z.enum` inline del contrato persistido (`ReporteRESchema`), el
 * `z.enum` inline de la entrada de `POST /api/reportes-re/generar` y el array de
 * los botones de `app/admin/reporteria/page.tsx`. El riesgo concreto: un perfil
 * aceptado por la ruta y ofrecido por los botones no tenía rama en
 * `resolverSegmentacionRE` —los tres `if` son `personal`, `administracion` y
 * `propietario/residente`—, así que el reporte se emitía a 0 destinatarios,
 * `distribuidoA` quedaba en 0 sin error y el selector decía que se había enviado.
 *
 * Este archivo pina:
 *
 *   1. Una sola tupla (`PERFILES_SEGMENTACION_RE` / `TENENCIAS_SEGMENTACION_RE`)
 *      y el contrato de segmentación (`SegmentoReporteRESchema`) que usan el
 *      payload persistido y la entrada de la ruta.
 *   2. Cada perfil del catálogo resuelve a quien le corresponde (preservación).
 *   3. Un perfil o una tenencia fuera del catálogo LANZAN: nunca 0 destinatarios
 *      en silencio. En la entrada de la API eso es un 400 del `z.enum`; acá queda
 *      cubierta la última orilla (una fila vieja o un cast).
 */

import { describe, expect, it } from "vitest"
import {
  ETIQUETA_PERFIL_SEGMENTACION_RE,
  ETIQUETA_TENENCIA_SEGMENTACION_RE,
  PERFILES_SEGMENTACION_RE,
  SegmentoReporteRESchema,
  TENENCIAS_SEGMENTACION_RE,
  type PerfilSegmentacionRE,
} from "@/lib/schemas"
import { resolverSegmentacionRE } from "@/lib/reporteria-utils"
import type { Persona } from "@/data/comunidad/personas"
import type { VinculoUnidad } from "@/lib/schemas"

/** Los cuatro perfiles y las dos tenencias que el motor resuelve hoy, a mano. */
const PERFILES_ESCRITOS_HOY = ["administracion", "personal", "propietario", "residente"] as const
const TENENCIAS_ESCRITAS_HOY = ["propietarios", "arrendatarios"] as const

/**
 * Persona mínima: el resolver sólo mira `estadoCuenta`, `roles` y `datosGobernanza`.
 * El cast evita arrastrar los veinte campos del padrón a un fixture.
 */
const persona = (id: string, extra: Partial<Persona> = {}): Persona =>
  ({ id, estadoCuenta: "activa", roles: [], ...extra }) as unknown as Persona

const vinculo = (
  personaId: string,
  rol: "propietario" | "arrendatario",
  extra: Partial<VinculoUnidad> = {}
): VinculoUnidad =>
  ({ unidadId: "uni-1", personaId, rol, ...extra }) as unknown as VinculoUnidad

const PERSONAS = [
  persona("p-personal", { roles: ["personal"] }),
  persona("p-directiva", { roles: ["directiva"] }),
  persona("p-gobernanza", {
    datosGobernanza: { id: "go-1", cargoDirectiva: "presidente", fechaAsuncion: "2026-01-01" },
  }),
  persona("p-propietario"),
  persona("p-arrendatario"),
  persona("p-inactiva", { estadoCuenta: "inactiva", roles: ["personal"] }),
]
const VINCULOS = [
  vinculo("p-propietario", "propietario"),
  vinculo("p-arrendatario", "arrendatario"),
  vinculo("p-inactiva", "propietario"),
]

const resolver = (perfiles: PerfilSegmentacionRE[], tenencias: string[] = []) =>
  resolverSegmentacionRE({
    segmento: { perfiles, tenencias: tenencias as never },
    unidadesAlcanceIds: [],
    vinculos: VINCULOS,
    personas: PERSONAS,
  }).sort()

describe("R5 — un solo vocabulario de segmentación", () => {
  it("el catálogo de perfiles y tenencias es exactamente el de hoy", () => {
    expect([...PERFILES_SEGMENTACION_RE]).toEqual([...PERFILES_ESCRITOS_HOY])
    expect([...TENENCIAS_SEGMENTACION_RE]).toEqual([...TENENCIAS_ESCRITAS_HOY])
  })

  it("el contrato de segmentación acepta el catálogo y rechaza cualquier otra palabra", () => {
    // La entrada de la API es el mismo contrato con todo opcional (`partial()`):
    // si aceptara otra palabra, el motor recibiría un perfil sin rama.
    const entrada = SegmentoReporteRESchema.partial()
    for (const perfil of PERFILES_ESCRITOS_HOY) {
      expect(entrada.safeParse({ perfiles: [perfil] }).success).toBe(true)
    }
    for (const tenencia of TENENCIAS_ESCRITAS_HOY) {
      expect(entrada.safeParse({ tenencias: [tenencia] }).success).toBe(true)
    }
    expect(entrada.safeParse({ perfiles: ["vecinos"] }).success).toBe(false)
    expect(entrada.safeParse({ tenencias: ["herederos"] }).success).toBe(false)
  })

  it("cada perfil y cada tenencia tienen etiqueta humana, y ninguna repite el valor crudo", () => {
    for (const perfil of PERFILES_ESCRITOS_HOY) {
      const etiqueta = ETIQUETA_PERFIL_SEGMENTACION_RE[perfil]
      expect(etiqueta).toBeTruthy()
      expect(etiqueta).not.toBe(perfil)
    }
    for (const tenencia of TENENCIAS_ESCRITAS_HOY) {
      const etiqueta = ETIQUETA_TENENCIA_SEGMENTACION_RE[tenencia]
      expect(etiqueta).toBeTruthy()
      expect(etiqueta).not.toBe(tenencia)
    }
  })
})

describe("R5 — cada perfil del catálogo resuelve a quien le corresponde", () => {
  it("personal y administracion salen de los roles; propietario y residente del vínculo", () => {
    expect(resolver(["personal"])).toEqual(["p-personal"])
    expect(resolver(["administracion"])).toEqual(["p-directiva", "p-gobernanza"])
    expect(resolver(["propietario"])).toEqual(["p-propietario"])
    // `residente` es cualquier vínculo vigente: propietarios y arrendatarios.
    expect(resolver(["residente"])).toEqual(["p-arrendatario", "p-propietario"])
  })

  it("la cuenta inactiva nunca recibe el reporte", () => {
    for (const perfil of PERFILES_ESCRITOS_HOY) {
      expect(resolver([perfil])).not.toContain("p-inactiva")
    }
  })

  it("las tenencias filtran el vínculo por rol", () => {
    expect(resolver(["residente"], ["propietarios"])).toEqual(["p-propietario"])
    expect(resolver(["residente"], ["arrendatarios"])).toEqual(["p-arrendatario"])
  })
})

describe("R5 — nada de cero destinatarios en silencio", () => {
  it("un perfil fuera del catálogo lanza en vez de emitir a nadie", () => {
    // El caso del informe: la ruta y los botones ofrecían el perfil, el motor no
    // tenía rama y el reporte salía a 0 sin error.
    expect(() => resolver(["vecinos" as PerfilSegmentacionRE])).toThrow(/vecinos/)
  })

  it("una tenencia fuera del catálogo lanza en vez de emitir a nadie", () => {
    expect(() => resolver(["residente"], ["herederos"])).toThrow(/herederos/)
  })
})
