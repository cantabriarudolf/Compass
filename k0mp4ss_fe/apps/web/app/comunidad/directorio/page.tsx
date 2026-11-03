import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { tienePermiso } from "@/lib/authz"
import { DirectorioPanel } from "./panel-directorio"

/**
 * /comunidad/directorio — directorio de emergencias y utilidad pública.
 *
 * Nació dentro de `/operaciones/proveedores`, como tercera pestaña de una
 * pantalla que sirve el catálogo de empresas (`pe:proveedor`) y el libro de
 * visitas técnicas (`pe:visita_tecnica`). Los dos son privilegiados; el
 * directorio no: la matriz RP declara `pe:directorio` ver para residente,
 * conserjería, mantención y comité (más el comodín del administrador), o sea
 * para todos. Una cosa que todos leen no puede vivir dentro de una pantalla que
 * casi nadie puede abrir, así que el owner decidió moverla a su propia
 * superficie en Comunidad.
 *
 * El portón se declara acá, en el servidor, con los roles de la sesión
 * (`Membresia` vía Auth.js, igual que `/dashboard` y `/admin/mantenciones`), y
 * se decide por el PERMISO y no por una lista de roles copiada: cualquier rol
 * que la matriz habilite para `pe:directorio` ver entra sin tocar este archivo.
 * El navegador no reimplementa autenticación ni deduce permisos; la API sigue
 * validando cada lectura.
 *
 * OJO — lectura de los datos: el hook `useMaestros("contactos-emergencia")` pega
 * en `/api/maestros/[tipo]`, cuya autorización es `puede(rol, accion, "mp")`
 * (maestros administrativos, `lib/api/crud-factory.ts` vía
 * `app/api/maestros/[tipo]/route.ts`), NO `pe:directorio`. Ese `mp` ver lo tienen
 * el administrador y el comité; conserjería, residente y mantención reciben 403
 * y ven el directorio vacío. Es una condición PREEXISTENTE (la pestaña vieja se
 * comportaba igual), no algo que este traslado introduzca, y no se corrige
 * ensanchando un permiso desde acá: alinear la lectura con `pe:directorio` es
 * una decisión sobre el maestro, no sobre la pantalla.
 */
export default async function DirectorioPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles) ? session.user.roles : []
  if (roles.length === 0) redirect("/ingresar")
  if (!tienePermiso(roles, "ver", "pe:directorio")) redirect("/dashboard")

  return <DirectorioPanel />
}
