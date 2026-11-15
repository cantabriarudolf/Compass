"use client"

import * as React from "react"
import { usePlantillasCO, useEnviosCO, useMensajesBuzonCO } from "@/lib/api/use-co"
import { useUnidades } from "@/lib/api/use-unidades"
import { useMacroSectores } from "@/lib/api/use-macro-sectores"
import { useMicroSectores } from "@/lib/api/use-micro-sectores"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  IconSpeakerphone,
  IconSend,
  IconTemplate,
  IconInbox,
  IconPlus,
  IconPencil,
  IconTrash,
  IconCheck,
} from "@tabler/icons-react"
import { MetricaLecturas } from "@/components/co/metrica-lecturas"
import { totalesDeEnvio } from "@/components/co/totales-envio"
import { BuscadorEntidad, type EntidadSeleccion } from "@/components/buscador-entidad"
import { AvisoTruncamiento } from "@/components/pe/aviso-truncamiento"
import type { EstadoBuzonCO, MensajeBuzonCO, PlantillaCO } from "@/lib/schemas"
import { generarId } from "@/lib/id-utils"
import { hoyISO } from "@/lib/date-utils"



const CLASIFICACIONES = [
  { valor: "felicitacion", label: "1. Felicitaciones", desc: "Reconoce el buen desempeño del personal o acciones positivas." },
  { valor: "sugerencia", label: "2. Sugerencias", desc: "Propuestas para mejorar procesos, espacios o convivencia." },
  { valor: "reclamo", label: "3. Reclamos", desc: "Reporte de problemas, fallas de servicio o incumplimientos." },
] as const

const ESTADO_BUZON_LABEL: Record<EstadoBuzonCO, string> = {
  recibido: "Recibido",
  en_gestion: "En Gestión",
  resuelto: "Resuelto",
  cerrado: "Cerrado",
}

const CATEGORIA_LABEL: Record<string, string> = {
  comunidad: "Comunidad",
  urgente: "Urgente",
  cobranza: "Cobranza",
  informacion: "Información",
  onboarding: "Onboarding",
}

/**
 * S10 — el buscador de vecinos del buzón, resuelto en el servidor.
 *
 * El reportante se ofrecía con `usePersonas()` (`/api/personas?pageSize=100`): una
 * persona fuera de las primeras cien filas del padrón no se podía elegir.
 */
const BUSCADOR_REPORTANTE = "/api/comunicacion/buscar-personas"

/** Fila de `GET /api/comunicacion/buscar-personas`. */
interface PersonaBuscada {
  id: string
  nombres: string
  apellidos: string
  rut: string
}

/**
 * T14 (S10) — el alcance del envío masivo se resuelve en el SERVIDOR.
 *
 * Hasta hoy la pantalla cruzaba TRES colecciones paginadas a cien (personas,
 * vínculos y unidades) en un `useMemo` del cliente: una comunidad con más de
 * cien filas recibía el envío incompleto y nadie se entera. El endpoint
 * (`app/api/co/alcance-masivo`) aplica las mismas reglas sobre la comunidad
 * completa; esta pantalla consulta, camina sus páginas hasta el `total` que el
 * servidor declara y muestra su error verbatim.
 */
const ALCANCE_MASIVO = "/api/co/alcance-masivo"

/**
 * Tope de páginas que la pantalla camina sola (200 × 100 = 20.000 filas). Si una
 * comunidad lo superara, el recorte del TRANSPORTE se declara con el `total` del
 * servidor (AvisoTruncamiento); la resolución del alcance nunca se recorta.
 */
const MAXIMO_PAGINAS_ALCANCE = 200

/** Fila de `GET /api/co/alcance-masivo`. */
interface FilaAlcance {
  personaId: string
  unidadId?: string
  personaNombre: string
}

/** Envelope paginado del endpoint del alcance. */
interface ColeccionAlcance {
  data?: FilaAlcance[]
  page: number
  pageSize: number
  total: number
}

/** Error de una página del alcance, con el estado HTTP que lo originó: el
 *  reintento decide con él (sólo 5xx reintentan) y el mensaje viaja verbatim igual. */
class ErrorAlcance extends Error {
  readonly status?: number
  constructor(mensaje: string, status?: number) {
    super(mensaje)
    this.name = "ErrorAlcance"
    this.status = status
  }
}

