import { auth } from "@/lib/auth"
import { ProveedoresPanel } from "@/components/pe/proveedores-panel"

/**
 * /operaciones/proveedores — catálogo de proveedores, libro de visitas técnicas
 * y directorio de emergencias.
 *
 * Los roles se resuelven en el SERVIDOR, igual que en `/dashboard`: este
 * componente lee `session.user.roles` una vez y baja el arreglo al componente
 * cliente, que solo decide qué se pinta. El navegador no reimplementa
 * autenticación ni deduce permisos; la matriz de `lib/authz` sigue siendo la que
 * valida cada ruta API.
 *
 * Nace de `f7959cd`: conserjería y mantención LEEN el maestro de proveedores y
 * ya no lo administran. La pantalla tenía que enterarse — ofrecía alta, edición y
 * baja que la API respondía con 403 — pero cerrar la página entera habría dejado
 * sin catálogo a los dos roles que sí lo leen. Por eso el gate es de escritura y
 * no de página: el `page.tsx` resuelve roles y `proveedores-panel.tsx` esconde
 * solo los controles de escritura.
 */
export default async function ProveedoresPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles) ? session.user.roles : []

  return <ProveedoresPanel roles={roles} />
}
