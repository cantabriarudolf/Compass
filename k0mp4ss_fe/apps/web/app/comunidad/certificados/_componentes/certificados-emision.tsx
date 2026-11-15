"use client"

import * as React from "react"
import { esMiembroDirectivaVigente } from "@/lib/store/helpers"
import { useCertificadosCT } from "@/lib/api/use-certificados-ct"
import { useLiquidaciones } from "@/lib/api/use-liquidaciones"
import { BuscadorEntidad } from "@/components/buscador-entidad"
import { AvisoTruncamiento } from "@/components/pe/aviso-truncamiento"
import { usePersonas } from "@/lib/api/use-personas"
import { useUnidades } from "@/lib/api/use-unidades"
import { useVinculos } from "@/lib/api/use-vinculos"
import { useConfiguracion } from "@/lib/api/use-configuracion"
import { usePeriodosDirectiva } from "@/lib/api/use-periodos-directiva"
import { generarId } from "@/lib/id-utils"
import { hoyISO } from "@/lib/date-utils"
import { ETIQUETA_POR_TIPO_CERTIFICADO } from "@/lib/certificados-ct"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { IconCertificate, IconFileText, IconTrash } from "@tabler/icons-react"
import type { CertificadoCT, CertificadoCTAlta, ConfiguracionGlobal, Unidad } from "@/lib/schemas"
import { CertificadoCTAltaSchema } from "@/lib/schemas"
import { documentoCertificadoPDF } from "@/lib/pdf-utils"

/**
 * Etiqueta visible de cada tipología. Exportada para que el arnés compare textos.
 * Es la MISMA que imprime el papel servido por `GET /api/certificados-ct/[id]/pdf`:
 * vive en `lib/certificados-ct.ts` porque el servidor no puede importar un módulo
 * `"use client"`.
 */
export const TIPO_LABEL: Record<CertificadoCT["tipo"], string> = ETIQUETA_POR_TIPO_CERTIFICADO

export interface CertificadosEmisionProps {
  /**
   * Tipologías que el ROL de la sesión puede emitir, resueltas en el servidor
   * (`page.tsx`) con la matriz de permisos. La pantalla NO decide: dibuja lo que
   * recibe, y la API vuelve a validar cada emisión.
   *
   * Obligatoria a propósito: un default abierto devolvería al residente las
   * tipologías que la ley reserva al administrador.
   */
  tiposEmisibles: readonly CertificadoCT["tipo"][]
}

/** URL de la fuente PROPIA del residente (auto-acotada en el servidor). */
const MIS_VINCULOS = "/api/certificados-ct/mis-vinculos"

/**
 * URL del buscador ligero de personas para el formulario de emisión (F36).
 *
 * Reemplaza al padrón truncado: `usePersonas()` pide `/api/personas?pageSize=100`
 * y el `Select` montaba esa primera página filtrada en el cliente con los
 * vínculos de `/api/vinculos?pageSize=100` —también recortados—, así que una
 * persona fuera de esas páginas no podía certificarse.
 */
const BUSCADOR_PERSONAS = "/api/certificados-ct/buscar-personas"

/**
 * URL del buscador de unidades (T13/S10).
 *
 * `GET /api/unidades` ya es un endpoint de buscador: la factory CRUD responde el
 * envelope que `BuscadorEntidad` espera (`{ data, page, pageSize, total }`),
 * acepta `?q=` sobre número, etiqueta y rol SII (`busqueda` declarada en la
 * ruta) y pagina con `?page=`. La emisión de `estado_cuenta`/`al_dia` pega acá
 * en vez de montar la primera página del padrón —eso hacía el `Select` con
 * `useUnidades()`: una unidad fuera de las primeras cien filas no se podía
 * certificar.
 */
const BUSCADOR_UNIDADES = "/api/unidades"

/**
 * Fila del buscador de personas (`GET /api/certificados-ct/buscar-personas`).
 *
 * La emisión se arma con esta fila —identidad y vínculos VIGENTES resueltos por
 * el servidor— y no con las colecciones truncadas del cliente: quien quedó fuera
 * de las primeras 100 filas del padrón igualmente se puede certificar.
 */
interface PersonaBuscada {
  id: string
  nombres: string
  apellidos: string
  rut: string
  /** Vínculos vigentes (`fechaFin: null`), con el rótulo `etiqueta numero`. */
  vinculos: { id: string; unidadId: string; unidad: string; rol: string }[]
}

/** Vínculo propio tal como lo sirve `GET /api/certificados-ct/mis-vinculos`. */
export interface VinculoPropio {
  id: string
  unidadId: string
  unidad: string
  personaId: string
  persona: string
  rut: string
  rol: string
  fechaInicio: string
}

