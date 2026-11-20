/**
 * identidad-papel — la identidad que imprime un papel, resuelta en UN solo lugar.
 *
 * Por qué existe este módulo: cada ruta de papeles (aviso de cobro, liquidación,
 * certificado y requerimiento de corte) componía su propia identidad con
 * `comunidad?.nombre ?? scope.comunidadId` y leía el administrador de dos
 * columnas de texto libre de `ConfiguracionGlobal`. Cinco copias del mismo
 * `??` y dos fuentes del firmante: un papel podía salir con el id interno como
 * nombre —si la fila de `Comunidad` desaparecía— o firmado por alguien que ya no
 * administraba. Acá se resuelve una vez y las rutas sólo consumen el resultado.
 *
 * Las dos reglas, ambas de FALLO CERRADO:
 *
 *   1. **Sin nombre real no hay documento.** El nombre sale de `Comunidad.nombre`
 *      (fuente única, S1). Si la fila no existe o el nombre está en blanco, se
 *      responde 409 con un texto que dice qué falta; el id interno nunca se
 *      imprime como si fuera el nombre.
 *   2. **Sin firmante no hay papel.** El firmante se DERIVA de la membresía
 *      `administrador` vigente de la comunidad y de su persona del padrón
 *      (`Usuario.personaId` → `Persona.nombreCompleto`/`Persona.rut`). Las
 *      columnas `administradorResponsable` y `rutAdministrador` de CF quedaron
 *      deprecadas y no se leen: si cambia el administrador, cambia el papel.
 *      Sin una membresía `administrador` con persona en la comunidad, 409.
 *
 * El orden de las membresías es determinista (`createdAt asc, id asc`) y se
 * elige la PRIMERA que tiene persona del padrón: una cuenta con rol
 * administrador pero sin ficha no puede firmar —no hay nombre ni RUT que
 * imprimir— y no debe impedir que firme la que sí la tiene. Cuando ninguna
 * tiene ficha, el papel no se emite.
 *
 * ── Consecuencia de arranque (documentada, no un bug) ──────────────────────
 *
 * `scripts/crear-admin.mjs` crea la primera cuenta administradora SIN persona
 * (`personaId = null`): la invitación sólo crea la cuenta y el rol. En una
 * comunidad recién creada, entonces, TODOS los papeles responden 409 hasta que
 * esa persona exista en el padrón y esté vinculada a la cuenta. Es el
 * comportamiento buscado: no se firma un documento legal en nombre de alguien
 * que no está en el Registro de Copropietarios. El mensaje de la ruta dice qué
 * hacer (asignar el rol administrador a la persona que administra).
 *
 * ── La fila de configuración ───────────────────────────────────────────────
 *
 * `direccionOficial`, `rutComunidad` y `firmaDigitalizadaUrl` siguen viviendo en
 * CF y se leen de ahí: son datos de la comunidad, no del firmante. Si la
 * comunidad todavía no tiene fila de configuración, `institucional` es `null` y
 * el papel decide si puede salir con encabezado mínimo (hoy sólo el
 * requerimiento de corte lo contempla, S6). Los papeles que imprimen el
 * encabezado completo ya responden 409 antes de compilar.
 */
import { prisma } from "@/lib/prisma"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import type { IdentidadInstitucional } from "@/lib/pdf-utils"

/** La persona del padrón que firma: nombre y RUT de `Persona`. */
export interface FirmanteDelPadron {
  readonly nombreCompleto: string
  readonly rut: string
}

export interface IdentidadDelPapel {
  /** Nombre real de la comunidad (`Comunidad.nombre`), nunca un id. */
  readonly nombreComunidad: string
  /**
   * Bloque que imprimen los papeles. `null` cuando la comunidad todavía no tiene
   * fila de `ConfiguracionGlobal`: no hay RUT ni dirección que afirmar.
   */
  readonly institucional: IdentidadInstitucional | null
}

export type ResultadoIdentidadDelPapel =
  | { readonly ok: true; readonly identidad: IdentidadDelPapel }
  | { readonly ok: false; readonly response: Response }

