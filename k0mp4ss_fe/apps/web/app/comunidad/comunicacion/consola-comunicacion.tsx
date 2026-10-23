"use client"

import * as React from "react"
import { usePlantillasCO, useEnviosCO, useMensajesBuzonCO, useDocumentosCO } from "@/lib/api/use-co"
import { usePersonas } from "@/lib/api/use-personas"
import { useUnidades } from "@/lib/api/use-unidades"
import { useVinculos } from "@/lib/api/use-vinculos"
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
  IconBooks,
  IconPlus,
  IconPencil,
  IconTrash,
  IconCheck,
  IconExternalLink,
} from "@tabler/icons-react"
import { MetricaLecturas } from "@/components/co/metrica-lecturas"
import { totalesDeEnvio } from "@/components/co/totales-envio"
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
 * consola-comunicacion — consola de administración de CO (redacción, plantillas,
 * buzón y biblioteca).
 *
 * Solo la renderiza `page.tsx` cuando el rol resuelto en el servidor es
 * administrador (change co-lectura-residente, D1): el `<Select>` «Vista» que
 * gobernaba el render desde el cliente fue eliminado — la vista no es una
 * preferencia del usuario sino una decisión de autorización server-side. El
 * residente y el comité reciben `components/co/bandeja-residente.tsx`.
 */
