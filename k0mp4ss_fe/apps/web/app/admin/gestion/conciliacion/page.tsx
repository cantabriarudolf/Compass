import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { Card, CardContent } from "@workspace/ui/components/card"
import { IconLock } from "@tabler/icons-react"
import {
  puedeImportarCartola,
  puedeResolverMovimiento,
  puedeVerConciliacion,
} from "./alcance"
import { ConsolaConciliacion } from "./_componentes/conciliacion"

/**
 * /admin/gestion/conciliacion — la cara visible de la conciliación bancaria
 * (F30 · U2 del plan «saldar-v2-pantallas-y-barrido», S1 y S2).
 *
 * La importación de la cartola y la resolución de la cola existían por API desde
 * F30 —el reglamento de la Ley 21.442 exige llevar las cuentas «debidamente
 * conciliadas» (art. 24) y la regla pura deja en la cola lo que no puede enlazar
 * con certeza— y nadie podía importar ni cerrar la cola sin curl. Esta pantalla
 * sigue el molde de `/admin/gestion/vigencia-registro`.
 *
 * El portón se declara acá, en el servidor, con los roles de la sesión (Auth.js):
 * se decide por el PERMISO (`fi:cobranza` con `ver`, el mismo que exige la
 * lectura de la API) y no por una lista de roles copiada, así que un rol que la
 * matriz habilite mañana entra sin tocar este archivo.
 *
 * Si el rol no alcanza, se renderiza el «sin permiso» ANTES de montar la consola
 * —no una `GET` que devuelva 403 ni una cola vacía que se leería como «todo está
 * conciliado»— y sin redirigir: quien tiene sesión pero no la clave merece saber
 * cuál le falta.
 *
 * Las dos acciones se deciden aparte porque cada ruta pide una acción distinta:
 * importar exige `crear` y resolver la cola exige `editar`. El comité entra con
 * `ver` y lee la conciliación como auditoría; no importa ni resuelve.
 */
export default async function ConciliacionPage() {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles)
    ? session.user.roles
    : []
  if (roles.length === 0) redirect("/ingresar")

  if (!puedeVerConciliacion(roles)) {
    return (
      <div className="flex flex-col gap-6 pb-10">
        <div className="flex flex-col gap-2 border-b pb-5">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <IconLock className="size-7 text-muted-foreground" /> Conciliación
            bancaria
          </h1>
          <p className="text-muted-foreground">
            La cartola del banco se cruza con los cargos y pagos de la comunidad.
          </p>
        </div>

        <Card className="border-dashed bg-muted/20">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <p role="status">
              Sin permiso para abrir la conciliación bancaria.
            </p>
            <p className="mt-2 text-xs">
              La pantalla exige la clave{" "}
              <code className="font-mono">fi:cobranza</code> con acción{" "}
              <code className="font-mono">ver</code>, que es la misma que valida
              la API al leer las cartolas de la comunidad. Importar una cartola
              pide <code className="font-mono">crear</code> y resolver un
              movimiento de la cola pide{" "}
              <code className="font-mono">editar</code>. Pedile a la
              administración que revise los permisos de tu membresía.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <ConsolaConciliacion
      puedeImportar={puedeImportarCartola(roles)}
      puedeResolver={puedeResolverMovimiento(roles)}
    />
  )
}
