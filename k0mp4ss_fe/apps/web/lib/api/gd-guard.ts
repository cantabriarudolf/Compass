/**
 * gd-guard — reglas de negocio GD/AD compartidas por las API routes (servidor).
 *
 * La autorización de actas (`gd`) y controles de propiedad (`ad`) vive en la
 * MATRIZ de `lib/authz.ts` (H5: sin bypass). Estas funciones son solo lectores
 * de `puede()`; los refinamientos ABAC (residenteVeActas, unidad vinculada)
 * siguen aplicándose en cada ruta.
 *
 * Espejo intencional de `lib/store.ts` (esMiembroDirectivaVigente,
 * periodoDirectivaVigente, saveActaGD, aprobarActaGD, savePeriodoDirectiva,
 * saveControlPropiedad), reimplementado contra Prisma en lugar de zustand.
 * NO importa el store cliente: el store es "use client" + persist y no debe
 * entrar al bundle del servidor. Si cambia la semántica del store, cambiar aquí.
 */
import { prisma } from "@/lib/prisma"
import { puede } from "@/lib/authz"
import type { Accion } from "@/lib/authz"

export const CARGOS_DIRECTIVA = [
  "presidente",
  "tesorero",
  "secretario",
  "director",
] as const

/** Ficha mínima de gobernanza para evaluar membresía (Json de Prisma). */
export interface FichaGobernanzaMin {
  periodoId?: string
  fechaTermino?: string
}

/** Persona mínima para evaluar membresía de directiva vigente. */
export interface PersonaMembresiaMin {
  estadoCuenta: string
  datosGobernanza: FichaGobernanzaMin | null | undefined
}

/**
 * Espejo de `esMiembroDirectivaVigente` (lib/store.ts): ficha con período
 * vigente y sin término; legado sin periodoId solo cuenta si no hay vigente.
 */
export function esMiembroVigente(
  persona: PersonaMembresiaMin,
  vigenteId: string | undefined
): boolean {
  const ficha = persona.datosGobernanza
  if (!ficha || persona.estadoCuenta !== "activa" || ficha.fechaTermino)
    return false
  if (!ficha.periodoId) return vigenteId === undefined
  return ficha.periodoId === vigenteId
}

/** Período "vigente" de la comunidad (el libro en curso), si existe. */
export async function periodoVigenteDb(comunidadId: string): Promise<{
  id: string
  estado: string
} | null> {
  return prisma.periodoDirectiva.findFirst({
    where: { comunidadId, estado: "vigente" },
    select: { id: true, estado: true },
  })
}

/**
 * Ids de la directiva vigente (quórum): personas activas con ficha del
 * período vigente (o legado sin período si aún no hay vigente).
 */
export async function idsDirectivaVigenteDb(
  comunidadId: string,
  vigenteId: string | undefined
): Promise<string[]> {
  const personas = await prisma.persona.findMany({
    where: { comunidadId, estadoCuenta: "activa" },
    select: { id: true, estadoCuenta: true, datosGobernanza: true },
  })
  return personas
    .filter((p) =>
      esMiembroVigente(
        {
          estadoCuenta: p.estadoCuenta,
          // SAFETY: datosGobernanza es Json validado por ExtensionGobernanzaSchema al escribir (API personas); aquí se lee solo periodoId/fechaTermino.
          datosGobernanza:
            (p.datosGobernanza as unknown as FichaGobernanzaMin | null) ?? null,
        },
        vigenteId
      )
    )
    .map((p) => p.id)
}

/**
 * Authz de actas GD: delega en la MATRIZ (recurso `gd` de lib/authz.ts).
 * Los refinamientos ABAC (residenteVeActas) aplican en la ruta.
 */
export function puedeGestionarActas(rol: string, accion: Accion): boolean {
  return puede(rol, accion, "gd")
}

/**
 * Authz de controles AD: delega en la MATRIZ (recurso `ad` de lib/authz.ts).
 * El filtrado por unidad del residente aplica en la ruta.
 */
export function puedeGestionarControles(rol: string, accion: Accion): boolean {
  return puede(rol, accion, "ad")
}

/** ¿Algún control de la comunidad autoriza a residentes a ver actas? */
export async function residentesVenActas(comunidadId: string): Promise<boolean> {
  const control = await prisma.controlPropiedad.findFirst({
    where: { comunidadId, residenteVeActas: true },
    select: { id: true },
  })
  return control !== null
}

/** personaId (MP) del usuario de sesión, o null. */
// Identidad y vínculos del usuario de sesión: implementados en `sesion-persona`
// porque los comparten notificaciones, apelaciones IN, certificados y controles.
// Se reexportan acá para no tocar a los llamadores históricos de gd-guard.
export { personaIdDelUsuarioDb, unidadesVinculadasDb } from "./sesion-persona"