/** Consulta una página del alcance; el error del servidor viaja verbatim.
 *
 *  T16 (R3-error-sin-reintento): UN reintento acotado por página, sólo para error
 *  de red (el `TypeError` que lanza `fetch`) o respuesta 5xx — una desconexión de
 *  un instante no tiene que abortar la caminata de un envío masivo. El reintento
 *  usa la MISMA señal (`AbortController` de la caminata) y el segundo intento no
 *  se vuelve a envolver: si también falla, el error sube tal cual y el mensaje del
 *  servidor llega verbatim a la pantalla. Un 4xx no reintenta: es una respuesta
 *  definitiva, no una falla de transporte.
 */
async function pedirAlcance(url: string, signal: AbortSignal): Promise<ColeccionAlcance> {
  const pedir = async (): Promise<ColeccionAlcance> => {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal })
    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
      throw new ErrorAlcance(
        cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`,
        res.status
      )
    }
    return (await res.json()) as ColeccionAlcance
  }
  try {
    return await pedir()
  } catch (e) {
    // Ni el abort ni un 4xx reintentan: el abort ya no es un pedido vigente y el 4xx
    // es definitivo. El reintento es UNO — el segundo intento no se envuelve.
    const reintentable =
      !signal.aborted &&
      (e instanceof TypeError || (e instanceof ErrorAlcance && (e.status ?? 0) >= 500))
    if (!reintentable) throw e
    return pedir()
  }
}

/**
 * consola-comunicacion — consola de administración de CO (redacción, plantillas y
 * buzón).
 * publicación-portal", "co/plantillas")
 *
 * La pestaña «Biblioteca de Documentos Comunales» se retiró (F35 serie A, T11) y su
 * tabla `documentos_co` también (A5, con sus filas migradas a `Documento`). El
 * owner decidió que el Archivo de Documentos (`/comunidad/archivo`) absorbe la
 * biblioteca, porque dos listados de documentos en la UI son dos verdades. La
 * lectura de un documento del archivo se audita ahí (`AD_DOC_APERTURA`).
 *
 * Solo la renderiza `page.tsx` cuando el rol resuelto en el servidor es
 * administrador (change co-lectura-residente, D1): el `<Select>` «Vista» que
 * gobernaba el render desde el cliente fue eliminado — la vista no es una
 * preferencia del usuario sino una decisión de autorización server-side. El
 * residente y el comité reciben `components/co/bandeja-residente.tsx`.
 */
export function ConsolaComunicacionCO() {
  const { items: unidades, total: totalUnidades, isLoading: cUnidades } = useUnidades()
  const { items: macroSectores, isLoading: cMacro } = useMacroSectores()
  const { items: microSectores, isLoading: cMicro } = useMicroSectores()
  const { items: plantillasCO, isLoading: cPlantillas, create: crearPlantillaApi, update: actualizarPlantillaApi, remove: eliminarPlantillaApi } = usePlantillasCO()
  const { items: enviosCO, isLoading: cEnvios, create: crearEnvioApi } = useEnviosCO()
  const { items: mensajesBuzonCO, isLoading: cBuzon, create: crearMensajeApi, update: actualizarMensajeApi } = useMensajesBuzonCO()
  // TODO: migrar eventos de auditoría (lecturas de envío, notificaciones email_simulado) a endpoints de API en próxima fase.

  const [error, setError] = React.useState<string | null>(null)
  const [exito, setExito] = React.useState<string | null>(null)

  // --- Redacción masiva ---
  const [plantillaSel, setPlantillaSel] = React.useState<string>("")
  const [asunto, setAsunto] = React.useState("")
  const [cuerpo, setCuerpo] = React.useState("")
  const [rolesFiltro, setRolesFiltro] = React.useState<string[]>(["propietario"])
  const [macroSel, setMacroSel] = React.useState<string>("todos")
  const [microSel, setMicroSel] = React.useState<string>("todos")
  const [unidadSel, setUnidadSel] = React.useState<string>("todas")
  // T14 — el alcance consultado al servidor: filas resueltas, `total` declarado,
  // estado de carga y error verbatim del endpoint.
  const [alcance, setAlcance] = React.useState<{ filas: FilaAlcance[]; total: number }>({
    filas: [],
    total: 0,
  })
  const [cargandoAlcance, setCargandoAlcance] = React.useState(true)
  const [errorAlcance, setErrorAlcance] = React.useState<string | null>(null)

  // --- Buzón ---
  const [clasificacion, setClasificacion] = React.useState<"felicitacion" | "sugerencia" | "reclamo">("felicitacion")
  const [reportanteSel, setReportanteSel] = React.useState<EntidadSeleccion | null>(null)
  const [buzonAsunto, setBuzonAsunto] = React.useState("")
  const [buzonCuerpo, setBuzonCuerpo] = React.useState("")
  const [visibilidadComite, setVisibilidadComite] = React.useState(false)
  const [respondiendo, setRespondiendo] = React.useState<MensajeBuzonCO | null>(null)
  const [respuestaTexto, setRespuestaTexto] = React.useState("")
  const [respuestaCompromiso, setRespuestaCompromiso] = React.useState("")

  // --- Plantillas ---
  const [editandoPlantilla, setEditandoPlantilla] = React.useState<PlantillaCO | null>(null)

      const cargando = cUnidades || cMacro || cMicro || cPlantillas || cEnvios || cBuzon

      const microsVisibles = macroSel === "todos" ? microSectores : microSectores.filter(m => m.macroSectorId === macroSel)
      const unidadesVisibles = microSel === "todos" ? unidades : unidades.filter(u => u.microSectorId === microSel)

      // T14 (S10) — el alcance lo resuelve el SERVIDOR. Hasta acá un `useMemo`
      // cruzaba TRES colecciones paginadas a cien (personas, vínculos y unidades):
      // el alcance mostrado era el alcance enviado, así que una comunidad con más
      // de cien filas recibía el envío incompleto. El endpoint aplica las mismas
      // reglas sobre la comunidad completa; acá sólo se consulta y se caminan sus
      // páginas hasta agotar el `total` declarado, para que el payload del envío
      // siga siendo la lista COMPLETA: el transporte pagina, la resolución no.
      // Una respuesta de un pedido anterior no se aplica (aborta y se compara la
      // clave del filtro), igual que los hooks con `keepPreviousData`.
      const claveVigente = React.useRef("")
      React.useEffect(() => {
        const clave = JSON.stringify([rolesFiltro, macroSel, microSel, unidadSel])
        claveVigente.current = clave
        const controlador = new AbortController()
        const query = new URLSearchParams()
        if (rolesFiltro.length > 0) query.set("roles", rolesFiltro.join(","))
        if (macroSel !== "todos") query.set("macro", macroSel)
        if (microSel !== "todos") query.set("micro", microSel)
        if (unidadSel !== "todas") query.set("unidad", unidadSel)
        const urlDe = (page: number): string => {
          const conPagina = new URLSearchParams(query)
          conPagina.set("page", String(page))
          return `${ALCANCE_MASIVO}?${conPagina.toString()}`
        }
        setAlcance({ filas: [], total: 0 })
        setErrorAlcance(null)
        setCargandoAlcance(true)
        void (async () => {
          const desactualizado = () =>
            controlador.signal.aborted || claveVigente.current !== clave
          try {
            const primera = await pedirAlcance(urlDe(1), controlador.signal)
            if (desactualizado()) return
            // T16 (R3-walk-duplicados): dos páginas pueden solaparse y empujar la MISMA
            // fila dos veces — el mismo destinatario recibiría el envío dos veces. La
            // caminata deduplica por `personaId|unidadId` conservando la primera
            // aparición, y corta en la página que no aporta nada nuevo (un servidor
            // que repitiera la misma página no produce una caminata de 200 pedidos).
            const filas: FilaAlcance[] = []
            const vistas = new Set<string>()
            const agregar = (nuevas: FilaAlcance[]): void => {
              for (const f of nuevas) {
                const claveFila = `${f.personaId}|${f.unidadId ?? ""}`
                if (vistas.has(claveFila)) continue
                vistas.add(claveFila)
                filas.push(f)
              }
            }
            agregar(primera.data ?? [])
            const total = primera.total ?? filas.length
            let pagina = primera.page ?? 1
            while (filas.length < total && pagina < MAXIMO_PAGINAS_ALCANCE) {
              const siguiente = await pedirAlcance(urlDe(pagina + 1), controlador.signal)
              if (desactualizado()) return
              pagina += 1
              const filasSiguientes = siguiente.data ?? []
              if (filasSiguientes.length === 0) break
              const antes = filas.length
              agregar(filasSiguientes)
              if (filas.length === antes) break
            }
            // T16 (R3-orden-locale): el orden del alcance heredaba la colación de la
            // base (en SQLite el orden binario deja los nombres acentuados al final:
            // «Á» es U+00C1, mayor que «Z»). Ordenar con la collation española sobre
            // el nombre hace la vista previa —y el orden del envío— predecible.
            filas.sort((a, b) => a.personaNombre.localeCompare(b.personaNombre, "es"))
            setAlcance({ filas, total })
          } catch (e) {
            if (desactualizado()) return
            setAlcance({ filas: [], total: 0 })
            // El mensaje del servidor viaja verbatim; sólo la desconexión usa el
            // literal de red que ya es convención del repo (`lib/api/use-vinculos`).
            setErrorAlcance(e instanceof Error ? e.message : "Sin conexión con el servidor.")
          } finally {
            if (!desactualizado()) setCargandoAlcance(false)
          }
        })()
        return () => controlador.abort()
      }, [rolesFiltro, macroSel, microSel, unidadSel])

      // El payload del envío conserva EXACTAMENTE el shape de antes
      // (`{personaId, unidadId}`); `personaNombre` es sólo para la vista previa.
      const destinatarios = React.useMemo(
        () => alcance.filas.map(f => ({ personaId: f.personaId, unidadId: f.unidadId })),
        [alcance.filas]
      )

      const cargarPlantilla = (id: string) => {
        setPlantillaSel(id)
        const pl = plantillasCO.find(p => p.id === id)
        if (pl) {
          setAsunto(pl.asunto)
          setCuerpo(pl.cuerpo)
        }
      }

      const enviarMasivo = async () => {
        setError(null); setExito(null)
        if (!asunto.trim() || !cuerpo.trim()) { setError("El asunto y el cuerpo son obligatorios."); return }
        if (destinatarios.length === 0) { setError("Los filtros no resuelven ningún destinatario."); return }
        const r = await crearEnvioApi({
          id: generarId("env"),
          asunto,
          cuerpo,
          plantillaId: plantillaSel || undefined,
          destinatarios,
          fechaEnvio: new Date().toISOString().slice(0, 10),
          lecturas: [],
        })
        if (!r.ok) { setError(r.error ?? "No se pudo enviar."); return }
        setExito(`Envío masivo a ${destinatarios.length} destinatario(s) materializado en bandeja email_simulado.`)
      }

      // La lectura la registra el DESTINATARIO al abrir el mensaje
      // (POST /api/co/envios/[id]/leer). El administrador ya no puede
      // "simular" lecturas: el badge cuenta solo lo que pasó de verdad.

      const enviarBuzon = async () => {
        setError(null); setExito(null)
        if (!buzonAsunto.trim() || !buzonCuerpo.trim()) { setError("Asunto y mensaje son obligatorios."); return }
        // S10 — sin selección no se indica persona. Acá había un `|| personas[0]?.id`:
        // elegir «La Administración» caía en la PRIMERA fila del padrón truncado y el
        // servidor —que sólo honra la persona indicada si es de la comunidad y el rol es
        // administrador (`resolverReportante`)— la aceptaba, así que el reclamo quedaba a
        // nombre de un vecino que nadie eligió. Sin indicación, el servidor resuelve la
        // identidad de la sesión: el nombre y el `personaId` que viajan desde acá son sólo
        // la etiqueta que se ve mientras tanto, nunca la verdad almacenada.
        const reportante = reportanteSel?.id ?? null
        // Folio BUZ-#### único por construcción (misma regla que la acción legacy del store).
        const numeros = mensajesBuzonCO
          .map(m => Number.parseInt(m.folio.replace(/^BUZ-/, ""), 10))
          .filter(n => Number.isFinite(n))
        const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
        const r = await crearMensajeApi({
          id: generarId("buz"),
          folio: `BUZ-${String(siguiente).padStart(4, "0")}`,
          clasificacion,
          ...(reportante ? { reportantePersonaId: reportante } : {}),
          reportanteNombre: reportanteSel?.etiqueta ?? "Administración",
          asunto: buzonAsunto,
          cuerpo: buzonCuerpo,
          visibilidadComite,
          fechaIngreso: new Date().toISOString().slice(0, 10),
          estado: "recibido",
          respuestas: [],
        })
        if (!r.ok) { setError(r.error ?? "No se pudo registrar."); return }
        setBuzonAsunto(""); setBuzonCuerpo(""); setVisibilidadComite(false)
        setExito("Mensaje ingresado al buzón con folio de seguimiento.")
      }

      const responderTicket = async () => {
        if (!respondiendo) return
        if (!respuestaTexto.trim()) { setError("La respuesta no puede estar vacía."); return }
        // Push a respuestas + auto-transición recibido→en_gestion (paridad con responderMensajeBuzonCO del store).
        const r = await actualizarMensajeApi(respondiendo.id, {
          estado: respondiendo.estado === "recibido" ? "en_gestion" : respondiendo.estado,
          respuestas: [
            ...respondiendo.respuestas,
            {
              id: generarId("resp"),
              autor: "Administración",
              texto: respuestaTexto,
              compromisos: respuestaCompromiso || undefined,
              fecha: hoyISO(),
            },
          ],
        })
        if (!r.ok) setError(r.error ?? "No se pudo responder.")
        else setRespondiendo(null)
        setRespuestaTexto(""); setRespuestaCompromiso("")
      }

      // Transiciones válidas del ciclo del ticket (paridad con cambiarEstadoBuzonCO del store).
      const TRANSICIONES_BUZON: Record<string, EstadoBuzonCO[]> = {
        recibido: ["en_gestion"],
        en_gestion: ["resuelto", "cerrado"],
        resuelto: ["cerrado"],
        cerrado: [],
      }

      const cambiarEstado = async (id: string, estado: EstadoBuzonCO) => {
        const mensaje = mensajesBuzonCO.find(m => m.id === id)
        if (mensaje && !TRANSICIONES_BUZON[mensaje.estado]?.includes(estado)) {
          setError(`Transición inválida: un ticket ${mensaje.estado} no puede pasar a ${estado}.`)
          return
        }
        const r = await actualizarMensajeApi(id, { estado })
        if (!r.ok) setError(r.error ?? "No se pudo cambiar el estado.")
      }

      const guardarPlantilla = async () => {
        if (!editandoPlantilla) return
        const existente = plantillasCO.some(p => p.id === editandoPlantilla.id)
        const r = existente
          ? await actualizarPlantillaApi(editandoPlantilla.id, { nombre: editandoPlantilla.nombre, categoria: editandoPlantilla.categoria, asunto: editandoPlantilla.asunto, cuerpo: editandoPlantilla.cuerpo })
          : await crearPlantillaApi(editandoPlantilla)
        if (!r.ok) { setError(r.error ?? "No se pudo guardar la plantilla."); return }
        setEditandoPlantilla(null)
      }

      // Privacidad del buzón (S10): el alcance por rol se filtra en el SERVIDOR
      // (`_lib/buzon-alcance.ts`). Esta consola es solo del administrador, que
      // registra y responde lo que llega a la oficina, así que ve la colección
      // completa de su comunidad tal como la entrega la API.
      const buzonVisible = mensajesBuzonCO

      if (cargando) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-9 w-72 rounded bg-muted/40" />
        <div className="h-4 w-96 max-w-full rounded bg-muted/30" />
        <div className="h-64 rounded-lg bg-muted/30" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><IconSpeakerphone className="size-6" /> Comunicación</h1>
          <p className="text-sm text-muted-foreground">Canal oficial: mensajería masiva por filtros EF/MP, plantillas y buzón ciudadano.</p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {exito && <p className="text-sm text-emerald-600 dark:text-emerald-400">{exito}</p>}

      <Tabs defaultValue="redaccion">
        <TabsList className="flex-wrap">
          <TabsTrigger value="redaccion" className="gap-1"><IconSend className="size-4" /> Masivos</TabsTrigger>
          <TabsTrigger value="plantillas" className="gap-1"><IconTemplate className="size-4" /> Plantillas</TabsTrigger>
          <TabsTrigger value="buzon" className="gap-1"><IconInbox className="size-4" /> Buzón Ciudadano</TabsTrigger>
        </TabsList>

        <TabsContent value="redaccion" className="pt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
            <Card className="lg:w-1/2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Redactar comunicación oficial</CardTitle>
                <CardDescription>Escribe libre o carga una plantilla (auto-completa asunto y cuerpo). Variables: [Nombre_Usuario], [Nombre_Torre], [Nombre_Comunidad].</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Plantilla prefijada</Label>
                  <Select value={plantillaSel || "manual"} onValueChange={v => v === "manual" ? (setPlantillaSel(""), setAsunto(""), setCuerpo("")) : cargarPlantilla(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Mensaje manual</SelectItem>
                      {plantillasCO.map(p => (
                        <SelectItem key={p.id} value={p.id}>{CATEGORIA_LABEL[p.categoria]} · {p.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Asunto</Label>
                  <Input value={asunto} onChange={e => setAsunto(e.target.value)} placeholder="Ej: CORTE DE AGUA EMERGENCIA" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cuerpo</Label>
                  <textarea
                    rows={5}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={cuerpo}
                    onChange={e => setCuerpo(e.target.value)}
                    placeholder="Estimado/a [Nombre_Usuario]…"
                  />
                </div>
                {/* T14 — con el alcance en vuelo o fallando, el envío no sale: el error
                    del servidor queda verbatim y un click no lo pisa con otro mensaje. */}
                <Button onClick={enviarMasivo} disabled={cargandoAlcance || !!errorAlcance}><IconSend className="size-4 mr-1" /> Enviar a destinatarios filtrados</Button>
              </CardContent>
            </Card>

            <Card className="lg:w-1/2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Destinatarios (filtros dinámicos)</CardTitle>
                <CardDescription>Combina grupos por rol, sub-grupos físicos EF e individuos MP. Se resuelven contra vínculos vigentes.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div>
                  <Label className="mb-1 block text-xs">Grupos por rol de vínculo</Label>
                  <div className="flex flex-wrap gap-3 text-xs">
                    {([["propietario", "Propietarios"], ["arrendatario", "Residentes (arriendo)"], ["ocupante", "Ocupantes"], ["copropietario", "Copropietarios"], ["personal", "Personal de Servicio"]] as const).map(([rol, label]) => (
                      <label key={rol} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={rolesFiltro.includes(rol)}
                          onChange={e => setRolesFiltro(prev => e.target.checked ? [...prev, rol] : prev.filter(x => x !== rol))}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Macro sector</Label>
                    <Select value={macroSel} onValueChange={v => { setMacroSel(v); setMicroSel("todos"); setUnidadSel("todas") }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {macroSectores.map(m => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Sub-sector</Label>
                    <Select value={microSel} onValueChange={v => { setMicroSel(v); setUnidadSel("todas") }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {microsVisibles.map(m => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Unidad</Label>
                    <Select value={unidadSel} onValueChange={setUnidadSel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Todas</SelectItem>
                        {unidadesVisibles.map(u => <SelectItem key={u.id} value={u.id}>{u.etiqueta} {u.numero}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {/* S10 — las opciones de este filtro salen de `useUnidades()`
                        (`pageSize=100`): si la comunidad tiene más unidades, el filtro no
                        las ofrece. Se declara en vez de esconderse. */}
                    <AvisoTruncamiento mostrados={unidades.length} total={totalUnidades} />
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  {/* T14 — el alcance lo resuelve el endpoint sobre la comunidad completa.
                      El aviso declara el recorte del TRANSPORTE (filas montadas vs `total`
                      del servidor): la resolución ya no depende del padrón truncado del
                      cliente, que ni siquiera se consulta para esto. */}
                  {cargandoAlcance && <p role="status" className="text-xs text-muted-foreground mb-2">Resolviendo destinatarios en el servidor…</p>}
                  {errorAlcance && <p className="text-sm text-destructive mb-2">{errorAlcance}</p>}
                  <AvisoTruncamiento
                    mostrados={alcance.filas.length}
                    total={alcance.total}
                    className="mb-2"
                  />
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Alcance resuelto: {alcance.filas.length} destinatario(s)</p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                    {alcance.filas.slice(0, 50).map(f => (
                      <li key={`${f.personaId}-${f.unidadId ?? ""}`} className="flex items-center justify-between gap-2">
                        <span>{f.personaNombre}</span>
                        {f.unidadId && <Badge variant="outline" className="text-[10px]">{unidades.find(u => u.id === f.unidadId)?.numero}</Badge>}
                      </li>
                    ))}
                    {alcance.filas.length > 50 && <li className="text-muted-foreground">…y {alcance.filas.length - 50} más</li>}
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card className="w-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Envíos y confirmación de lectura</CardTitle>
                <CardDescription>Tasa de apertura derivada de las lecturas que registran los destinatarios al abrir la comunicación.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {enviosCO.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Aún no hay envíos.</p>}
                <ul className="flex flex-col gap-2" aria-label="Envíos registrados">
                  {enviosCO.slice().reverse().map(envio => {
                    const totales = totalesDeEnvio(envio)
                    return (
                      <li key={envio.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs">
                        <div>
                          <p className="font-medium">{envio.asunto}</p>
                          <p className="text-muted-foreground">{envio.fechaEnvio} · {totales ? totales.total : "—"} destinatario(s){envio.plantillaId ? ` · plantilla ${plantillasCO.find(p => p.id === envio.plantillaId)?.nombre ?? ""}` : ""}</p>
                        </div>
                        {totales ? (
                          <MetricaLecturas leidos={totales.leidos} total={totales.total} />
                        ) : (
                          <Badge variant="outline">Sin totales de lectura en la respuesta</Badge>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

        <TabsContent value="plantillas" className="pt-4 flex flex-col gap-4">
            <Button variant="outline" size="sm" className="self-start" onClick={() => setEditandoPlantilla({ id: `plant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, nombre: "", categoria: "comunidad", asunto: "", cuerpo: "" })}>
              <IconPlus className="size-4 mr-1" /> Nueva plantilla
            </Button>
            <div className="grid gap-4 md:grid-cols-2">
              {plantillasCO.map(pl => (
                <Card key={pl.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-sm">{pl.nombre}</CardTitle>
                        <CardDescription><Badge variant="secondary" className="text-[10px]">{CATEGORIA_LABEL[pl.categoria]}</Badge></CardDescription>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" aria-label="Editar plantilla" onClick={() => setEditandoPlantilla({ ...pl })}><IconPencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon" aria-label="Eliminar plantilla" onClick={() => { void (async () => {
                          const r = await eliminarPlantillaApi(pl.id)
                          if (!r.ok) setError(r.error ?? "No se pudo eliminar.")
                        })() }}><IconTrash className="size-4" /></Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="border-t pt-3 text-xs">
                    <p className="font-medium">{pl.asunto}</p>
                    <p className="whitespace-pre-wrap text-muted-foreground">{pl.cuerpo}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

        <TabsContent value="buzon" className="pt-4 flex flex-col gap-4 xl:flex-row xl:items-start">
          <Card className="xl:w-2/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Nuevo mensaje ciudadano</CardTitle>
              <CardDescription>Canal formal de interacción. El orden constructivo prioriza lo positivo.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="space-y-2">
                {CLASIFICACIONES.map(c => (
                  <label key={c.valor} className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-xs ${clasificacion === c.valor ? "border-primary bg-primary/5" : ""}`}>
                    <input type="radio" name="clasificacion" className="mt-0.5" checked={clasificacion === c.valor} onChange={() => setClasificacion(c.valor)} />
                    <span><span className="font-medium">{c.label}</span><br /><span className="text-muted-foreground">{c.desc}</span></span>
                  </label>
                ))}
              </div>
              {/* D7: la Administración registra en el buzón los reclamos que recibe
                  en la oficina a nombre de un vecino. El reportante se resuelve en el
                  servidor contra la comunidad y el nombre sale de la ficha de Persona;
                  sin selección, el servidor deriva el reportante de la sesión (L9d):
                  el nombre que viaja en el payload es una etiqueta, no el registro. */}
              <div className="space-y-1">
                <Label className="text-xs">Registrar a nombre de (reclamo recibido en oficina)</Label>
                {/* S10 — la lista de vecinos se BUSCA en el servidor (padrón completo, con
                    `total` declarado) en vez de montarse desde la primera página del padrón. */}
                <BuscadorEntidad<PersonaBuscada>
                  url={BUSCADOR_REPORTANTE}
                  idDe={p => p.id}
                  etiquetaDe={p => `${p.nombres} ${p.apellidos}`}
                  seleccion={reportanteSel}
                  onSeleccion={setReportanteSel}
                  placeholder="Buscar por nombre o RUT…"
                  vacio="Ningún vecino activo coincide."
                />
                <p className="text-xs text-muted-foreground">Sin selección, el servidor resuelve la identidad de quien reporta desde tu sesión; el nombre que viaja en el envío es una etiqueta provisoria.</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Asunto</Label>
                <Input value={buzonAsunto} onChange={e => setBuzonAsunto(e.target.value)} placeholder="Resume tu mensaje" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mensaje</Label>
                <textarea
                  rows={4}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={buzonCuerpo}
                  onChange={e => setBuzonCuerpo(e.target.value)}
                  placeholder="Detalla tu felicitación, sugerencia o reclamo…"
                />
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={visibilidadComite} onChange={e => setVisibilidadComite(e.target.checked)} />
                Visible para el Comité (transparencia). Si lo desmarcas, solo lo ve la Administración.
              </label>
              <Button onClick={enviarBuzon}><IconSend className="size-4 mr-1" /> Enviar al buzón</Button>
            </CardContent>
          </Card>

          <div className="flex flex-1 flex-col gap-3">
            {buzonVisible.length === 0 && <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Sin mensajes en el buzón de la comunidad.</CardContent></Card>}
            {buzonVisible.slice().reverse().map(m => (
              <Card key={m.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm flex items-center gap-2">
                        {m.folio} · {m.asunto}
                        <Badge variant={m.estado === "recibido" ? "secondary" : m.estado === "cerrado" ? "outline" : "default"}>{ESTADO_BUZON_LABEL[m.estado]}</Badge>
                      </CardTitle>
                      <CardDescription>
                        {CLASIFICACIONES.find(c => c.valor === m.clasificacion)?.label.split(". ")[1]} · {m.reportanteNombre} · {m.fechaIngreso}
                        {m.visibilidadComite && " · visible al Comité"}
                      </CardDescription>
                    </div>
                    {m.estado !== "cerrado" && (
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" onClick={() => { setRespondiendo(m); setRespuestaTexto(""); setRespuestaCompromiso("") }}>Responder</Button>
                        {(m.estado === "en_gestion" || m.estado === "recibido") && (
                          <Button size="sm" variant="outline" disabled={m.estado === "recibido"} onClick={() => cambiarEstado(m.id, "resuelto")}><IconCheck className="size-3 mr-1" /> Resolver</Button>
                        )}
                        {m.estado === "resuelto" && <Button size="sm" variant="outline" onClick={() => cambiarEstado(m.id, "cerrado")}>Cerrar</Button>}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="border-t pt-3">
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{m.cuerpo}</p>
                  {m.respuestas.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {m.respuestas.map(resp => (
                        <div key={resp.id} className="rounded-md border-l-2 border-primary/50 bg-muted/30 p-2 text-xs">
                          <p className="font-medium">{resp.autor} · {resp.fecha}</p>
                          <p>{resp.texto}</p>
                          {resp.compromisos && <p className="mt-1 text-muted-foreground">Compromiso: {resp.compromisos}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

      </Tabs>

      {/* Diálogo de respuesta del buzón */}
      <Dialog open={!!respondiendo} onOpenChange={v => { if (!v) setRespondiendo(null) }}>
        <DialogContent className="sm:max-w-lg">
          {respondiendo && (
            <>
              <DialogHeader>
                <DialogTitle>Responder ticket {respondiendo!.folio}</DialogTitle>
                <DialogDescription>La respuesta auto-transiciona Recibido→En Gestión y queda auditada.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Respuesta</Label>
                  <textarea
                    rows={4}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={respuestaTexto}
                    onChange={e => setRespuestaTexto(e.target.value)}
                    placeholder="Mediación y respuesta de la administración…"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Compromisos adquiridos (opcional)</Label>
                  <Input value={respuestaCompromiso} onChange={e => setRespuestaCompromiso(e.target.value)} placeholder="Ej: revisión antes del viernes" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRespondiendo(null)}>Cancelar</Button>
                <Button onClick={responderTicket}>Enviar respuesta</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo de plantilla */}
      <Dialog open={!!editandoPlantilla} onOpenChange={v => { if (!v) setEditandoPlantilla(null) }}>
        <DialogContent className="sm:max-w-lg">
          {editandoPlantilla && (
            <>
              <DialogHeader>
                <DialogTitle>{plantillasCO.some(p => p.id === editandoPlantilla.id) ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
                <DialogDescription>Categorías NSGC: comunidad, urgente, cobranza, información, onboarding.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nombre</Label>
                  <Input value={editandoPlantilla.nombre} onChange={e => setEditandoPlantilla({ ...editandoPlantilla, nombre: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Categoría</Label>
                  <Select value={editandoPlantilla.categoria} onValueChange={v => setEditandoPlantilla({ ...editandoPlantilla, categoria: v as PlantillaCO["categoria"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORIA_LABEL).map(([valor, label]) => <SelectItem key={valor} value={valor}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Asunto</Label>
                  <Input value={editandoPlantilla.asunto} onChange={e => setEditandoPlantilla({ ...editandoPlantilla, asunto: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cuerpo (soporta variables)</Label>
                  <textarea
                    rows={4}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={editandoPlantilla.cuerpo}
                    onChange={e => setEditandoPlantilla({ ...editandoPlantilla, cuerpo: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditandoPlantilla(null)}>Cancelar</Button>
                <Button onClick={guardarPlantilla}>Guardar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