/**
 * ¿La sesión sólo puede emitir su propio certificado de residencia?
 *
 * Es la marca del residente: la administración tiene las cuatro tipologías y el
 * comité ninguna. Cuando es `true` la pantalla se ANGOSTA —no hay padrón que
 * elegir ni configurar— porque el residente no puede leer `GET /api/vinculos`
 * (`mp`), `GET /api/pe/unidades` (`pe:bitacora`) ni `GET /api/configuracion`
 * (`cf`), y abrirle esas rutas sería cambiar una pantalla rota por una fuga.
 */
function esEmisionPropia(tipos: readonly CertificadoCT["tipo"][]): boolean {
  return tipos.length === 1 && tipos[0] === "residencia"
}

export default function CertificadosEmision({ tiposEmisibles }: CertificadosEmisionProps) {
  if (esEmisionPropia(tiposEmisibles)) return <CertificadosPropios />
  return <CertificadosGestion tiposEmisibles={tiposEmisibles} />
}

/** Carcasa común: título, banners de resultado y pestañas. */
function MarcoCertificados({
  error,
  okMsg,
  generar,
  historial,
}: {
  error: string | null
  okMsg: string | null
  generar: React.ReactNode
  historial: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><IconCertificate className="size-7 text-primary" /> Certificados</h1>
        <p className="text-muted-foreground">
          Documentación oficial con firma digitalizada del administrador embebida en el PDF e historial de emisión verificable.
        </p>
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {okMsg && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">{okMsg}</div>}

      <Tabs defaultValue="generar">
        <TabsList>
          <TabsTrigger value="generar">Generar</TabsTrigger>
          <TabsTrigger value="historial">Historial de Emisión</TabsTrigger>
        </TabsList>

        <TabsContent value="generar" className="flex flex-col gap-4">
          {generar}
        </TabsContent>

        <TabsContent value="historial">{historial}</TabsContent>
      </Tabs>
    </div>
  )
}

/** Historial de emisión (inmutable): la misma tabla para la gestión y el residente. */
function HistorialCertificados({
  certificados,
  pdfBusy,
  onDescargar,
  onEliminar,
  nombrePersona,
  refUnidad,
}: {
  certificados: CertificadoCT[]
  pdfBusy: string | null
  onDescargar: (c: CertificadoCT) => void
  onEliminar: (id: string) => void
  nombrePersona: (id?: string) => string
  refUnidad: (id?: string) => string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Historial de emisión</CardTitle>
        <CardDescription>Cada documento lleva folio CT y código de verificación único; el historial es inmutable.</CardDescription>
      </CardHeader>
      <CardContent>
        {certificados.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin certificados emitidos aún.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Folio</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Destino</th>
                  <th className="px-3 py-2">Solicitante</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Código verificación</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {[...certificados].reverse().map(c => (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{c.folio}</td>
                    <td className="px-3 py-2"><Badge variant="secondary">{TIPO_LABEL[c.tipo]}</Badge></td>
                    <td className="px-3 py-2">{c.personaId ? nombrePersona(c.personaId) : refUnidad(c.unidadId)}</td>
                    <td className="px-3 py-2">{c.solicitanteNombre}</td>
                    <td className="px-3 py-2">{c.fechaEmision}</td>
                    <td className="px-3 py-2 font-mono text-xs">{c.codigoVerificacion}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" disabled={pdfBusy === c.id} onClick={() => { onDescargar(c) }}>
                          <IconFileText className="size-4 mr-1" /> PDF
                        </Button>
                        {c.id.startsWith("test-") && (
                          <Button size="sm" variant="ghost" onClick={() => { onEliminar(c.id) }}><IconTrash className="size-4" /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Pantalla de la GESTIÓN (administración y comité): las cuatro tipologías, con
 * padrón, vínculos, liquidaciones y configuración —rutas que su rol sí puede leer.
 */
function CertificadosGestion({ tiposEmisibles }: CertificadosEmisionProps) {
  const { items: certificados, isLoading: cCertificados, create: crearCertificadoApi, remove: removeCertificadoApi } = useCertificadosCT()
  const { personas, total: totalPersonas, isLoading: cPersonas } = usePersonas()
  const { items: unidades, total: totalUnidades, isLoading: cUnidades } = useUnidades()
  const { vinculos, isLoading: cVinculos } = useVinculos()
  const { config, isLoading: cConfig } = useConfiguracion()
  const { vigente: periodoVigente, isLoading: cPeriodosDirectiva } = usePeriodosDirectiva()
  const { liquidaciones: liquidacionesPL, isLoading: cLiquidaciones } = useLiquidaciones()
  const configuracion = config

  // La tipología inicial tiene que ser una que el rol pueda emitir: si no, el
  // formulario arranca en una opción que la API va a rechazar.
  const [tipo, setTipo] = React.useState<CertificadoCT["tipo"]>(
    () => tiposEmisibles[0] ?? "residencia"
  )
  /**
   * La persona solicitante elegida en el buscador (F36). La fila COMPLETA —no sólo
   * el id— es la que arma el payload de emisión: el padrón del cliente
   * (`usePersonas`) trae la primera página de 100 y la persona buscada puede estar
   * fuera de ella.
   */
  const [personaElegida, setPersonaElegida] = React.useState<PersonaBuscada | null>(null)
  const personaId = personaElegida?.id ?? ""
  const [unidadId, setUnidadId] = React.useState("")
  /**
   * La unidad elegida en el buscador (T13). La FILA COMPLETA es la que arma el
   * rótulo del papel cuando la unidad queda fuera de la primera página del
   * padrón del cliente (donde `refUnidadUI` sólo tendría el id crudo).
   */
  const [unidadElegida, setUnidadElegida] = React.useState<Unidad | null>(null)
  const [liquidacionId, setLiquidacionId] = React.useState("")
  const [solicitanteNombre, setSolicitanteNombre] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [okMsg, setOkMsg] = React.useState<string | null>(null)
  const [pdfBusy, setPdfBusy] = React.useState<string | null>(null)

  const cargando = cCertificados || cPersonas || cUnidades || cVinculos || cConfig || cPeriodosDirectiva || cLiquidaciones
  if (cargando) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
  }

  const nombrePersona = (id?: string) => {
    if (!id) return "—"
    const p = personas.find(x => x.id === id)
    return p ? `${p.nombres} ${p.apellidos}` : id
  }
  const refUnidadUI = (id?: string) => {
    if (!id) return "—"
    const u = unidades.find(x => x.id === id)
    return u ? `${u.etiqueta} ${u.numero}` : id
  }
  /**
   * Rótulo de la unidad del certificado (T13): la FILA del buscador trae la
   * etiqueta y el número completos aunque la unidad quede fuera de la primera
   * página del padrón del cliente —donde `refUnidadUI` sólo tendría el id
   * crudo—. Si la unidad está en la página, la resolución es la de siempre.
   */
  const refUnidadElegida = (id?: string) => {
    if (unidadElegida && unidadElegida.id === id) return `${unidadElegida.etiqueta} ${unidadElegida.numero}`
    return refUnidadUI(id)
  }
  // Destinos válidos según tipología.
  const liquidacionesConfirmadas = liquidacionesPL.filter(l => l.estado === "confirmada")

  /**
   * Construye el payload de ALTA del CertificadoCT con la misma lógica de
   * negocio que la acción legacy `generarCertificadoCT` del store (resumen,
   * detalle por tipología, snapshot de directiva vigente) usando los datos de
   * las colecciones SWR; luego persiste vía POST /api/certificados-ct.
   *
   * El folio `CT-####` y el código de verificación NO se calculan acá: los
   * asigna el servidor en una transacción por comunidad (antes `max+1` sobre la
   * lista del cliente duplicaba folios entre pestañas).
   */
  const construirRegistro = (tipoActual: CertificadoCT["tipo"]): CertificadoCTAlta => {
    let unidadIdDestino = tipoActual !== "liquidacion_sueldo" && unidadId ? unidadId : undefined
    let personaIdDestino = tipoActual === "residencia" && personaId ? personaId : undefined
    let origenRef = unidadIdDestino ?? personaIdDestino ?? (tipoActual === "liquidacion_sueldo" ? liquidacionId : undefined)
    let resumen = ""
    let detalle: [string, string][] = []

    if (tipoActual === "residencia") {
      // F36: la persona sale de la FILA BUSCADA en el servidor, no del padrón
      // truncado del cliente. Los vínculos de la fila ya llegan vigentes
      // (`fechaFin: null`) desde la ruta, con el rótulo de la unidad.
      const persona = personaElegida
      const vinculoVigente = persona?.vinculos.find(v => v.unidadId === unidadId)
      if (!persona || !unidadId) throw new Error("El certificado de residencia exige persona y unidad.")
      if (!vinculoVigente) throw new Error("No se puede emitir: el solicitante no mantiene un vínculo activo en la unidad (VU).")
      origenRef = vinculoVigente.id
      resumen = `Se certifica que ${persona.nombres} ${persona.apellidos} (RUT ${persona.rut}) reside actualmente en ${vinculoVigente.unidad} según los registros de vinculación vigentes.`
      detalle = [
        ["Residente", `${persona.nombres} ${persona.apellidos}`],
        ["RUT", persona.rut],
        ["Unidad", vinculoVigente.unidad],
        ["Rol", vinculoVigente.rol],
      ]
    } else if (tipoActual === "estado_cuenta" || tipoActual === "al_dia") {
      if (!unidadId) throw new Error(`El certificado de ${tipoActual === "al_dia" ? "unidad al día" : "estado de cuenta"} exige una unidad.`)
      // T20: las tres cifras del papel («Cobros registrados», «Total cargado»,
      // «Saldo pendiente») y la decisión Al Día las calcula el SERVIDOR sobre
      // el conjunto completo de cobros FI de la unidad. El cliente ya no las
      // deriva de su pad paginado —con más de cien cobros el papel imprimía un
      // total más bajo que el real, sin declarar el recorte— y el gate de
      // saldo del servidor responde 409 verbatim cuando la unidad no califica.
      const propietario = vinculos.find(v => v.unidadId === unidadId && v.rol === "propietario" && !v.fechaFin)
      const nombreProp = propietario ? nombrePersona(propietario.personaId) : "—"
      if (tipoActual === "estado_cuenta") {
        resumen = `Estado de cuenta oficial de ${refUnidadElegida(unidadId)}: detalle de gastos comunes pagados, cuotas extraordinarias y fondos pendientes según el libro de Finanzas.`
      } else {
        resumen = `Se certifica que la unidad ${refUnidadElegida(unidadId)} NO registra deudas pendientes con la comunidad a la fecha de emisión.`
      }
      detalle = [
        ["Unidad", refUnidadElegida(unidadId)],
        ["Propietario", nombreProp],
      ]
    } else {
      const liq = liquidacionesPL.find(l => l.id === liquidacionId)
      if (!liq) throw new Error("El certificado de liquidación exige una liquidación de PL.")
      if (liq.estado !== "confirmada") {
        throw new Error("Solo liquidaciones confirmadas admiten certificado oficial (control tras cierre del mes).")
      }
      unidadIdDestino = undefined
      personaIdDestino = liq.trabajadorPersonaId
      origenRef = liq.id
      const nombreTrabajador = nombrePersona(liq.trabajadorPersonaId)
      resumen = `Se certifica la remuneración, descuentos legales y haberes de ${nombreTrabajador} correspondientes al periodo ${liq.periodo}, según la liquidación folio ${liq.folio} emitida por la administración.`
      detalle = [
        ["Trabajador", nombreTrabajador],
        ["Periodo", liq.periodo],
        ["Folio liquidación", liq.folio],
        ["Total imponible", `$${liq.totalImponible.toLocaleString("es-CL")}`],
        ["Total haberes", `$${liq.totalHaberes.toLocaleString("es-CL")}`],
        ["Total descuentos legales", `$${liq.totalDescuentos.toLocaleString("es-CL")}`],
        ["Líquido a pagar", `$${liq.liquidoAPagar.toLocaleString("es-CL")}`],
      ]
    }

    // Snapshot de la directiva vigente al emitir (trazabilidad histórica, no bloqueante).
    const firmantes = periodoVigente
      ? personas
          .filter(p => esMiembroDirectivaVigente(p, periodoVigente.id))
          .flatMap(p =>
            p.datosGobernanza
              ? [{ personaId: p.id, nombre: p.nombreCompleto, cargo: p.datosGobernanza.cargoDirectiva }]
              : []
          )
      : []

    return {
      id: generarId("ct"),
      tipo: tipoActual,
      ...(unidadIdDestino ? { unidadId: unidadIdDestino } : {}),
      ...(personaIdDestino ? { personaId: personaIdDestino } : {}),
      ...(origenRef ? { origenRef } : {}),
      solicitanteNombre: solicitanteNombre.trim(),
      resumen,
      detalle: detalle.map(([clave, valor]) => ({ clave, valor })),
      ...(configuracion?.firmaDigitalizadaUrl ? { firmaUrl: configuracion.firmaDigitalizadaUrl } : {}),
      ...(periodoVigente ? { directivaRef: { periodoId: periodoVigente.id, firmantes } } : {}),
      fechaEmision: hoyISO(),
    }
  }

  const generarYDescargar = async () => {
    setError(null); setOkMsg(null)
    if (!solicitanteNombre.trim()) {
      setError("Debe identificar al solicitante del certificado.")
      return
    }
    const firmaUrl = configuracion?.firmaDigitalizadaUrl
    if (firmaUrl && (/^data:/i.test(firmaUrl) || /^blob:/i.test(firmaUrl))) {
      setError("Media por referencia (D1): la firma digitalizada configurada en CF no puede estar embebida como base64/Blob.")
      return
    }
    let datosAlta: CertificadoCTAlta
    try {
      datosAlta = construirRegistro(tipo)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
      return
    }
    // Folio y código de verificación los pone el servidor: acá solo se valida el
    // resto del payload antes de emitir.
    const validacion = CertificadoCTAltaSchema.safeParse(datosAlta)
    if (!validacion.success) {
      setError(`Datos del certificado inválidos: ${validacion.error.issues[0]?.message ?? ""}`)
      return
    }
    const r = await crearCertificadoApi(datosAlta)
    if (!r.ok) {
      setError(r.error ?? "No se pudo emitir el certificado")
      return
    }
    const registro = r.registro
    if (!registro) {
      setError("El servidor no devolvió el certificado emitido. Revisá el Historial de Emisión antes de reintentar.")
      return
    }
    const descarga = await descargar(registro)
    setSolicitanteNombre("")
    if (!descarga.ok) {
      // El registro SÍ se emitió: se dice lo que pasó de verdad en vez de
      // confirmar una descarga que no ocurrió (auditoría "funciones de palo").
      setOkMsg(null)
      setError(
        `Certificado ${registro.folio} emitido, pero la descarga del PDF falló (${descarga.error}). Reintentá la descarga desde el Historial de Emisión.`
      )
      return
    }
    setOkMsg(`Certificado ${registro.folio} emitido y firmado. Código de verificación: ${registro.codigoVerificacion}`)
  }

  /** Genera y descarga el PDF; devuelve si la descarga ocurrió de verdad. */
  const descargar = async (
    c: CertificadoCT
  ): Promise<{ ok: boolean; error?: string }> => {
    setPdfBusy(c.id)
    try {
      const doc = await documentoCertificadoPDF({
        tipo: TIPO_LABEL[c.tipo],
        titulo: TIPO_LABEL[c.tipo],
        folio: c.folio,
        codigoVerificacion: c.codigoVerificacion,
        fechaEmision: c.fechaEmision,
        parrafos: [c.resumen],
        detalle: c.detalle.map(d => [d.clave, d.valor] as [string, string]),
        solicitanteNombre: c.solicitanteNombre,
        config: configuracion as ConfiguracionGlobal,
      })
      const { descargarPdf: descargarArchivo } = await import("@/lib/pdf-utils")
      await descargarArchivo(doc, `certificado-${c.folio}.pdf`)
      setOkMsg(`PDF ${c.folio} generado con firma embebida.`)
      return { ok: true }
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e)
      setError(`No se pudo generar el PDF: ${motivo}`)
      return { ok: false, error: motivo }
    } finally {
      setPdfBusy(null)
    }
  }

  const generar = tiposEmisibles.length === 0 ? (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Emisión reservada a la administración</CardTitle>
        <CardDescription>
          Tu rol puede consultar el historial de emisión, pero no emitir certificados: los
          certificados sobre el estado de deudas de las unidades y la acreditación de
          copropietario hábil son actos del administrador (Ley 21.442, artículo 20 N° 4 y
          artículo 15).
        </CardDescription>
      </CardHeader>
    </Card>
  ) : (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nuevo certificado</CardTitle>
        <CardDescription>El sistema valida los requisitos por tipología antes de emitir (VU activo, saldo Al Día ≤ 0, liquidación confirmada).</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Tipo de certificado *</Label>
          <Select value={tipo} onValueChange={v => { setTipo(v as CertificadoCT["tipo"]); setPersonaElegida(null); setUnidadElegida(null); setUnidadId(""); setLiquidacionId("") }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {tiposEmisibles.map(t => (
                <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {tipo === "residencia" && (
          <>
            <div className="flex flex-col gap-1.5">
              {/* F36: la persona se BUSCA en el servidor (padrón completo, con total
                  declarado) en vez de ofrecerse en una lista truncada a 100. */}
              <BuscadorEntidad<PersonaBuscada>
                etiqueta="Persona solicitante *"
                url={BUSCADOR_PERSONAS}
                placeholder="Buscar por nombre o RUT…"
                idDe={p => p.id}
                etiquetaDe={p => `${p.nombres} ${p.apellidos}`}
                seleccion={personaElegida ? { id: personaElegida.id, etiqueta: `${personaElegida.nombres} ${personaElegida.apellidos}` } : null}
                onSeleccion={(_seleccion, fila) => setPersonaElegida(fila)}
                vacio="Sin personas con vínculo vigente para esa búsqueda."
              />
              <p className="text-xs text-muted-foreground">Solo personas con vínculo vigente en alguna unidad; la búsqueda consulta el padrón completo de la comunidad.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Unidad *</Label>
              <Select value={unidadId || undefined} onValueChange={setUnidadId}>
                <SelectTrigger><SelectValue placeholder="Selecciona unidad" /></SelectTrigger>
                <SelectContent>
                  {(personaElegida?.vinculos ?? [])
                    // Un vínculo por unidad: si la persona tuviera dos vínculos vigentes
                    // en la misma unidad, el primero es el que certifica (el mismo que
                    // encuentra la búsqueda del vínculo al emitir).
                    .filter((v, i, lista) => lista.findIndex(x => x.unidadId === v.unidadId) === i)
                    .map(v => (
                      <SelectItem key={v.id} value={v.unidadId}>{v.unidad}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Las unidades salen de los vínculos vigentes de la persona elegida.</p>
            </div>
          </>
        )}

        {(tipo === "estado_cuenta" || tipo === "al_dia") && (
          <div className="flex flex-col gap-1.5">
            {/* T13/S10: la unidad se BUSCA en el servidor (padrón completo, con
                total declarado) en vez de ofrecerse en una lista truncada a 100.
                El endpoint es el padrón entero de unidades con búsqueda por
                número, etiqueta y rol SII, y responde el envelope del buscador. */}
            <BuscadorEntidad<Unidad>
              etiqueta="Unidad *"
              url={BUSCADOR_UNIDADES}
              placeholder="Buscar por etiqueta, número o rol SII…"
              idDe={u => u.id}
              etiquetaDe={u => `${u.etiqueta} ${u.numero}`}
              seleccion={unidadElegida ? { id: unidadElegida.id, etiqueta: `${unidadElegida.etiqueta} ${unidadElegida.numero}` } : null}
              onSeleccion={(_seleccion, fila) => { setUnidadElegida(fila ?? null); setUnidadId(fila?.id ?? "") }}
              vacio="Sin unidades para esa búsqueda."
            />
            {tipo === "al_dia" && (
              <p className="text-xs text-muted-foreground">
                La condición Al Día la evalúa el servidor sobre el libro completo de Finanzas de la unidad al emitir; si registra deuda, la emisión se rechaza mostrando el monto pendiente.
              </p>
            )}
          </div>
        )}

        {tipo === "liquidacion_sueldo" && (
          <div className="flex flex-col gap-1.5">
            <Label>Liquidación confirmada *</Label>
            <Select value={liquidacionId || undefined} onValueChange={setLiquidacionId}>
              <SelectTrigger><SelectValue placeholder="Selecciona liquidación PL" /></SelectTrigger>
              <SelectContent>
                {liquidacionesConfirmadas.length === 0 && <SelectItem value="-" disabled>Sin liquidaciones confirmadas</SelectItem>}
                {liquidacionesConfirmadas.map(l => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.folio} · {nombrePersona(l.trabajadorPersonaId)} · {l.periodo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Control: solo documentos confirmados tras el cierre del mes.</p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>Solicitante *</Label>
          <Input value={solicitanteNombre} onChange={e => setSolicitanteNombre(e.target.value)} placeholder="Nombre de quien solicita" />
        </div>

        <div className="md:col-span-2">
          <Button onClick={() => { void generarYDescargar() }} disabled={!solicitanteNombre.trim()}>
            <IconFileText className="size-4 mr-1" /> Generar certificado PDF firmado
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <MarcoCertificados
      error={error}
      okMsg={okMsg}
      generar={generar}
      historial={
        <div className="flex flex-col gap-3">
          {/* S10/T13 — el historial resuelve sus referencias con los padrones del
              cliente (personas y unidades, `pageSize=100`): la fila cuya persona
              o unidad quedó fuera de la primera página muestra el id crudo. La
              resolución no se rediseña; el recorte se declara con el total que
              reporta el servidor en el envelope. */}
          <AvisoTruncamiento mostrados={personas.length} total={totalPersonas} />
          <AvisoTruncamiento mostrados={unidades.length} total={totalUnidades} />
          <HistorialCertificados
            certificados={certificados}
            pdfBusy={pdfBusy}
            onDescargar={c => { void descargar(c) }}
            onEliminar={id => { void removeCertificadoApi(id) }}
            nombrePersona={nombrePersona}
            refUnidad={refUnidadUI}
          />
        </div>
      }
    />
  )
}

/**
 * Los vínculos PROPIOS del actor, desde la fuente auto-acotada.
 *
 * No se usa `useVinculos` (exige `mp`) ni `useUnidades` (exige `pe:bitacora`):
 * esa es justamente la razón de la ruta nueva. El servidor resuelve el sujeto de
 * la sesión y devuelve sólo sus vínculos vigentes.
 */
function useMisVinculos(): {
  vinculos: VinculoPropio[]
  isLoading: boolean
  error: string | null
} {
  const [estado, setEstado] = React.useState<{
    vinculos: VinculoPropio[]
    isLoading: boolean
    error: string | null
  }>({ vinculos: [], isLoading: true, error: null })

  React.useEffect(() => {
    let vigente = true
    void (async () => {
      try {
        const res = await fetch(MIS_VINCULOS, { headers: { accept: "application/json" } })
        const cuerpo = (await res.json().catch(() => null)) as
          | { data?: VinculoPropio[]; error?: string }
          | null
        if (!vigente) return
        if (!res.ok) {
          setEstado({
            vinculos: [],
            isLoading: false,
            error: cuerpo?.error ?? `Error ${res.status} al consultar tus vínculos.`,
          })
          return
        }
        setEstado({ vinculos: cuerpo?.data ?? [], isLoading: false, error: null })
      } catch {
        if (vigente) {
          setEstado({ vinculos: [], isLoading: false, error: "Sin conexión con el servidor." })
        }
      }
    })()
    return () => {
      vigente = false
    }
  }, [])

  return estado
}

/**
 * Descarga el papel servido por el servidor (`GET /api/certificados-ct/[id]/pdf`).
 *
 * El residente no puede compilar el PDF en el navegador: el membrete y la firma
 * viven en CF (`cf`) y el residente no lee la configuración de la comunidad. El
 * binario se pide como blob —así un 404/409 se puede contar como lo que pasó, en
 * vez de navegar a un JSON— y se dispara la descarga con el nombre del módulo.
 */
async function descargarDesdeServidor(
  c: CertificadoCT
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/certificados-ct/${encodeURIComponent(c.id)}/pdf`, {
      headers: { accept: "application/pdf" },
      cache: "no-store",
    })
    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
      return {
        ok: false,
        error: cuerpo?.error ?? `Error ${res.status} al descargar el certificado.`,
      }
    }
    const blob = await res.blob()
    if (blob.size === 0) return { ok: false, error: "El servidor devolvió un documento vacío." }
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement("a")
    enlace.href = url
    enlace.download = `certificado-${c.folio}.pdf`
    document.body.appendChild(enlace)
    enlace.click()
    enlace.remove()
    setTimeout(() => URL.revokeObjectURL(url), 40_000)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Pantalla del RESIDENTE (F34): emite su certificado de residencia y descarga el
 * papel, sin abrirle ninguna ruta al rol.
 *
 * La pantalla es angosta a propósito. El residente no elige lo que el servidor ya
 * sabe: si tiene UN vínculo vigente hay un solo botón, sin selects. Si tiene más
 * de uno, el selector ofrece SÓLO sus vínculos —traídos de la fuente propia, nunca
 * del padrón de la comunidad— porque la residencia es un hecho de una unidad y
 * tampoco puede elegir por él. La administración conserva el camino de gestión.
 */
function CertificadosPropios() {
  const { items: certificados, isLoading: cCertificados, create: crearCertificadoApi, remove: removeCertificadoApi } = useCertificadosCT()
  const { vinculos, isLoading: cVinculos, error: eVinculos } = useMisVinculos()

  const [vinculoId, setVinculoId] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [okMsg, setOkMsg] = React.useState<string | null>(null)
  const [pdfBusy, setPdfBusy] = React.useState<string | null>(null)
  const [emitiendo, setEmitiendo] = React.useState(false)

  if (cCertificados || cVinculos) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
  }

  // Con un solo vínculo no hay elección: es SU unidad y SU persona.
  const vinculo = vinculos.length === 1 ? vinculos[0] : vinculos.find(v => v.id === vinculoId)

  const nombrePersona = (id?: string) => {
    if (!id) return "—"
    const v = vinculos.find(x => x.personaId === id)
    return v?.persona || id
  }
  const refUnidad = (id?: string) => {
    if (!id) return "—"
    const v = vinculos.find(x => x.unidadId === id)
    return v?.unidad || id
  }

  const descargar = async (c: CertificadoCT) => {
    setPdfBusy(c.id)
    setError(null)
    setOkMsg(null)
    const descarga = await descargarDesdeServidor(c)
    setPdfBusy(null)
    if (!descarga.ok) {
      setError(`Certificado ${c.folio}: no se pudo descargar el PDF (${descarga.error}).`)
      return
    }
    setOkMsg(`PDF ${c.folio} descargado.`)
  }

  const emitirYDescargar = async () => {
    setError(null); setOkMsg(null)
    if (!vinculo) {
      setError("Elegí la unidad del certificado.")
      return
    }
    // El resumen y el detalle salen de los datos que el SERVIDOR devolvió para SU
    // vínculo: el residente no puede escribir a mano el nombre ni la unidad que el
    // papel certifica, y el servidor vuelve a validar el anclaje al emitir.
    const datos: CertificadoCTAlta = {
      id: generarId("ct"),
      tipo: "residencia",
      unidadId: vinculo.unidadId,
      personaId: vinculo.personaId,
      origenRef: vinculo.id,
      solicitanteNombre: vinculo.persona,
      resumen: `Se certifica que ${vinculo.persona} (RUT ${vinculo.rut}) reside actualmente en ${vinculo.unidad} según los registros de vinculación vigentes.`,
      detalle: [
        { clave: "Residente", valor: vinculo.persona },
        { clave: "RUT", valor: vinculo.rut },
        { clave: "Unidad", valor: vinculo.unidad },
        { clave: "Rol", valor: vinculo.rol },
      ],
      fechaEmision: hoyISO(),
    }
    const validacion = CertificadoCTAltaSchema.safeParse(datos)
    if (!validacion.success) {
      setError(`Datos del certificado inválidos: ${validacion.error.issues[0]?.message ?? ""}`)
      return
    }
    setEmitiendo(true)
    const r = await crearCertificadoApi(datos)
    setEmitiendo(false)
    if (!r.ok) {
      setError(r.error ?? "No se pudo emitir el certificado")
      return
    }
    const registro = r.registro
    if (!registro) {
      setError("El servidor no devolvió el certificado emitido. Revisá el Historial de Emisión antes de reintentar.")
      return
    }
    const descarga = await descargarDesdeServidor(registro)
    if (!descarga.ok) {
      // El registro SÍ se emitió: se dice lo que pasó de verdad en vez de confirmar
      // una descarga que no ocurrió.
      setError(
        `Certificado ${registro.folio} emitido, pero la descarga del PDF falló (${descarga.error}). Reintentá la descarga desde el Historial de Emisión.`
      )
      return
    }
    setOkMsg(`Certificado ${registro.folio} emitido y descargado. Código de verificación: ${registro.codigoVerificacion}`)
  }

  const generar = vinculos.length === 0 ? (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sin vínculo vigente</CardTitle>
        <CardDescription>
          {eVinculos ??
            "No registrás un vínculo vigente con una unidad de esta comunidad, así que no hay residencia que certificar. Si te mudaste hace poco, pedile a la administración que registre tu vínculo."}
        </CardDescription>
      </CardHeader>
    </Card>
  ) : (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{TIPO_LABEL.residencia}</CardTitle>
        <CardDescription>
          Se emite sobre tu vínculo vigente: la persona y la unidad las resuelve el sistema, no hace
          falta que las elijas. La administración continúa emitiendo los certificados de deuda
          (Ley 21.442, artículos 20 N° 4 y 15).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {vinculos.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <Label>Unidad del certificado *</Label>
            <Select value={vinculoId} onValueChange={setVinculoId}>
              <SelectTrigger><SelectValue placeholder="Selecciona tu unidad" /></SelectTrigger>
              <SelectContent>
                {vinculos.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.unidad}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Sólo aparecen tus vínculos vigentes: tenés más de uno y el certificado acredita uno.
            </p>
          </div>
        )}

        {vinculo && (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex flex-col">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Residente</dt>
              <dd>{vinculo.persona}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">RUT</dt>
              <dd>{vinculo.rut}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Unidad</dt>
              <dd>{vinculo.unidad}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Rol</dt>
              <dd>{vinculo.rol}</dd>
            </div>
          </dl>
        )}

        <div>
          <Button onClick={() => { void emitirYDescargar() }} disabled={!vinculo || emitiendo}>
            <IconFileText className="size-4 mr-1" /> Generar certificado PDF firmado
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <MarcoCertificados
      error={error}
      okMsg={okMsg}
      generar={generar}
      historial={
        <HistorialCertificados
          certificados={certificados}
          pdfBusy={pdfBusy}
          onDescargar={c => { void descargar(c) }}
          onEliminar={id => { void removeCertificadoApi(id) }}
          nombrePersona={nombrePersona}
          refUnidad={refUnidad}
        />
      }
    />
  )
}
