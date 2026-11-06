import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { tienePermiso } from "@/lib/authz"
import { ConsolaArchivo } from "./consola-archivo"

/**
 * /comunidad/archivo — ARCHIVO de documentos de la comunidad (F35 serie A, A2).
 *
 * El portón se declara en el servidor con los roles de la sesión (Auth.js), igual
 * que `/comunidad/directorio`, y se decide por el PERMISO `doc` ver y no por una
 * lista de roles copiada: administración (comodín), comité (`ver` + `crear`) y
 * residente (`ver`) — la matriz `lib/authz.ts` es la única fuente. Cualquier rol
 * que la matriz habilite mañana entra sin tocar este archivo.
 *
 * Los roles viajan al componente cliente para que la pantalla pueda deshabilitar
 * —y explicar— las acciones que la matriz no concede (editar/eliminar). La API
 * sigue validando cada escritura: la pantalla no autoriza, solo muestra el
 * permiso que el servidor ya resolvió.
 */
export default async function ArchivoPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles) ? session.user.roles : []
  if (roles.length === 0) redirect("/ingresar")
  if (!tienePermiso(roles, "ver", "doc")) redirect("/dashboard")

  return <ConsolaArchivo roles={roles} />
}
