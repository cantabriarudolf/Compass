import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { puedeVerMisLiquidaciones } from "./alcance"
import { ConsolaMisLiquidaciones } from "./consola-mis-liquidaciones"

/**
 * /comunidad/mis-liquidaciones — la liquidación de sueldo del trabajador (T10).
 *
 * El portón se declara en el servidor con los roles de la sesión (Auth.js),
 * igual que `/comunidad/avisos-cobro`: se decide por el PERMISO y no por una
 * lista de roles copiada. El par de claves es el MISMO que decide la API
 * (`pl` ver para la gestión, `pl:propia` ver para el trabajador), declarado una
 * sola vez en `alcance.ts`, así que un rol que la matriz habilite mañana entra
 * sin tocar este archivo.
 *
 * Qué liquidaciones ve cada uno NO se decide acá ni en la pantalla: el alcance
 * por fila vive en el `where` de la ruta (`alcanceDeLectura`), que resuelve la
 * persona del usuario en el servidor. La pantalla no filtra: repetir la regla en
 * el cliente sería una segunda copia capaz de divergir de la que protege los
 * sueldos.
 *
 * Los roles viajan a la consola para que el texto del vacío diga la verdad de
 * quien lee —«tu persona» no es cierto para quien ve la comunidad completa— y
 * para nada más.
 */
export default async function MisLiquidacionesPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles)
    ? session.user.roles
    : []
  if (roles.length === 0) redirect("/ingresar")
  if (!puedeVerMisLiquidaciones(roles)) redirect("/dashboard")

  return <ConsolaMisLiquidaciones roles={roles} />
}
