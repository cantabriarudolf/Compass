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
 * Lectura de los datos: el panel usa `useDirectorioEmergencias`, que pega en
 * `/api/comunidad/directorio` — una puerta de LECTURA propia, gateada con
 * `pe:directorio` ver (el mismo permiso de este portón), que devuelve solo los
 * contactos de emergencia de la comunidad. NO lee el maestro administrativo
 * (`/api/maestros/contactos-emergencia`), cuyo gate es el del maestro
 * administrativo (`mp` ver): ese permiso ancho (todos los maestros
 * administrativos) lo tienen el administrador y el comité, y usarlo para servir
 * el teléfono de Bomberos dejaba el directorio vacío para conserjería, residente
 * y mantención (403) y exponía más de lo necesario a quien sí lo leía.
 *
 * Decisión del owner: el directorio es información de la comunidad y todos los
 * roles lo leen; `pe:directorio` NO se angosta. Lo que se separó es la puerta:
 * lectura angosta para todos (esta pantalla + `/api/comunidad/directorio`) y
 * administración del maestro intacta para el administrador (`mp`, sin cambios).
 */
export default async function DirectorioPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles) ? session.user.roles : []
  if (roles.length === 0) redirect("/ingresar")
  if (!tienePermiso(roles, "ver", "pe:directorio")) redirect("/dashboard")

  return <DirectorioPanel />
}
