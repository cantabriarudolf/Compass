import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { PanelReservas } from "./panel-reservas"

/**
 * /admin/reservas — alerta de reservas: la cola de autorización del administrador.
 *
 * Pedido del owner: además del catálogo de elementos, el administrador necesita
 * la opción de autorizar las reservas, con una búsqueda que acote de verdad en
 * vez de la lista interminable de Operaciones.
 *
 * El módulo RA (`lib/authz.ts`) le da a residente `ver/crear`, así que la matriz
 * por sí sola no mantendría a otro rol fuera de esta pantalla: el portón se
 * declara acá, en el servidor, con los roles de la sesión (`Membresia` vía
 * Auth.js, igual que `/dashboard` y los demás paneles de `/admin`). El navegador
 * no deduce permisos de un token; la API de la cola exige `editar` sobre `ra`,
 * que solo tiene el administrador.
 *
 * Nace de `/operaciones/reservas`, que sigue siendo la operación diaria
 * (reservar, cancelar, retener garantía). Acá solo se autoriza o rechaza lo que
 * un elemento con `requiereAutorizacion` dejó pendiente.
 */
export default async function ReservasAdminPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles) ? session.user.roles : []
  if (roles.length === 0) redirect("/ingresar")
  if (!roles.includes("administrador")) redirect("/dashboard")

  return <PanelReservas />
}
