"use client"

/**
 * use-admin-usuarios — hooks de las cuentas de acceso (F42 · T2).
 *
 * Lectura: el listado de cuentas de la comunidad con el estado de su invitación.
 * El estado (`pendiente` / `vencida` / `usada`) lo DERIVA el servidor
 * (`lib/invitacion-acceso.ts`); acá sólo viaja su forma pública, sin token ni
 * hash. La comunidad se resuelve como lo hace el resto de la app: la membresía
 * más reciente de la sesión (`withComunidadScope`), que es la última de la lista
 * que devuelve `GET /api/admin/usuarios` sin `comunidadId`.
 *
 * Escritura: el alta (persona del padrón + rol) y el reenvío de la invitación.
 * Las dos DEVUELVEN el texto de error del servidor tal cual (`error`), sin
 * traducirlo: un 409 o un 403 se muestran como los redactó la ruta.
 *
 * Ninguna mutación revalida por su cuenta: la pantalla relee explícitamente
 * después de cada acto, porque el veredicto —y el estado nuevo— es del servidor.
 * Si la mutación revalidara acá, el acto y la relectura se pisarían y la pantalla
 * podría pintar una fila antes de saber si el acto ocurrió.
 */
import useSWR from "swr"
import type { EstadoInvitacion } from "@/lib/invitacion-acceso"

const BASE = "/api/admin/usuarios"
const REENVIO = `${BASE}/invitacion`

/** Comunidad propia, tal como la devuelve el `GET` sin `comunidadId`. */
export interface ComunidadPropia {
  id: string
  nombre: string
  rol: string
}

/** Forma pública de una invitación: sin token, sin hash, sin `usuarioId`. */
export interface InvitacionPublica {
  id: string
  estado: EstadoInvitacion
  expiraEn: string
  usadoEn: string | null
  creadoEn: string
}

/** Una fila del listado: la membresía y la cuenta que la ejerce. */
export interface CuentaDeComunidad {
  membresiaId: string
  rol: string
  comunidadId: string
  usuario: {
    id: string
    email: string
    personaId: string | null
    activo: boolean
  }
  invitacion: InvitacionPublica | null
}

/** Resultado de una mutación: éxito sin cuerpo, o el error del servidor literal. */
export type ResultadoAccion = { ok: true } | { ok: false; error: string }

interface RespuestaComunidades {
  comunidades?: ComunidadPropia[]
}

interface RespuestaListado {
  comunidadNombre?: string
  membresias?: CuentaDeComunidad[]
}

/** URL del listado de una comunidad (la misma que usa el `POST` del alta). */
export function urlCuentas(comunidadId: string): string {
  return `${BASE}?comunidadId=${encodeURIComponent(comunidadId)}`
}

/** URL del reenvío de la invitación de una comunidad. */
export function urlReenvio(comunidadId: string): string {
  return `${REENVIO}?comunidadId=${encodeURIComponent(comunidadId)}`
}

/**
 * El texto del error lo redacta el servidor: se devuelve tal cual para que la
 * pantalla lo muestre sin reinterpretarlo (409/403 con su texto exacto).
 */
async function mensajeDeError(respuesta: Response): Promise<string> {
  const cuerpo = (await respuesta.json().catch(() => null)) as {
    error?: unknown
  } | null
  return typeof cuerpo?.error === "string"
    ? cuerpo.error
    : `El servidor respondió ${respuesta.status} sin un mensaje de error.`
}

async function fetcher<T>(url: string): Promise<T> {
  const respuesta = await fetch(url, { headers: { accept: "application/json" } })
  if (!respuesta.ok) throw new Error(await mensajeDeError(respuesta))
  return (await respuesta.json()) as T
}

/** POST JSON: éxito sin cuerpo, o el error del servidor literal. */
async function enviar(url: string, cuerpo: unknown): Promise<ResultadoAccion> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    })
  } catch {
    return {
      ok: false,
      error:
        "No se pudo contactar al servidor. Revisá la conexión e intentá de nuevo.",
    }
  }
  if (!respuesta.ok) {
    return { ok: false, error: await mensajeDeError(respuesta) }
  }
  return { ok: true }
}

export interface ComunidadesPropiasHook {
  comunidades: ComunidadPropia[]
  isLoading: boolean
  error: string | null
}

/**
 * Comunidades donde la sesión tiene membresía. La pantalla administra la última
 * —la más reciente—, que es la misma que `withComunidadScope` resuelve para el
 * resto de la API: el listado y el padrón no pueden hablar de comunidades distintas.
 */
export function useComunidadesPropias(): ComunidadesPropiasHook {
  const { data, error, isLoading } = useSWR<RespuestaComunidades, Error>(
    BASE,
    fetcher,
    { revalidateOnFocus: false }
  )
  return {
    comunidades: data?.comunidades ?? [],
    isLoading,
    error: error?.message ?? null,
  }
}

export interface CuentasDeComunidadHook {
  cuentas: CuentaDeComunidad[]
  comunidadNombre: string
  isLoading: boolean
  error: string | null
  /** Vuelve a leer el listado; lo llama la pantalla después de cada acto. */
  refrescar: () => Promise<unknown>
}

/** Cuentas de una comunidad con el estado de su última invitación. */
export function useCuentasDeComunidad(
  comunidadId: string | null
): CuentasDeComunidadHook {
  const clave = comunidadId ? urlCuentas(comunidadId) : null
  const { data, error, isLoading, mutate } = useSWR<RespuestaListado, Error>(
    clave,
    fetcher,
    { revalidateOnFocus: false }
  )
  return {
    cuentas: data?.membresias ?? [],
    comunidadNombre: data?.comunidadNombre ?? "",
    isLoading,
    error: error?.message ?? null,
    refrescar: () => mutate(),
  }
}

/**
 * Alta de una cuenta: persona del padrón + rol de acceso + invitación, en un solo
 * acto en el servidor (S1/S3). No devuelve el token: el administrador invita, no
 * conoce el enlace ni la contraseña (S4).
 */
export async function crearCuentaDeAcceso(datos: {
  comunidadId: string
  personaId: string
  rol: string
}): Promise<ResultadoAccion> {
  return enviar(urlCuentas(datos.comunidadId), {
    personaId: datos.personaId,
    rol: datos.rol,
  })
}

/**
 * Reenvío: emite una invitación nueva para una cuenta existente. El servidor
 * vence la anterior en el mismo acto; la respuesta sólo trae la forma pública.
 */
export async function reenviarInvitacionDeAcceso(datos: {
  comunidadId: string
  usuarioId: string
}): Promise<ResultadoAccion> {
  return enviar(urlReenvio(datos.comunidadId), { usuarioId: datos.usuarioId })
}
