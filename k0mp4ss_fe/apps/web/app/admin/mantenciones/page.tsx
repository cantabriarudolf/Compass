import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { PanelMantenciones } from "./panel-mantenciones"

/**
 * /admin/mantenciones — panel del calendario preventivo, propiedad del
 * administrador.
 *
 * El módulo PE (`lib/authz.ts`) le da a conserjería `pe` ver/crear/editar, así
 * que la matriz por sí sola no mantendría a otro rol fuera de esta pantalla:
 * el portón se declara acá, en el servidor, con los roles de la sesión
 * (`Membresia` vía Auth.js, igual que `/dashboard`). El navegador no deduce
 * permisos de un token; la API sigue validando cada lectura y escritura.
 *
 * Nace de `/operaciones/proveedores` (owner: las mantenciones "deben volar de
 * ahí y estar en un panel que lo maneje el administrador"): el catálogo de
 * proveedores y el libro de visitas técnicas se quedan en Operaciones.
 */
export default async function MantencionesAdminPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles) ? session.user.roles : []
  if (roles.length === 0) redirect("/ingresar")
  if (!roles.includes("administrador")) redirect("/dashboard")

  return <PanelMantenciones />
}
