import Link from "next/link"
import { Badge } from "@workspace/ui/components/badge"
import { Card, CardContent } from "@workspace/ui/components/card"
import { IconArrowLeft, IconChecklist } from "@tabler/icons-react"

/**
 * /admin/arranque/pauta — la pauta de migración, para leerla y seguirla.
 *
 * El archivo fuente es `Data/NSGC/docs/manuales/43 - Pauta de Migracion y Marcha
 * Blanca.md`, que es el registro del repo. Esta página es el **instrumento**: el
 * administrador de la comunidad no abre un repositorio, así que la pauta vive también
 * acá, al lado de la pantalla que dice qué falta (`/admin/arranque`).
 *
 * No lleva guardia propio: hereda el de `arranque` (`cf:ver`), porque no muestra datos
 * de nadie — es texto.
 *
 * Las dos versiones se mantienen juntas: si cambia una regla de la carga (la fecha de
 * corte, la ventana de congelamiento, el orden), se cambian las dos en el mismo commit.
 */

const PASOS: ReadonlyArray<{ titulo: string; detalle: string; pantalla: string }> = [
  {
    titulo: "1 · Catálogo del país",
    detalle: "AFP, salud, bancos, índices y feriados. Es un botón: se asegura una vez y lo ven todas las comunidades.",
    pantalla: "/admin/maestros",
  },
  {
    titulo: "2 · Tipos de unidad y estados de ocupación",
    detalle: "La unidad los exige para existir. Sin ellos, la carga de estructura se rechaza fila por fila.",
    pantalla: "/admin/maestros",
  },
  {
    titulo: "3 · Estructura",
    detalle: "Sectores y unidades por CSV. Clave: rol SII de la unidad.",
    pantalla: "/admin/carga-inicial",
  },
  {
    titulo: "4 · Personas",
    detalle: "El padrón por CSV. Clave: RUT. Exige un correo por persona para poder darle acceso después.",
    pantalla: "/admin/carga-inicial",
  },
  {
    titulo: "5 · Vínculos",
    detalle: "Quién vive dónde, por CSV. Falla si falta la persona o la unidad: no se inventan.",
    pantalla: "/admin/carga-inicial",
  },
  {
    titulo: "6 · Egresos e ingresos",
    detalle: "El histórico de movimientos por CSV, con plantilla y vista previa.",
    pantalla: "/admin/carga-inicial",
  },
  {
    titulo: "7 · Saldos de apertura",
    detalle: "La deuda a la fecha de corte: unidad, fecha y monto. Se rechaza si ya hay emisiones de ese período.",
    pantalla: "/admin/carga-inicial",
  },
  {
    titulo: "8 · Configuración",
    detalle: "Identidad, firmante derivado y casilla de correo de la comunidad (se prueba desde la pantalla).",
    pantalla: "/admin/configuracion",
  },
  {
    titulo: "9 · Fondos",
    detalle: "Sin fondo de gasto común activo no se puede emitir ni imputar la deuda anterior.",
    pantalla: "/finanzas/gastos-comunes",
  },
  {
    titulo: "10 · Acuerdo y presupuesto",
    detalle: "El presupuesto exige un acuerdo aprobado del comité o de la asamblea.",
    pantalla: "/admin/gestion/presupuestos",
  },
  {
    titulo: "11 · Primera emisión",
    detalle: "Del período SIGUIENTE a la fecha de corte. Si se emite el mismo período, ese mes se cobra dos veces.",
    pantalla: "/finanzas/gastos-comunes",
  },
  {
    titulo: "12 · Usuarios",
    detalle: "Cada vecino con su cuenta, para que entre y vea su deuda.",
    pantalla: "/admin/usuarios",
  },
]

const VERIFICACIONES: readonly string[] = [
  "La vista previa de cada planilla terminó sin errores. Si hay una fila con error, se corrige la fila; no se importa «lo que se pueda».",
  "Los números coinciden: unidades cargadas = unidades de la planilla; personas = padrón; cada unidad con al menos un propietario.",
  "La deuda total del sistema = la deuda total de la planilla a la fecha de corte. Si no da, falta una unidad o sobra un saldo.",
  "El arranque no tiene faltantes: esta misma pantalla en cero (o sólo los pasos que se decidió no usar).",
  "Un vecino de prueba entra y ve su unidad y su deuda. Si eso funciona, el resto es repetir.",
]

