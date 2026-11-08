import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { puede, tienePermiso } from "@/lib/authz"
import { TIPOS_CERTIFICADO_CT, type TipoCertificadoCT } from "@/lib/schemas"
import { tiposEmisibles } from "@/lib/certificados-ct"
import CertificadosEmision from "./_componentes/certificados-emision"

/**
 * /comunidad/certificados — emisión y historial de certificados de la comunidad.
 *
 * El portón y el FILTRO de tipologías se resuelven acá, en el servidor, con los
 * roles de la sesión (`Membresia` vía Auth.js, igual que `/comunidad/archivo`,
 * `/comunidad/avisos-cobro` y `/comunidad/directorio`), y se deciden por el
 * PERMISO y no por una lista de roles copiada: cualquier rol que la matriz
 * habilite para `ct` ver entra sin tocar este archivo.
 *
 * Qué tipologías se ofrecen (F34): las que el rol puede EMITIR según la matriz.
 * Es el MISMO reparto que aplica `POST /api/certificados-ct`
 * (`RECURSO_DE_EMISION_POR_TIPO` en `app/api/certificados-ct/route.ts`):
 *
 *   - `ct:residencia`  → certificado de residencia. La Ley 21.442 no lo regula
 *     (el proyecto de ley 17737-14, en trámite, busca facultar al administrador a
 *     emitirlo), así que el residente emite el suyo sobre su vínculo vigente;
 *   - `ct:al_dia`      → sólo lo emite la administración: el art. 20 N° 4 le
 *     encarga «emitir certificados en lo relativo al estado de deudas de las
 *     unidades» y el art. 15 manda acreditar la calidad de copropietario hábil
 *     con «certificado expedido por el administrador»;
 *   - el resto (`estado_cuenta`, `liquidacion_sueldo`) viaja por la clave base
 *     `ct`, que el residente conserva sólo en `ver`.
 *
 * Un permiso que la pantalla no ofrece es un derecho que nadie puede ejercer; un
 * botón que la API rechaza es una mentira de la interfaz. Por eso el filtro NO se
 * hace en el cliente: el componente recibe las opciones ya filtradas y la API
 * vuelve a validar cada emisión, así que la pantalla no autoriza nada.
 *
 * El reparto tipo→clave NO vive acá: se importa de `lib/certificados-ct.ts`, el
 * mismo módulo que usa `POST /api/certificados-ct`, así que no hay una segunda
 * lista que pueda desincronizarse.
 *
 * Qué pantalla recibe cada rol (F34): la administración, el formulario completo;
 * el comité, el historial sin emisión; y el residente —que sólo recibe
 * `residencia`— una pantalla ANGOSTA que emite y descarga su propio certificado.
 * Se angosta porque el residente no puede leer `GET /api/vinculos` (`mp`),
 * `GET /api/pe/unidades` (`pe:bitacora`) ni `GET /api/configuracion` (`cf`), y
 * abrirle esas rutas para poblar el formulario le entregaría el padrón del
 * edificio y los parámetros operativos de la comunidad. Su fuente es
 * `GET /api/certificados-ct/mis-vinculos`, auto-acotada a sus vínculos vigentes, y
 * el papel lo sirve `GET /api/certificados-ct/[id]/pdf`.
 */

export default async function CertificadosPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles) ? session.user.roles : []
  if (roles.length === 0) redirect("/ingresar")
  if (!tienePermiso(roles, "ver", "ct")) redirect("/dashboard")

  return <CertificadosEmision tiposEmisibles={tiposEmisibles(roles)} />
}
