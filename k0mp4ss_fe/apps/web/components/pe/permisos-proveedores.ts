/**
 * permisos-proveedores — espejo en cliente de la matriz RP para `pe:proveedor`.
 *
 * Misma forma que `components/dashboard/perfiles.ts` (`puedeVer`): los roles los
 * resuelve el SERVIDOR (`app/operaciones/proveedores/page.tsx` lee
 * `session.user.roles`) y acá solo se decide qué se pinta. Este módulo NO
 * autentica ni reemplaza el gate de la ruta: la API sigue validando cada lectura
 * y cada escritura contra `lib/authz`. Lo que evita es montar en pantalla un
 * botón que la ruta va a rechazar con 403.
 *
 * Nació de `f7959cd`: conserjería y mantención pasaron a LEER el maestro de
 * proveedores (`pe:proveedor` ver) sin poder administrarlo, pero la pantalla
 * seguía ofreciendo alta, edición y baja. El permiso está decidido; la pantalla
 * se alinea con él.
 *
 * Cada acción se evalúa por separado porque el motor también las separa:
 * `POST /api/pe/proveedores` autoriza con `crear` (upsert de un id nuevo) o
 * `editar` (upsert de un id existente), `DELETE` con `eliminar`.
 */
import { puede } from "@/lib/authz"

const RECURSO = "pe:proveedor"

export interface PermisosProveedores {
  /** Abre el formulario de alta: `POST` de un id nuevo, autorizado con `crear`. */
  crear: boolean
  /** Abre el formulario de edición: el mismo `POST` upsert sobre un id existente. */
  editar: boolean
  /** Baja del proveedor: `DELETE /api/pe/proveedores/[id]`, autorizado con `eliminar`. */
  eliminar: boolean
}

function puedeSobre(roles: string[], accion: string): boolean {
  return roles.some((rol) => puede(rol, accion, RECURSO))
}

/** Permisos de escritura del rol múltiple de la sesión sobre el maestro. */
export function permisosProveedores(roles: string[]): PermisosProveedores {
  return {
    crear: puedeSobre(roles, "crear"),
    editar: puedeSobre(roles, "editar"),
    eliminar: puedeSobre(roles, "eliminar"),
  }
}

/**
 * Qué pestañas puede leer cada rol.
 *
 * La pantalla sirve dos cosas, y las dos son del mismo público privilegiado: el
 * catálogo de empresas (`pe:proveedor`) y el libro de visitas técnicas
 * (`pe:visita_tecnica`). El directorio de emergencias ya no está acá: su permiso
 * (`pe:directorio`) lo tienen TODOS los roles, así que vive en su propia
 * superficie, `/comunidad/directorio` (`app/comunidad/directorio/page.tsx`), y
 * sacarlo de esta pantalla es lo que deja de esconder una cosa universal dentro
 * de una pantalla que casi nadie puede abrir.
 *
 * Se sigue decidiendo por pestaña y no por pantalla porque cada una depende de su
 * propio recurso: `pe:proveedor` y `pe:visita_tecnica` no son la misma clave en
 * la matriz aunque hoy coincidan en los roles.
 */
export interface PestanasProveedores {
  catalogo: boolean
  visitas: boolean
}

export function pestanasProveedores(roles: string[]): PestanasProveedores {
  const lee = (recurso: string) => roles.some((rol) => puede(rol, "ver", recurso))
  return {
    catalogo: lee("pe:proveedor"),
    visitas: lee("pe:visita_tecnica"),
  }
}

/**
 * Pestaña con la que se abre la pantalla: la primera que el rol puede leer.
 *
 * Sin esto la pantalla abría siempre en el catálogo, así que un rol que no lo
 * lee aterrizaba en una pestaña que no puede ver. Con las dos pestañas denegadas
 * no hay pestaña inicial (`""`): el panel declara el "sin acceso" en lugar de
 * montar una pantalla vacía.
 */
export function pestanaInicial(pestanas: PestanasProveedores): string {
  if (pestanas.catalogo) return "catalogo"
  if (pestanas.visitas) return "visitas"
  return ""
}
