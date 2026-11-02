import { auth } from "@/lib/auth"
import { DashboardGestion } from "@/components/dashboard/dashboard-gestion"
import { DashboardOperativo } from "@/components/dashboard/dashboard-operativo"
import { perfilDeRoles } from "@/components/dashboard/perfiles"

/**
 * /dashboard — portada operativa y financiera por perfil (`dashboard-operativo`).
 *
 * D2: los roles se resuelven en el SERVIDOR. Este componente lee `session` una
 * vez y baja `session.user.roles` al componente cliente; el navegador no
 * reimplementa autenticación ni deduce permisos de un token. La matriz RP sigue
 * siendo la del servidor (`lib/authz`), que además es la que valida cada ruta.
 *
 * D1: `administrador` y `comite` comparten el panel de gestión (el comité es el
 * receptor legal de la rendición de cuentas); `conserjeria`, `mantencion` y
 * `residente` reciben la portada operativa acotada a lo que pueden leer.
 */
export default async function DashboardPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles) ? session.user.roles : []

  return perfilDeRoles(roles) === "gestion" ? (
    <DashboardGestion roles={roles} />
  ) : (
    <DashboardOperativo roles={roles} />
  )
}
