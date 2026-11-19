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
 * traducirlo: un 409 o un 403 se muestran como los redactó la ruta. Y las dos,
 * cuando salen bien, traen el `enlace` completo que se revela UNA sola vez (L4):
 * el servidor no lo persiste en claro ni lo devuelve en ninguna lectura, así que
 * este resultado es la única copia que existe. Por eso no se cachea ni se
 * revalida: vive lo que la pantalla decida mostrarlo.
 *
 * El envío del correo de bienvenida (F43) NO se lee de esa respuesta: la
 * `invitacion` que el alta o el reenvío devuelven se proyecta ANTES de que el
 * correo salga, así que su `envio` todavía es `null`. El estado del envío vive en
 * el listado (`InvitacionPublica.envio`), que la pantalla relee después del acto;
 * pintar `enviado` porque el `POST` respondió 200 sería declarar un hecho que el
 * servidor no confirmó.
 *
 * Ninguna mutación revalida por su cuenta: la pantalla relee explícitamente
 * después de cada acto, porque el veredicto —y el estado nuevo— es del servidor.
 * Si la mutación revalidara acá, el acto y la relectura se pisarían y la pantalla
 * podría pintar una fila antes de saber si el acto ocurrió.
 */
import useSWR from "swr"
import type {
  EnvioInvitacionPublico,
  EstadoInvitacion,
} from "@/lib/invitacion-acceso"

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
  /**
   * Constancia del correo de bienvenida de ESTA invitación (F43), o `null` cuando
   * nadie intentó el envío: una invitación anterior a F43 o una recién emitida sin
   * constancia. `null` no es `pendiente` —`pendiente` es un intento con la cola sin
   * emisor— así que la pantalla no puede traducirlo a un estado de envío.
   */
  envio: EnvioInvitacionPublico | null
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

/**
 * Resultado de una mutación: el enlace revelado una sola vez (L4), o el error del
 * servidor literal. `enlace` es `null` sólo si la respuesta no lo trajo, que es
 * un caso que la ruta no produce: se contempla para no inventar un enlace.
 */
export type ResultadoAccion =
  | { ok: true; enlace: string | null }
  | { ok: false; error: string }

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

/**
 * POST JSON: el enlace revelado una sola vez (L4), o el error del servidor literal.
 * El cuerpo se lee después de comprobar el estado: un rechazo no trae enlace y se
 * queda con su texto de error, tal cual lo redactó la ruta.
 */
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
  const respuestaLeida = (await respuesta.json().catch(() => null)) as {
    enlace?: unknown
  } | null
  return {
    ok: true,
    enlace:
      typeof respuestaLeida?.enlace === "string" ? respuestaLeida.enlace : null,
  }
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
 * acto en el servidor (S1/S3). La respuesta revela el enlace de un solo uso (L4):
 * la administración no conoce la contraseña, pero sí tiene que poder entregar el
 * enlace —quien invita tiene que poder invitar—, y esa es la razón de que se
 * revele una vez y nunca más. El correo de bienvenida sale en el mismo acto
 * (F43); por eso la `invitacion` de esta respuesta se proyecta ANTES del envío y
 * su `envio` llega `null`: el estado real del aviso lo da el listado.
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
 * vence la anterior en el mismo acto y revela el enlace nuevo una sola vez (L4).
 */
export async function reenviarInvitacionDeAcceso(datos: {
  comunidadId: string
  usuarioId: string
}): Promise<ResultadoAccion> {
  return enviar(urlReenvio(datos.comunidadId), { usuarioId: datos.usuarioId })
}
