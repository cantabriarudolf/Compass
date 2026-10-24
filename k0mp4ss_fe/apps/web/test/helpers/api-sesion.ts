/**
 * api-sesion — helpers para tests de API routes con BD real y sesión Auth.js.
 *
 * Los tests de `test/api/**` mientan la cookie de sesión con `sesion-authjs` y
 * mockean `next/headers` en el propio archivo (el mock de `auth()` se resuelve
 * por cookie de `headers()`); estos helpers solo evitan repetir la construcción
 * del `NextRequest` y el despacho del handler con su `params`.
 */
import { AsyncLocalStorage } from "node:async_hooks"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { cookieSesionAuthjs } from "./sesion-authjs"

/**
 * Cookie de sesión por invocación. Permite que dos peticiones concurrentes corran
 * con identidades distintas (`conSesionConcurrente`) sin pisarse el estado global
 * del mock de `next/headers`.
 */
export const cookiePorPeticion = new AsyncLocalStorage<string>()

/** Cookie efectiva del pedido en curso: la de la invocación o la de la sesión activa. */
export function cookieActiva(estado: { cookie: string }): string {
  return cookiePorPeticion.getStore() ?? estado.cookie
}

/** Cookie de sesión mintada para el usuario con ese email (debe existir en BD). */
export async function cookieDeUsuario(email: string): Promise<string> {
  const usuario = await prisma.usuario.findUnique({ where: { email } })
  if (!usuario) throw new Error(`usuario no encontrado: ${email}`)
  return cookieSesionAuthjs({ sub: usuario.id, email: usuario.email })
}

/**
 * Corre `fn` con la cookie del usuario en el contexto de esa invocación (ALS), de
 * modo que dos llamadas concurrentes pueden usar usuarios distintos.
 */
export async function conSesionConcurrente<T>(email: string, fn: () => Promise<T>): Promise<T> {
  const cookie = await cookieDeUsuario(email)
  return cookiePorPeticion.run(cookie, fn)
}

/** `NextRequest` para una ruta interna (`ruta` sin `/api/`, admite query). */
export function peticionApi(
  ruta: string,
  metodo: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: unknown
): NextRequest {
  return new NextRequest(`http://localhost/api/${ruta}`, {
    method: metodo,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  })
}

type HandlerApi = (
  req: NextRequest,
  ctx?: { params: Promise<Record<string, string>> }
) => Promise<Response>

export interface OpcionesInvocacion {
  /** Parámetros de ruta dinámica (`[id]`), como los pasa Next 16. */
  params?: Record<string, string>
  body?: unknown
}

/**
 * Despacha el handler `metodo` del módulo de route. Con `params` se usa la firma
 * de las rutas `[id]` (el segundo argumento de Next 16).
 */
export async function invocarApi(
  modulo: Promise<unknown>,
  metodo: "GET" | "POST" | "PUT" | "DELETE",
  ruta: string,
  opciones: OpcionesInvocacion = {}
): Promise<Response> {
  const m = (await modulo) as unknown as Record<string, HandlerApi | undefined>
  const fn = m[metodo]
  if (!fn) throw new Error(`handler no encontrado: ${metodo} ${ruta}`)
  const req = peticionApi(ruta, metodo, opciones.body)
  if (opciones.params) return fn(req, { params: Promise.resolve(opciones.params) })
  return fn(req)
}

/** Cuerpo JSON tipado (los handlers siempre responden JSON en estos tests). */
export async function cuerpoJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}
