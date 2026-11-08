import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { tienePermiso } from "@/lib/authz"
import { RECURSO_AVISO_PROPIO } from "@/app/api/avisos-cobro/_alcance"
import { EstadoCuentaResidente } from "./_componentes/estado-cuenta-residente"

/**
 * /comunidad/mi-estado-cuenta — la deuda propia del residente.
 *
 * Decisión del owner (2026-11-08): el residente ve su deuda SIEMPRE y SOLO la
 * suya; la bandera `residenteVeMorosidad` no gobierna esta pantalla (queda como
 * columna `@deprecated`). Lo que decide quién entra es la matriz de permisos,
 * con la misma clave que la API: `fi:aviso:propio` ver, la que ya existe para
 * los datos financieros propios del residente. El administrador entra por su
 * comodín; el comité y el personal no, porque la clave está vacía para ellos.
 *
 * Qué filas ve cada uno NO se decide acá ni en la pantalla: el alcance por fila
 * vive en el `where` de la ruta (`GET /api/cobros-fi/mi-estado-cuenta`), que
 * resuelve la persona y sus vínculos vigentes en el servidor. La pantalla no
 * filtra: repetir la regla en el cliente sería una segunda copia capaz de
 * divergir de la que protege los datos.
 */
export default async function MiEstadoCuentaPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles)
    ? session.user.roles
    : []
  if (roles.length === 0) redirect("/ingresar")
  if (!tienePermiso(roles, "ver", RECURSO_AVISO_PROPIO)) redirect("/dashboard")

  return <EstadoCuentaResidente />
}
