"use client"

/**
 * ReglamentoGC — declaración de la versión del reglamento que gobierna el cobro
 * del gasto común (T4, cobro-gastos-comunes-parametrico S1/S3).
 *
 * S1/S3 en pantalla: sin versión declarada la emisión mensual se bloquea, y los
 * números del mes salen de la versión vigente, no del código (S2). La versión es
 * append-only: no se edita ni se borra, se declara la siguiente.
 *
 * Vive dentro del `<form id="config-form">` de `/admin/configuracion` (el
 * guardado de la configuración), así que no lleva `<form>` propio —quedaría
 * anidado— y **ningún** campo del bloque declara restricciones nativas
 * (`required`, `min`, `max`, `step`, `pattern`): si las tuviera, el navegador
 * frenaría el guardado de la configuración y la burbuja apuntaría a un campo del
 * reglamento. Tampoco deja pasar el Enter, que enviaría el formulario de la
 * página. La validación es explícita con el mismo esquema del servidor
 * (`NuevaVersionReglamentoSchema`), en español y sin redondear nada de lo tipeado.
 */
import * as React from "react"
import { useReglamento } from "@/lib/api/use-reglamento"
import { autorizaEmision, parametrosDeVersion } from "@/lib/reglamento"
import {
  NuevaVersionReglamentoSchema,
  type NuevaVersionReglamento,
  type ParametrosReglamento,
  type VersionReglamento,
} from "@/lib/schemas"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

type Fuente = NuevaVersionReglamento["fuenteInstrumento"]
type Forma = NuevaVersionReglamento["formaContribucion"]
/** Los seis parámetros numéricos de la versión (IPC es interruptor, va aparte). */
type CampoNumerico = Exclude<keyof ParametrosReglamento, "ipcActivo">

/** Las únicas fuentes que un administrador puede declarar (S1). */
const FUENTES: { valor: Fuente; etiqueta: string }[] = [
  { valor: "reglamento_copropiedad", etiqueta: "Reglamento de copropiedad" },
  { valor: "acta_asamblea", etiqueta: "Acta de asamblea" },
]

/** Nombre humano de cada fuente, incluida la que solo existe por migración. */
const ETIQUETA_FUENTE: Record<string, string> = {
  ...Object.fromEntries(FUENTES.map((f) => [f.valor, f.etiqueta])),
  migracion_automatica: "Migración automática",
}

const FORMAS: { valor: Forma; etiqueta: string }[] = [
  { valor: "coeficiente", etiqueta: "Por coeficiente de copropiedad" },
  { valor: "partes_iguales", etiqueta: "Partes iguales" },
  { valor: "monto_por_tipo", etiqueta: "Monto por tipo de unidad" },
  { valor: "mixto", etiqueta: "Mixta (coeficiente y monto por tipo)" },
]

const ETIQUETA_FORMA: Record<string, string> = Object.fromEntries(
  FORMAS.map((f) => [f.valor, f.etiqueta])
)

/**
 * Enter dentro del bloque no guarda la configuración: el bloque vive dentro del
 * `<form id="config-form">` de la página, así que el Enter de un campo lo
 * enviaría. Se cancela acá y la declaración queda solo en el botón explícito.
 * Los controles que ya usan Enter para lo suyo (botón, interruptor, select) no
 * se tocan.
 */
function interceptarEnter(e: React.KeyboardEvent<HTMLDivElement>): void {
  if (e.key !== "Enter") return
  const destino = e.target as HTMLElement | null
  if (destino?.closest("button, [role='switch'], [role='combobox']")) return
  e.preventDefault()
}

/**
 * Los parámetros con su unidad y sin redondear: `String(n)` respeta los
 * decimales que la comunidad declaró (S2: el número es un dato, no una constante).
 */
function filasParametros(p: ParametrosReglamento) {
  return [
    {
      etiqueta: "Fondo de reserva",
      valor: String(p.porcentajeReserva),
      unidad: "% del gasto común mensual",
    },
    {
      etiqueta: "Plazo de pago",
      valor: String(p.diasPagoGc),
      unidad: "días desde la emisión",
    },
    {
      etiqueta: "Tasa de mora",
      valor: String(p.tasaMoraMensualPct),
      unidad: "% mensual",
    },
    {
      etiqueta: "Tope de mora",
      valor: String(p.topeMoraPct),
      unidad: "% del gasto común",
    },
    {
      etiqueta: "Cuotas impagas para el corte",
      valor: String(p.cuotasCorte),
      unidad: "cuotas",
    },
    {
      etiqueta: "Preaviso del corte",
      valor: String(p.diasPreavisoCorte),
      unidad: "días",
    },
    {
      etiqueta: "Reajuste por IPC",
      valor: p.ipcActivo ? "Activo" : "Inactivo",
      unidad: "interruptor",
    },
  ]
}

