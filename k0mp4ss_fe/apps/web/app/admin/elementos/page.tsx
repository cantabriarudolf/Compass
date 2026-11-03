import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { PanelElementos } from "./panel-elementos"

/**
 * /admin/elementos — panel de elementos reservables (amenities), propiedad del
 * administrador.
 *
 * El módulo RA (`lib/authz.ts`) le da a residente y conserjería `ver`/`crear`
 * sobre `ra` (reservar es del residente), así que la matriz por sí sola no
 * mantendría a otro rol fuera de esta pantalla: el portón se declara acá, en el
 * servidor, con los roles de la sesión (`Membresia` vía Auth.js, igual que
 * `/dashboard`). El navegador no deduce permisos de un token; la API sigue
 * validando cada lectura y escritura.
 *
 * Nace del menú de Operaciones → Reservas y Amenities, donde los elementos se
 * creaban dentro de la pestaña de reservas. El owner pidió que esa opción
 * también viva en el menú del administrador: acá se administra el catálogo de
 * amenities (crear, editar, activar/desactivar) y las reservas de los
 * residentes se quedan en `/operaciones/reservas`.
 */
export default async function ElementosAdminPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles) ? session.user.roles : []
  if (roles.length === 0) redirect("/ingresar")
  if (!roles.includes("administrador")) redirect("/dashboard")

  return <PanelElementos />
}