/** Columnas legales de CF que sí son datos de la comunidad (no del firmante). */
const COLUMNAS_LEGALES = {
  direccionOficial: true,
  rutComunidad: true,
  firmaDigitalizadaUrl: true,
} as const

/** Nombre con contenido real: `""` y `"   "` no son un nombre. */
function nombreUtil(nombre: string | undefined): string | null {
  const limpio = (nombre ?? "").trim()
  return limpio === "" ? null : limpio
}

/**
 * El firmante vigente: la primera membresía `administrador` de la comunidad cuya
 * cuenta apunta a una persona del padrón de ESA comunidad.
 *
 * - `createdAt asc, id asc`: determinista, no depende del orden que devuelva la
 *   base. Si hay varias personas administradoras, firma la primera designada.
 * - `Persona.comunidadId === comunidadId`: `Usuario.personaId` no tiene FK
 *   estricta; una ficha de otra comunidad no puede firmar ésta.
 * - Nombre y RUT en blanco no son un firmante: se siguen buscando las demás.
 */
export async function firmanteDeLaComunidad(
  comunidadId: string
): Promise<FirmanteDelPadron | null> {
  const membresias = await prisma.membresia.findMany({
    where: { comunidadId, rol: "administrador" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { usuario: { select: { personaId: true } } },
  })
  const personaIds = [
    ...new Set(
      membresias
        .map((membresia) => membresia.usuario.personaId)
        .filter((id): id is string => typeof id === "string" && id !== "")
    ),
  ]
  if (personaIds.length === 0) return null

  const personas = await prisma.persona.findMany({
    where: { comunidadId, id: { in: personaIds } },
    select: { id: true, nombreCompleto: true, rut: true },
  })
  const porId = new Map(personas.map((persona) => [persona.id, persona]))

  for (const membresia of membresias) {
    const personaId = membresia.usuario.personaId
    if (!personaId) continue
    const persona = porId.get(personaId)
    if (!persona) continue
    if (nombreUtil(persona.nombreCompleto) === null) continue
    if (nombreUtil(persona.rut) === null) continue
    return { nombreCompleto: persona.nombreCompleto.trim(), rut: persona.rut.trim() }
  }
  return null
}

/**
 * Resuelve la identidad de un papel de la comunidad.
 *
 * Falla cerrado (`ok: false` + respuesta 409) si no hay nombre real o si no hay
 * firmante. Los textos van LITERALES en cada `jsonError` —el guardián de
 * mensajes de error no audita constantes con nombre— y son exactamente los que
 * exporta `lib/pdf-utils`; `test/papeles-identidad.test.ts` compara las dos
 * copias para que no puedan separarse.
 */
export async function identidadDelPapel(
  comunidadId: string
): Promise<ResultadoIdentidadDelPapel> {
  const [comunidad, configuracion, firmante] = await Promise.all([
    prisma.comunidad.findUnique({
      where: { id: comunidadId },
      select: { nombre: true },
    }),
    prisma.configuracionGlobal.findUnique({
      where: { comunidadId },
      select: COLUMNAS_LEGALES,
    }),
    firmanteDeLaComunidad(comunidadId),
  ])

  const nombreComunidad = nombreUtil(comunidad?.nombre)
  if (nombreComunidad === null) {
    return {
      ok: false,
      response: jsonError(
        409,
        "El papel no se puede emitir: la comunidad no tiene nombre registrado. Cargá el nombre real de la comunidad y volvé a intentar."
      ),
    }
  }

  if (!firmante) {
    return {
      ok: false,
      response: jsonError(
        409,
        "El papel no se puede emitir: la comunidad no tiene administrador designado con ficha en el padrón. Asigná el rol administrador a la persona que administra, con su nombre y RUT, y volvé a intentar."
      ),
    }
  }

  return {
    ok: true,
    identidad: {
      nombreComunidad,
      institucional: configuracion
        ? {
            nombreComunidad,
            direccionOficial: configuracion.direccionOficial,
            rutComunidad: configuracion.rutComunidad,
            firmaDigitalizadaUrl: configuracion.firmaDigitalizadaUrl,
            administradorResponsable: firmante.nombreCompleto,
            rutAdministrador: firmante.rut,
          }
        : null,
    },
  }
}
