/**
 * Rutas que el proxy deja pasar SIN sesión de Auth.js.
 *
 * Vive en su propio módulo y no dentro de `proxy.ts` por una razón concreta: el
 * proxy importa `next-auth` en el runtime edge, y cualquier test que quiera
 * fijar esta lista arrastraría esa cadena. Acá la lista se puede probar sola.
 *
 * Regla para agregar una entrada: la ruta tiene que **autenticarse por su
 * cuenta**. Las dos de cron lo hacen con `Authorization: Bearer <CRON_SECRET>`
 * dentro del handler; si se agrega una ruta que no valida nada por sí misma,
 * queda abierta al público.
 */
export const RUTAS_PUBLICAS = [
  "/ingresar",
  "/invitacion",
  "/api/auth",
  "/api/health",
  "/api/csp-report",
  // Crons de Vercel: `GET` sin sesión, autenticados por `CRON_SECRET` dentro de
  // la ruta (401 si falta o no coincide). Sin estas dos entradas el proxy
  // responde «No autenticado.» y el cron NUNCA corre: Vercel manda el bearer,
  // no una cookie de sesión. Pasó desapercibido porque los tests importan el
  // handler de la ruta y saltean el proxy.
  "/api/vigencia-registro/avisos",
  "/api/co/cola",
] as const

/** `true` si el proxy debe dejar pasar `pathname` sin sesión. */
export function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`)
  )
}