export function ConsolaComunicacionCO() {
  const { personas, isLoading: cPersonas } = usePersonas()
  const { vinculos, isLoading: cVinculos } = useVinculos()
  const { items: unidades, isLoading: cUnidades } = useUnidades()
  const { items: macroSectores, isLoading: cMacro } = useMacroSectores()
  const { items: microSectores, isLoading: cMicro } = useMicroSectores()
  const { items: plantillasCO, isLoading: cPlantillas, create: crearPlantillaApi, update: actualizarPlantillaApi, remove: eliminarPlantillaApi } = usePlantillasCO()
  const { items: enviosCO, isLoading: cEnvios, create: crearEnvioApi } = useEnviosCO()
  const { items: mensajesBuzonCO, isLoading: cBuzon, create: crearMensajeApi, update: actualizarMensajeApi } = useMensajesBuzonCO()
  const { items: documentosCO, isLoading: cDocs, create: crearDocumentoApi, update: actualizarDocumentoApi, remove: eliminarDocumentoApi } = useDocumentosCO()
  // TODO: migrar eventos de auditoría (lecturas de envío, descargas de docs, notificaciones email_simulado) a endpoints de API en próxima fase.

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

  // --- Buzón ---
  const [clasificacion, setClasificacion] = React.useState<"felicitacion" | "sugerencia" | "reclamo">("felicitacion")
  const [reportanteId, setReportanteId] = React.useState("")
  const [buzonAsunto, setBuzonAsunto] = React.useState("")
  const [buzonCuerpo, setBuzonCuerpo] = React.useState("")
  const [visibilidadComite, setVisibilidadComite] = React.useState(false)
  const [respondiendo, setRespondiendo] = React.useState<MensajeBuzonCO | null>(null)
  const [respuestaTexto, setRespuestaTexto] = React.useState("")
  const [respuestaCompromiso, setRespuestaCompromiso] = React.useState("")

  // --- Plantillas ---
  const [editandoPlantilla, setEditandoPlantilla] = React.useState<PlantillaCO | null>(null)

      // --- Biblioteca ---
      const [editandoDoc, setEditandoDoc] = React.useState<{ id: string; nombre: string; categoria: string; tipoMime: string; tamanoKB: number; url: string } | null>(null)

      const cargando = cPersonas || cVinculos || cUnidades || cMacro || cMicro || cPlantillas || cEnvios || cBuzon || cDocs

      const nombrePersona = (id: string) => {
        const p = personas.find(x => x.id === id)
        return p ? `${p.nombres} ${p.apellidos}` : id
      }

      const microsVisibles = macroSel === "todos" ? microSectores : microSectores.filter(m => m.macroSectorId === macroSel)
      const unidadesVisibles = microSel === "todos" ? unidades : unidades.filter(u => u.microSectorId === microSel)

      const destinatarios = React.useMemo(() => {
        const rolPersona = (personaId: string): string[] => {
          const vigs = vinculos.filter(v => v.personaId === personaId && !v.fechaFin).map(v => v.rol)
          if (vigs.length > 0) return vigs
          const p = personas.find(x => x.id === personaId)
          return p?.roles.filter(r => r !== "directiva") ?? []
        }
        const base = new Map<string, string | undefined>()
        for (const p of personas) {
          if (p.estadoCuenta !== "activa") continue
          const roles = rolPersona(p.id)
          if (roles.includes("personal")) {
            if (rolesFiltro.includes("personal")) base.set(p.id, undefined)
            continue
          }
          const vigs = vinculos.filter(v => v.personaId === p.id && !v.fechaFin)
          if (vigs.length === 0) continue
          for (const v of vigs) {
            if (!rolesFiltro.includes(v.rol)) continue
            if (!base.has(p.id)) base.set(p.id, v.unidadId)
          }
        }
        let lista = Array.from(base.entries()).map(([personaId, unidadId]) => ({ personaId, unidadId }))
        if (macroSel !== "todos" || microSel !== "todos" || unidadSel !== "todas") {
          const idsUnidades = new Set(unidadesVisibles.map(u => u.id))
          lista = lista.filter(d => d.unidadId && idsUnidades.has(d.unidadId))
        }
        return lista
      }, [personas, vinculos, rolesFiltro, macroSel, microSel, unidadSel, unidadesVisibles])

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
        const reportante = reportanteId || personas[0]?.id
        const persona = personas.find(p => p.id === reportante)
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
          reportanteNombre: persona ? `${persona.nombres} ${persona.apellidos}` : "Vecino/a",
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

      const guardarDoc = async () => {
        if (!editandoDoc) return
        const existente = documentosCO.some(d => d.id === editandoDoc.id)
        const r = existente
          ? await actualizarDocumentoApi(editandoDoc.id, { nombre: editandoDoc.nombre, categoria: editandoDoc.categoria, tipoMime: editandoDoc.tipoMime, tamanoKB: editandoDoc.tamanoKB, url: editandoDoc.url })
          : await crearDocumentoApi(editandoDoc)
        if (!r.ok) { setError(r.error ?? "No se pudo guardar el documento."); return }
        setEditandoDoc(null)
      }

      const abrirDocumento = (docId: string, url: string) => {
        // TODO: registrarDescargaDocCO (evento de auditoría) aún viaja vía API en fase posterior.
        // `new URL` lanza con entrada inválida: todo el parseo va en try/catch y lo
        // que se abre es la URL ya normalizada, nunca el string recibido.
        let destino: URL
        try {
          destino = new URL(url)
        } catch {
          setError("URL del documento inválida: solo http(s) por referencia (D1).")
          return
        }
        // Solo http(s): rechaza javascript:, data: y cualquier otro esquema.
        if (destino.protocol !== "http:" && destino.protocol !== "https:") {
          setError("URL del documento inválida: solo http(s) por referencia (D1).")
          return
        }
        // Allowlist de destinos: el propio origen y el almacenamiento del proyecto.
        // Ampliar esta lista cuando se sume otro proveedor de archivos (decisión owner).
        const DOMINIOS_PERMITIDOS = ["supabase.co", "supabase.in"]
        const hostPermitido =
          destino.origin === window.location.origin ||
          DOMINIOS_PERMITIDOS.some(
            (d) => destino.hostname === d || destino.hostname.endsWith(`.${d}`)
          )
        if (!hostPermitido) {
          setError("URL del documento no pertenece a un dominio permitido (D1).")
          return
        }
        window.open(destino.toString(), "_blank", "noopener,noreferrer")
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
          <p className="text-sm text-muted-foreground">Canal oficial: mensajería masiva por filtros EF/MP, plantillas, buzón ciudadano y biblioteca.</p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {exito && <p className="text-sm text-emerald-600 dark:text-emerald-400">{exito}</p>}

      <Tabs defaultValue="redaccion">
        <TabsList className="flex-wrap">
          <TabsTrigger value="redaccion" className="gap-1"><IconSend className="size-4" /> Masivos</TabsTrigger>
          <TabsTrigger value="plantillas" className="gap-1"><IconTemplate className="size-4" /> Plantillas</TabsTrigger>
          <TabsTrigger value="buzon" className="gap-1"><IconInbox className="size-4" /> Buzón Ciudadano</TabsTrigger>
          <TabsTrigger value="biblioteca" className="gap-1"><IconBooks className="size-4" /> Biblioteca</TabsTrigger>
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
                <Button onClick={enviarMasivo}><IconSend className="size-4 mr-1" /> Enviar a destinatarios filtrados</Button>
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
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Alcance resuelto: {destinatarios.length} destinatario(s)</p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                    {destinatarios.slice(0, 50).map(d => (
                      <li key={`${d.personaId}-${d.unidadId ?? ""}`} className="flex items-center justify-between gap-2">
                        <span>{nombrePersona(d.personaId)}</span>
                        {d.unidadId && <Badge variant="outline" className="text-[10px]">{unidades.find(u => u.id === d.unidadId)?.numero}</Badge>}
                      </li>
                    ))}
                    {destinatarios.length > 50 && <li className="text-muted-foreground">…y {destinatarios.length - 50} más</li>}
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
                          <p className="text-muted-foreground">{envio.fechaEnvio} · {totales ? totales.total : envio.destinatarios.length} destinatario(s){envio.plantillaId ? ` · plantilla ${plantillasCO.find(p => p.id === envio.plantillaId)?.nombre ?? ""}` : ""}</p>
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
                  sin selección, el mensaje queda a nombre de la Administración. */}
              <div className="space-y-1">
                <Label className="text-xs">Registrar a nombre de (reclamo recibido en oficina)</Label>
                <Select value={reportanteId || "administracion"} onValueChange={v => setReportanteId(v === "administracion" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="administracion">La Administración (sin nombre de vecino)</SelectItem>
                    {personas.filter(p => p.estadoCuenta === "activa").map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.nombres} {p.apellidos}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

        <TabsContent value="biblioteca" className="pt-4 flex flex-col gap-4">
          <Button variant="outline" size="sm" className="self-start" onClick={() => setEditandoDoc({ id: `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, nombre: "", categoria: "reglamento", tipoMime: "application/pdf", tamanoKB: 100, url: "" })}>
              <IconPlus className="size-4 mr-1" /> Agregar documento
            </Button>
          <div className="grid gap-3 md:grid-cols-2">
            {documentosCO.length === 0 && <Card className="md:col-span-2"><CardContent className="py-8 text-center text-sm text-muted-foreground">La biblioteca está vacía. Acceso 24/7 a documentación legal y operativa.</CardContent></Card>}
            {documentosCO.map(doc => (
              <Card key={doc.id}>
                <CardContent className="flex items-center justify-between gap-3 pt-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{doc.nombre}</p>
                    <p className="text-xs text-muted-foreground">{doc.categoria} · {doc.tipoMime} · {doc.tamanoKB} KB</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="outline" onClick={() => abrirDocumento(doc.id, doc.url)}>
                      <IconExternalLink className="size-3 mr-1" /> Abrir
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Eliminar documento" onClick={() => { void eliminarDocumentoApi(doc.id) }}><IconTrash className="size-4" /></Button>
                  </div>
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

      {/* Diálogo de documento */}
      <Dialog open={!!editandoDoc} onOpenChange={v => { if (!v) setEditandoDoc(null) }}>
        <DialogContent className="sm:max-w-lg">
          {editandoDoc && (
            <>
              <DialogHeader>
                <DialogTitle>Agregar documento comunal</DialogTitle>
                <DialogDescription>D1 media por referencia: solo metadatos + URL; jamás contenido embebido.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nombre</Label>
                  <Input value={editandoDoc.nombre} onChange={e => setEditandoDoc({ ...editandoDoc, nombre: e.target.value })} placeholder="Reglamento de Copropiedad.pdf" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Categoría</Label>
                    <Input value={editandoDoc.categoria} onChange={e => setEditandoDoc({ ...editandoDoc, categoria: e.target.value })} placeholder="reglamento / acta / operativo" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tamaño (KB)</Label>
                    <Input type="number" min={0} value={editandoDoc.tamanoKB} onChange={e => setEditandoDoc({ ...editandoDoc, tamanoKB: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">URL del documento</Label>
                  <Input value={editandoDoc.url} onChange={e => setEditandoDoc({ ...editandoDoc, url: e.target.value })} placeholder="https://…" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditandoDoc(null)}>Cancelar</Button>
                <Button onClick={guardarDoc}>Guardar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
