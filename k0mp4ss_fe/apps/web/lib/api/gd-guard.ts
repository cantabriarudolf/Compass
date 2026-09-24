/**
 * gd-guard — reglas de negocio GD/AD compartidas por las API routes (servidor).
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
 * Authz de actas GD: administrador full (matriz), directiva (comité) puede
 * ver/crear/editar, residente solo ver (refinado por residenteVeActas en ruta).
 * El comité no tiene entrada "gd" en la matriz RBAC, así que se declara aquí
 * explícitamente en lugar de tocar la matriz (paridad con tests authz).
 */
export function puedeGestionarActas(rol: string, accion: Accion): boolean {
  if (puede(rol, accion, "gd")) return true
  const n = rol.trim().toLowerCase()
  if (n === "comite" || n === "comité" || n === "directiva") {
    return accion === "ver" || accion === "crear" || accion === "editar"
  }
  return false
}

/**
 * Authz de controles AD: administrador y directiva gestionan; residente solo
 * lee los de su unidad (filtrado por unidad en ruta); resto denegado.
 */
export function puedeGestionarControles(rol: string, accion: Accion): boolean {
  if (puede(rol, accion, "ad")) return true // admin (wildcard); matriz sin "ad" hoy
  const n = rol.trim().toLowerCase()
  if (n === "comite" || n === "comité" || n === "directiva") return true
  if (n === "residente" || n === "propietario") return accion === "ver"
  return false
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
export async function personaIdDelUsuarioDb(
  usuarioId: string
): Promise<string | null> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { personaId: true },
  })
  return usuario?.personaId ?? null
}

/** Unidades con vínculo vigente del usuario (ABAC residente para AD). */
export async function unidadesVinculadasDb(
  personaId: string,
  comunidadId: string
): Promise<string[]> {
  const vinculos = await prisma.vinculoUnidad.findMany({
    where: { personaId, comunidadId, fechaFin: null },
    select: { unidadId: true },
  })
  return [...new Set(vinculos.map((v) => v.unidadId))]
}
