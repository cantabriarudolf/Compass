/**
 * /comunidad/comunicacion — puerta de Comunicación con Vecinos (CO).
 *
 * change co-lectura-residente, tarea 1.7 · S1 · decisión D1: la vista se deriva
 * del ROL resuelto en el servidor. No existe ningún control en el cliente para
 * cambiar de vista (el viejo `<Select>` «Vista: Administración | Directiva |
 * Vecino» fue eliminado: un toggle que gobierna el alcance es autorización por
 * UI, y la matriz ABAC del proyecto declara que el alcance se filtra en el
 * servidor).
 *
 * El rol y la comunidad salen de `withComunidadScope()`, el mismo scope que
 * autoriza a las API routes de CO (`auth()` + membresía en BD): así la pantalla
 * y la API no pueden discrepar sobre quién puede ver qué.
 *
 *   administrador → consola (redacción, plantillas, buzón, biblioteca)
 *   comite        → bandeja de lectura con agregados
 *   residente     → bandeja propia
 *   sin `co` ver  → sin acceso
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { IconLock } from "@tabler/icons-react"
import { withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { personaIdDelUsuarioDb } from "@/lib/api/sesion-persona"
import { prisma } from "@/lib/prisma"
import { BandejaResidente } from "@/components/co/bandeja-residente"
import { rolVistaCO } from "@/components/co/rol-vista"
import { ConsolaComunicacionCO } from "./consola-comunicacion"

/** Estado neutro: se usa cuando no hay sesión/membresía o el rol no ve CO. */
function SinAccesoCO({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Comunicación</h1>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <IconLock className="size-4" /> {titulo}
          </CardTitle>
          <CardDescription className="leading-relaxed">{detalle}</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  )
}

export default async function ComunicacionPage() {
  const resultado = await withComunidadScope().catch(() => null)
  if (!resultado || !resultado.ok) {
    return (
      <SinAccesoCO
        titulo="No pudimos resolver tu comunidad"
        detalle="La sesión no tiene una membresía de comunidad activa, así que no hay bandeja ni consola que mostrar. Si crees que es un error, pide a la Administración que revise tu acceso."
      />
    )
  }

  const { scope } = resultado
  const rol = rolVistaCO(scope.rol)

  if (rol === "administrador") return <ConsolaComunicacionCO />

  if (rol === "sin-acceso") {
    return (
      <SinAccesoCO
        titulo="Tu rol no tiene acceso a Comunicación"
        detalle="Las comunicaciones de la comunidad y su bandeja de lectura están reservadas a la Administración, al Comité y a los residentes destinatarios. Tu rol no figura en la matriz de permisos de este módulo."
      />
    )
  }

  const [personaId, comunidad] = await Promise.all([
    personaIdDelUsuarioDb(scope.usuarioId),
    prisma.comunidad.findUnique({
      where: { id: scope.comunidadId },
      select: { nombre: true },
    }),
  ])

  return (
    <BandejaResidente
      rol={rol}
      cuentaVinculada={Boolean(personaId)}
      nombreComunidad={comunidad?.nombre ?? null}
    />
  )
}
