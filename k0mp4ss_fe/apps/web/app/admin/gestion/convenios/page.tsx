import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { Card, CardContent } from "@workspace/ui/components/card"
import { IconLock } from "@tabler/icons-react"
import {
  puedeCrearConvenios,
  puedeRegistrarPagoConvenio,
  puedeVerConvenios,
} from "./alcance"
import { ConsolaConvenios } from "./_componentes/convenios"

/**
 * /admin/gestion/convenios — la cara visible de los convenios de pago (F29 · U1
 * del plan «saldar-v2-pantallas-y-barrido», S1 y S2).
 *
 * El contrato de pago de la deuda de gastos comunes existe por API desde F29
 * (Ley 21.442 art. 6: cuotas mensuales, primera cuota al suscribir y acuerdo del
 * Comité) y nadie podía suscribir uno sin curl. Esta pantalla sigue el molde de
 * `/admin/gestion/vigencia-registro`.
 *
 * El portón se declara acá, en el servidor, con los roles de la sesión (Auth.js):
 * se decide por el PERMISO (`fi:cobranza` con `ver`, el mismo que exige la
 * lectura de la API) y no por una lista de roles copiada, así que un rol que la
 * matriz habilite mañana entra sin tocar este archivo.
 *
 * Si el rol no alcanza, se renderiza el «sin permiso» ANTES de montar la consola
 * —no una tabla vacía que se leería como «la comunidad no tiene convenios»— y
 * sin redirigir: quien tiene sesión pero no la clave merece saber cuál le falta.
 *
 * Las acciones por fila no se deciden acá: el estado del convenio y el de cada
 * cuota viajan desde la API. El alta y el pago sí son decisiones del servidor
 * que viajan como props (`crear` y `editar`); el resto —leer el listado y las
 * cuotas— comparte `ver`, que es este portón.
 */
export default async function ConveniosPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles)
    ? session.user.roles
    : []
  if (roles.length === 0) redirect("/ingresar")

  if (!puedeVerConvenios(roles)) {
    return (
      <div className="flex flex-col gap-6 pb-10">
        <div className="flex flex-col gap-2 border-b pb-5">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <IconLock className="size-7 text-muted-foreground" /> Convenios de
            pago
          </h1>
          <p className="text-muted-foreground">
            La deuda de gastos comunes se regulariza con un acuerdo del Comité.
          </p>
        </div>

        <Card className="border-dashed bg-muted/20">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <p role="status">
              Sin permiso para abrir los convenios de pago.
            </p>
            <p className="mt-2 text-xs">
              La pantalla exige la clave{" "}
              <code className="font-mono">fi:cobranza</code> con acción{" "}
              <code className="font-mono">ver</code>, que es la misma que valida
              la API al leer los convenios de la comunidad. Suscribir uno pide{" "}
              <code className="font-mono">crear</code> y registrar el pago de una
              cuota pide <code className="font-mono">editar</code>. Pedile a la
              administración que revise los permisos de tu membresía.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <ConsolaConvenios
      puedeCrear={puedeCrearConvenios(roles)}
      puedeRegistrarPago={puedeRegistrarPagoConvenio(roles)}
    />
  )
}