/** Lectura de la versión que rige: instrumento con su acta y los números del mes. */
function VersionVigente({ version }: { version: VersionReglamento }) {
  // `parametrosDeVersion` es la misma guarda que usa la emisión: una fila con
  // números incompletos no puede mostrarse como si gobernara el cobro.
  const parametros = parametrosDeVersion(version)
  const resumen = [
    { etiqueta: "Versión", valor: String(version.version) },
    { etiqueta: "Vigente desde", valor: version.vigenteDesde },
    {
      etiqueta: "Instrumento",
      valor:
        ETIQUETA_FUENTE[version.fuenteInstrumento] ?? version.fuenteInstrumento,
    },
    { etiqueta: "Acta o artículo", valor: version.actaRef?.trim() || "No declarado" },
    {
      etiqueta: "Forma de contribución",
      valor: ETIQUETA_FORMA[version.formaContribucion] ?? version.formaContribucion,
    },
    {
      etiqueta: "Habilita la emisión",
      valor: autorizaEmision(version) ? "Sí" : "No",
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        {resumen.map((fila) => (
          <div key={fila.etiqueta} className="flex flex-col gap-0.5">
            <dt className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
              {fila.etiqueta}
            </dt>
            <dd className="font-medium">{fila.valor}</dd>
          </div>
        ))}
      </dl>

      {!autorizaEmision(version) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Esta versión se creó migrando el comportamiento anterior y no funda la
          forma de contribución: la emisión sigue bloqueada hasta que declares una
          versión con reglamento de copropiedad o acta de asamblea.
        </div>
      )}

      {parametros ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Parámetro</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Unidad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filasParametros(parametros).map((fila) => (
              <TableRow key={fila.etiqueta}>
                <TableCell className="font-medium">{fila.etiqueta}</TableCell>
                <TableCell className="tabular-nums">{fila.valor}</TableCell>
                <TableCell className="text-muted-foreground">{fila.unidad}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          La versión no declara parámetros válidos: la emisión no puede usar sus
          números hasta que se declare una versión completa.
        </div>
      )}
    </div>
  )
}

interface FormVersion {
  vigenteDesde: string
  fuenteInstrumento: Fuente | ""
  actaRef: string
  formaContribucion: Forma | ""
  numeros: Record<CampoNumerico, string>
  ipcActivo: boolean
}

/**
 * Los seis parámetros numéricos con su unidad y su guía. `entero` marca los que
 * no admiten decimales. Sin acotadores nativos a propósito: el rango se valida
 * con el esquema al declarar, no con la burbuja del navegador.
 */
const CAMPOS_NUMERICOS: {
  clave: CampoNumerico
  etiqueta: string
  ayuda: string
  entero: boolean
}[] = [
  {
    clave: "porcentajeReserva",
    etiqueta: "Fondo de reserva (%)",
    ayuda:
      "Admite decimales (ej.: 12.5) y no se redondea: se usa como recargo al gasto común mensual.",
    entero: false,
  },
  {
    clave: "diasPagoGc",
    etiqueta: "Plazo de pago (días)",
    ayuda: "Días desde la emisión del aviso, entre 1 y 60.",
    entero: true,
  },
  {
    clave: "tasaMoraMensualPct",
    etiqueta: "Tasa de mora mensual (%)",
    ayuda:
      "Admite 4 decimales o más (ej.: 1.2345). Sin tasa declarada no se aplica mora.",
    entero: false,
  },
  {
    clave: "topeMoraPct",
    etiqueta: "Tope de mora (%)",
    ayuda:
      "Admite decimales (ej.: 37.5). Tope legal: 50% del interés corriente bancario (Ley 21.442, art. 7).",
    entero: false,
  },
  {
    clave: "cuotasCorte",
    etiqueta: "Cuotas impagas para el corte",
    ayuda:
      "Entero de cuotas impagas que habilita el aviso de corte (1 o más; una cuota impaga ya es una deuda).",
    entero: true,
  },
  {
    clave: "diasPreavisoCorte",
    etiqueta: "Preaviso del corte (días)",
    ayuda: "Días enteros entre el aviso y el corte (1 o más).",
    entero: true,
  },
]

const FORM_VACIO: FormVersion = {
  vigenteDesde: "",
  fuenteInstrumento: "",
  actaRef: "",
  formaContribucion: "",
  numeros: {
    porcentajeReserva: "",
    diasPagoGc: "",
    tasaMoraMensualPct: "",
    topeMoraPct: "",
    cuotasCorte: "",
    diasPreavisoCorte: "",
  },
  ipcActivo: false,
}

type Armado =
  | { ok: true; datos: NuevaVersionReglamento }
  | { ok: false; error: string }

/**
 * Arma el cuerpo del alta sin `id` ni `version` (los asigna el servidor) y le
 * aplica el esquema del servidor. `Number()` sobre el texto del input conserva
 * los decimales: acá no se redondea ni se trunca nada.
 */
function armarNuevaVersion(form: FormVersion): Armado {
  if (!form.vigenteDesde.trim()) {
    return { ok: false, error: "Indicá desde qué período rige la versión (AAAA-MM)." }
  }
  if (!form.fuenteInstrumento) {
    return {
      ok: false,
      error: "Elegí el instrumento que funda la forma de contribución.",
    }
  }
  if (!form.formaContribucion) {
    return { ok: false, error: "Elegí la forma de contribución." }
  }

  const textos = CAMPOS_NUMERICOS.map((campo) => form.numeros[campo.clave])
  if (textos.some((t) => t.trim() === "")) {
    return { ok: false, error: "Completá los siete parámetros del cobro." }
  }

  const parametros = {
    porcentajeReserva: Number(form.numeros.porcentajeReserva),
    diasPagoGc: Number(form.numeros.diasPagoGc),
    tasaMoraMensualPct: Number(form.numeros.tasaMoraMensualPct),
    topeMoraPct: Number(form.numeros.topeMoraPct),
    cuotasCorte: Number(form.numeros.cuotasCorte),
    diasPreavisoCorte: Number(form.numeros.diasPreavisoCorte),
    ipcActivo: form.ipcActivo,
  }
  const numericos = [
    parametros.porcentajeReserva,
    parametros.diasPagoGc,
    parametros.tasaMoraMensualPct,
    parametros.topeMoraPct,
    parametros.cuotasCorte,
    parametros.diasPreavisoCorte,
  ]
  if (numericos.some((n) => !Number.isFinite(n) || n < 0)) {
    return {
      ok: false,
      error: "Los parámetros tienen que ser números válidos, sin negativos.",
    }
  }

  const candidata = {
    vigenteDesde: form.vigenteDesde.trim(),
    fuenteInstrumento: form.fuenteInstrumento,
    actaRef: form.actaRef.trim() === "" ? null : form.actaRef.trim(),
    formaContribucion: form.formaContribucion,
    parametros,
  }
  const parsed = NuevaVersionReglamentoSchema.safeParse(candidata)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Revisá los datos de la versión.",
    }
  }
  return { ok: true, datos: parsed.data }
}