const NO_TRAE: readonly string[] = [
  "Gobernanza: directiva, períodos y actas se cargan a mano.",
  "Ficha laboral del personal: sobre cada persona, a mano.",
  "Fotos, PDF y documentos: uno por uno.",
  "Medidores y etiqueta de sector: el CSV no los trae, se completan por unidad después.",
  "El DETALLE de pagos viejos: se carga el saldo de cada unidad, no cada comprobante.",
]

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="mb-3 text-lg font-semibold tracking-tight">{titulo}</h2>
        <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
      </CardContent>
    </Card>
  )
}

export default function PautaMigracionPage() {
  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="border-b pb-5">
        <Link
          href="/admin/arranque"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" /> Volver al arranque
        </Link>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <IconChecklist className="size-7 text-muted-foreground" /> Pauta de migración y marcha blanca
        </h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          Cómo se pasa de la planilla al sistema sin que queden dos verdades. Es lo que hay que
          acordar <strong>antes</strong> de cargar, no un manual de pantallas.
        </p>
      </div>

      <Bloque titulo="La regla que ordena todo: una fecha de corte">
        <p>
          Se elige <strong>un día</strong>. Hasta ese día la comunidad vive en la planilla; desde el
          día siguiente, en el sistema.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>La deuda que se carga es la de <strong>ese día</strong>, no la de ayer ni la de fin de mes.</li>
          <li>
            La primera emisión del sistema es del <strong>período siguiente</strong> al corte. Si el
            corte es el 31 de marzo, la primera emisión es abril.
          </li>
          <li>Sin una fecha única, cada planilla trae su criterio y un mismo mes se cobra dos veces.</li>
        </ul>
      </Bloque>

      <Bloque titulo="La ventana de congelamiento">
        <p>
          Durante la carga <strong>no se opera</strong>: no se emite, no se cobra, no se registra
          ningún pago y no se da de alta a nadie. Dura lo que dura la carga: una tarde, no una semana.
        </p>
        <p>
          El motivo es concreto: un pago que entra en medio deja el saldo de apertura desactualizado
          por ese monto, y nadie lo descubre hasta que el vecino reclama. La vida del edificio
          (visitas, encomiendas, reservas) puede seguir; lo que se congela es <strong>plata y
          padrón</strong>.
        </p>
      </Bloque>

      <Bloque titulo="El orden de la carga (no es opcional)">
        <ol className="space-y-3">
          {PASOS.map((paso) => (
            <li key={paso.titulo} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{paso.titulo}</span>
                <Link href={paso.pantalla} className="text-xs underline underline-offset-2">
                  {paso.pantalla}
                </Link>
              </div>
              <p className="mt-1">{paso.detalle}</p>
            </li>
          ))}
        </ol>
        <p className="pt-2">
          Cada paso deja el sistema en un estado coherente. Si algo falla, se corrige y{" "}
          <strong>se vuelve a subir el mismo archivo</strong>: las cargas no duplican y todas tienen
          vista previa que no escribe.
        </p>
      </Bloque>

      <Bloque titulo="Cómo saber que salió bien">
        <ul className="list-disc space-y-2 pl-5">
          {VERIFICACIONES.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
      </Bloque>

      <Bloque titulo="Lo que el sistema NO trae (para no esperarlo)">
        <ul className="list-disc space-y-1 pl-5">
          {NO_TRAE.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Bloque>

      <Bloque titulo="Si la carga se hace más adelante y no al arranque">
        <p>
          Se puede: no hay nada que lo impida técnicamente. Lo único que cambia es que, hasta esa
          carga, el sistema no ve a los morosos de antes y se vuelve al problema de las dos verdades
          —la deuda en la planilla y la del sistema—, que es justo lo que esta pauta evita.
        </p>
        <p className="pt-1">
          <Badge variant="secondary" className="text-[10px]">
            Registro del repo
          </Badge>{" "}
          <span className="text-xs">
            Data/NSGC/docs/manuales/43 - Pauta de Migracion y Marcha Blanca.md
          </span>
        </p>
      </Bloque>
    </div>
  )
}