export function ReglamentoGC() {
  const { version, isLoading, error, declararVersion } = useReglamento()
  const [form, setForm] = React.useState<FormVersion>(FORM_VACIO)
  const [errorAlta, setErrorAlta] = React.useState<string | null>(null)
  const [okMsg, setOkMsg] = React.useState<string | null>(null)
  const [enviando, setEnviando] = React.useState(false)

  /** El texto del input se guarda tal cual: convertir es trabajo del alta. */
  const setNumerico = (clave: CampoNumerico, valor: string) =>
    setForm((f) => ({ ...f, numeros: { ...f.numeros, [clave]: valor } }))

  const declarar = async () => {
    setErrorAlta(null)
    setOkMsg(null)
    const armado = armarNuevaVersion(form)
    if (!armado.ok) {
      setErrorAlta(armado.error)
      return
    }
    setEnviando(true)
    const resultado = await declararVersion(armado.datos)
    setEnviando(false)
    if (!resultado.ok) {
      // El formulario queda intacto: se corrige lo que el servidor rechazó sin
      // volver a tipear los siete parámetros.
      setErrorAlta(resultado.error ?? "No se pudo declarar la versión.")
      return
    }
    setOkMsg(
      `Versión declarada: rige desde ${armado.datos.vigenteDesde}. La emisión de ese período ya usa estos números.`
    )
  }

  return (
    <Card onKeyDown={interceptarEnter}>
      <CardHeader>
        <CardTitle>Versión vigente del reglamento</CardTitle>
        <CardDescription>
          Sin una versión declarada, la emisión mensual del gasto común se bloquea.
          Los números del mes salen de acá, no del código: plazo de pago, mora,
          corte y fondo de reserva son los de la versión que rige el período.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            No se pudo leer la versión vigente: {error.message}
          </div>
        )}
        {okMsg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            {okMsg}
          </div>
        )}
        {errorAlta && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {errorAlta}
          </div>
        )}

        {isLoading ? (
          <div className="h-24 w-full animate-pulse rounded-lg bg-muted/40" />
        ) : version === null ? (
          !error && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <strong>Sin versión declarada.</strong> La emisión del gasto común
              está bloqueada hasta que declares desde qué instrumento sale la forma
              de contribución. Declarala acá abajo: es lo que habilita emitir el
              mes.
            </div>
          )
        ) : (
          <VersionVigente version={version} />
        )}

        <div className="flex flex-col gap-3 border-t pt-4">
          <div>
            <h3 className="font-medium">Declarar una versión nueva</h3>
            <p className="text-sm text-muted-foreground">
              Una versión no se edita ni se borra: se declara la siguiente y la
              anterior queda como historia de lo ya emitido.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reg-vigente-desde">Vigente desde (AAAA-MM) *</Label>
              <Input
                id="reg-vigente-desde"
                value={form.vigenteDesde}
                onChange={(e) =>
                  setForm((f) => ({ ...f, vigenteDesde: e.target.value }))
                }
                placeholder="2026-01"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Período del primer mes que rige esta versión.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-fuente">Instrumento que la funda *</Label>
              <Select
                value={form.fuenteInstrumento || undefined}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, fuenteInstrumento: v as Fuente }))
                }
              >
                <SelectTrigger id="reg-fuente" className="w-full">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {FUENTES.map((fuente) => (
                    <SelectItem key={fuente.valor} value={fuente.valor}>
                      {fuente.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Reglamento de copropiedad o acta de asamblea: son las únicas fuentes
                que habilitan la emisión.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-acta">Acta o artículo de referencia</Label>
              <Input
                id="reg-acta"
                value={form.actaRef}
                onChange={(e) => setForm((f) => ({ ...f, actaRef: e.target.value }))}
                placeholder="Acta de asamblea N° 12, art. 11"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                El acta ya vive en Gestión Documental: acá va solo la referencia.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-forma">Forma de contribución *</Label>
              <Select
                value={form.formaContribucion || undefined}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, formaContribucion: v as Forma }))
                }
              >
                <SelectTrigger id="reg-forma" className="w-full">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {FORMAS.map((forma) => (
                    <SelectItem key={forma.valor} value={forma.valor}>
                      {forma.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                La que establece el instrumento declarado arriba (Ley 21.442, art. 6).
              </p>
            </div>

            {CAMPOS_NUMERICOS.map((campo) => (
              <div key={campo.clave} className="space-y-2">
                <Label htmlFor={`reg-${campo.clave}`}>{campo.etiqueta} *</Label>
                {/* Texto, no number: `number` trae el paso 1 por defecto y el
                    navegador marcaría inválidos los decimales del bloque. */}
                <Input
                  id={`reg-${campo.clave}`}
                  type="text"
                  inputMode={campo.entero ? "numeric" : "decimal"}
                  autoComplete="off"
                  value={form.numeros[campo.clave]}
                  onChange={(e) => setNumerico(campo.clave, e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{campo.ayuda}</p>
              </div>
            ))}

            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="reg-ipc">Reajuste por IPC</Label>
                  <p className="text-xs text-muted-foreground">
                    Si está activo, el cobro se reajusta por el índice de precios.
                  </p>
                </div>
                <Switch
                  id="reg-ipc"
                  checked={form.ipcActivo}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, ipcActivo: v }))}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={declarar} disabled={enviando}>
              {enviando ? "Declarando…" : "Declarar versión"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
