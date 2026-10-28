    "use client"
    
    import * as React from "react"
    import Link from "next/link"
    // Datos de dominio vía API REST (BD fuente de verdad); store legacy deprecado.
    import { usePersonas } from "@/lib/api/use-personas"
    import { sinNulos } from "@/lib/api/use-crud-collection"
    import { useConfiguracion } from "@/lib/api/use-configuracion"
    import { useMaestros } from "@/lib/api/use-maestros"
    import { useTrabajosMT } from "@/lib/api/use-mt"
    import { useCierresTurnoPE, useProyeccionesPE, useAccionesPE, useTurnosIniciadosPE } from "@/lib/api/use-pe"
    import type {
      Afp,
      AsignacionFamiliar,
      Banco,
      Feriado,
      Jornada,
      MutualCaja,
      Persona as PersonaFull,
      PrevisionSalud,
    } from "@/lib/schemas"
import { aTituloCaso, aOracion } from "@/lib/normalizacion"
import { VERSION_POLITICA_PRIVACIDAD } from "@/lib/politica-privacidad"
import { ConsentimientoDatosSensibles } from "@/components/personas/consentimiento-datos-sensibles"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Switch } from "@workspace/ui/components/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  IconUsersGroup,
  IconCalendarHeart,
  IconClipboardCheck,
  IconPlus,
  IconPencil,
  IconTrash,
  IconSend,
  IconUserShield,
  IconPhotoOff,
  IconCheck,
  IconX,
} from "@tabler/icons-react"
import type { Persona } from "@/lib/schemas"
import {
  calcularProyeccionCobertura,
  costoProyeccionPE,
  estadoReporteDiario,
} from "@/lib/personal-utils"

interface ContactoFicha {
  nombre: string
  telefono: string
  relacion: string
}

interface FormFicha {
  cargo: string
  fechaIngreso: string
  tipoContrato: string
  afpId: string
  saludId: string
  asignacionFamiliarId: string
  cargas: string
  mutualidadId: string
  bancoId: string
  numeroCuenta: string
  tipoCuenta: string
  seguroComplementario: string
  apv: boolean
  jornadaBaseHoras: string
  medicamentos: string
  alergias: string
  condiciones: string
  contactos: ContactoFicha[]
}

const FICHA_VACIA: FormFicha = {
  cargo: "",
  fechaIngreso: "",
  tipoContrato: "",
  afpId: "",
  saludId: "",
  asignacionFamiliarId: "",
  cargas: "",
  mutualidadId: "",
  bancoId: "",
  numeroCuenta: "",
  tipoCuenta: "",
  seguroComplementario: "",
  apv: false,
  jornadaBaseHoras: "",
  medicamentos: "",
  alergias: "",
  condiciones: "",
  contactos: [],
}

function fichaDesdePersona(p: Persona): FormFicha {
  const dl = p.datosLaborales!
  return {
    cargo: dl.cargo,
    fechaIngreso: dl.fechaIngreso,
    tipoContrato: dl.tipoContrato ?? "",
    afpId: dl.afpId ?? "",
    saludId: dl.saludId ?? "",
    asignacionFamiliarId: dl.asignacionFamiliarId ?? "",
    cargas: dl.cargas !== undefined ? String(dl.cargas) : "",
    mutualidadId: dl.mutualidadId ?? "",
    bancoId: dl.bancoId ?? "",
    numeroCuenta: dl.numeroCuenta ?? "",
    tipoCuenta: dl.tipoCuenta ?? "",
    seguroComplementario: dl.seguroComplementario ?? "",
    apv: dl.apv ?? false,
    jornadaBaseHoras: dl.jornadaBaseHoras !== undefined ? String(dl.jornadaBaseHoras) : "",
    medicamentos: dl.fichaMedica?.medicamentos ?? "",
    alergias: dl.fichaMedica?.alergias ?? "",
    condiciones: dl.fichaMedica?.condiciones ?? "",
    contactos: (dl.contactosEmergencia ?? []).map(c => ({ nombre: c.nombre, telefono: c.telefono, relacion: c.relacion ?? "" })),
  }
}

function personaDesdeFicha(p: Persona, form: FormFicha, consentimiento: boolean): Persona {
  const previa = p.datosLaborales
  return {
    ...p,
    datosLaborales: {
      id: previa?.id ?? `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      cargo: aTituloCaso(form.cargo),
      afp: previa?.afp ?? "—",
      prevision: previa?.prevision ?? "—",
      fechaIngreso: form.fechaIngreso || previa?.fechaIngreso || new Date().toISOString().slice(0, 10),
      ...(form.tipoContrato ? { tipoContrato: form.tipoContrato as "indefinido" | "plazo_fijo" | "honorarios" } : {}),
      ...(form.afpId ? { afpId: form.afpId } : {}),
      ...(form.saludId ? { saludId: form.saludId } : {}),
      ...(form.asignacionFamiliarId ? { asignacionFamiliarId: form.asignacionFamiliarId } : {}),
      ...(form.cargas !== "" ? { cargas: Number(form.cargas) } : {}),
      ...(form.mutualidadId ? { mutualidadId: form.mutualidadId } : {}),
      ...(form.bancoId ? { bancoId: form.bancoId } : {}),
      ...(form.numeroCuenta.trim() ? { numeroCuenta: form.numeroCuenta.trim() } : {}),
      ...(form.tipoCuenta ? { tipoCuenta: form.tipoCuenta as "corriente" | "vista" | "ahorro" } : {}),
      ...(form.seguroComplementario.trim() ? { seguroComplementario: aTituloCaso(form.seguroComplementario) } : {}),
      // F18: el consentimiento viaja siempre (otorgado true o false) para que
      // el servidor persista los datos sensibles sólo en el primer caso y
      // borre al revocar. La fecha se toma al guardar; la versión es la de la
      // política de privacidad vigente.
      consentimientoDatosSensibles: {
        otorgado: consentimiento,
        fecha: new Date().toISOString().slice(0, 10),
        version: VERSION_POLITICA_PRIVACIDAD,
      },
      apv: form.apv,
      ...((form.medicamentos || form.alergias || form.condiciones)
        ? { fichaMedica: { medicamentos: aOracion(form.medicamentos) || undefined, alergias: aOracion(form.alergias) || undefined, condiciones: aOracion(form.condiciones) || undefined } }
        : {}),
      ...(form.contactos.length > 0
        ? { contactosEmergencia: form.contactos.map((c, i) => ({ id: `ce-${Date.now()}-${i}`, nombre: aTituloCaso(c.nombre), telefono: c.telefono.trim(), relacion: aTituloCaso(c.relacion) || undefined })) }
        : {}),
      ...(form.jornadaBaseHoras !== "" ? { jornadaBaseHoras: Number(form.jornadaBaseHoras) } : {}),
      horasExtras: previa?.horasExtras ?? [],
      evaluaciones: previa?.evaluaciones ?? [],
    },
    roles: p.roles.includes("personal") ? p.roles : [...p.roles, "personal"],
  }
}

function mesSugerido(): string {
  return new Date().toISOString().slice(0, 7)
}

export default function PersonalPage() {
  // Datos de dominio vía API REST; fallbacks legacy del store solo donde no hay hook.
  const { personas: personasApi, isLoading: cPersonas, create: crearPersonaApi } = usePersonas()
  // SAFETY: la API /api/personas serializa el schema completo (MP con ficha integral);
  // el hook tipa la variante resumida de los mocks. El cast adapta tipos sin cambiar valores.
  const personas = personasApi as unknown as PersonaFull[]
  const { items: trabajosMT, isLoading: cTrabajos } = useTrabajosMT()
  const { items: cierresTurnoPE, isLoading: cCierres } = useCierresTurnoPE()
  const { items: proyeccionesPE, isLoading: cProyecciones } = useProyeccionesPE()
  const { data: jornadas, isLoading: cJornadas } = useMaestros<Jornada>("jornadas")
  const { data: afps, isLoading: cAfps } = useMaestros<Afp>("afps")
  const { data: previsionesSalud, isLoading: cPrevisiones } = useMaestros<PrevisionSalud>("previsiones-salud")
  const { data: mutualesCajas, isLoading: cMutuales } = useMaestros<MutualCaja>("mutuales-cajas")
  const { data: asignacionFamiliar, isLoading: cAsignaciones } = useMaestros<AsignacionFamiliar>("asignaciones-familiar")
  const { data: bancos, isLoading: cBancos } = useMaestros<Banco>("bancos")
  const { data: feriados, isLoading: cFeriados, create: crearFeriadoApi, update: actualizarFeriadoApi, remove: eliminarFeriadoApi } = useMaestros<Feriado>("feriados")
  const { config: configuracion } = useConfiguracion()
  // SERIE-FASE2 §V2: los turnos del día salen de `/api/pe/turnos` (eventos
  // `PE_START_SHIFT`) y las cinco transiciones tienen ruta propia en
  // `/api/pe/**`. El store legacy ya no se usa en esta página.
  const { items: turnosIniciadosHoy, isLoading: cTurnos } = useTurnosIniciadosPE()
  const {
    iniciarTurno: iniciarTurnoApi,
    registrarHoraExtra: registrarHoraExtraApi,
    registrarEvaluacion: registrarEvaluacionApi,
    completarTareaMonitoreo: completarTareaMonitoreoApi,
    enviarProyeccionCosto: enviarProyeccionCostoApi,
  } = useAccionesPE()
  const isLoading = cPersonas || cTrabajos || cCierres || cProyecciones || cJornadas || cAfps || cPrevisiones || cMutuales || cAsignaciones || cBancos || cFeriados || cTurnos

  const [error, setError] = React.useState<string | null>(null)
  const [okMsg, setOkMsg] = React.useState<string | null>(null)
  const [editandoId, setEditandoId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<FormFicha>(FICHA_VACIA)
  // F18: consentimiento de datos sensibles de la ficha en edición. La página
  // es dueña del estado (el payload del guardado y el disabled de los campos
  // dependen de él); el bloque de UI sólo lo muestra y lo reporta.
  const [consentimiento, setConsentimiento] = React.useState(false)
  const [consentimientoInicial, setConsentimientoInicial] = React.useState(false)
  const [horaExtra, setHoraExtra] = React.useState({ fecha: "", horas: "", motivo: "" })
  const [evaluacion, setEvaluacion] = React.useState({ fecha: "", puntaje: "", comentarios: "" })
  const [formFeriado, setFormFeriado] = React.useState<{ id?: string; fecha: string; nombre: string; irrenunciable: boolean } | null>(null)
  const [mesProyeccion, setMesProyeccion] = React.useState(mesSugerido())
  const [costoParche, setCostoParche] = React.useState("35000")
  const [costoDiaExtra, setCostoDiaExtra] = React.useState("28000")
  const [turnoPersona, setTurnoPersona] = React.useState("")
  const [turnoJornada, setTurnoJornada] = React.useState("")

  const personal = personas.filter(
    p => p.roles.includes("personal") || p.datosLaborales !== undefined
  )
  const editando = editandoId ? personas.find(p => p.id === editandoId) : undefined
  const hoy = new Date().toISOString().slice(0, 10)

  const abrirFicha = (p: Persona) => {
    setEditandoId(p.id)
    setForm(p.datosLaborales ? fichaDesdePersona(p) : { ...FICHA_VACIA, cargo: "", fechaIngreso: hoy })
    // La ficha cargada puede venir con consentimiento ya otorgado: el check
    // arranca tildado y destildarlo es revocar (el servidor borra al guardar).
    const otorgadoPreviamente = p.datosLaborales?.consentimientoDatosSensibles?.otorgado === true
    setConsentimiento(otorgadoPreviamente)
    setConsentimientoInicial(otorgadoPreviamente)
    setError(null)
    setOkMsg(null)
  }

  // F18: al revocar (destildar) los campos sensibles se vacían en el formulario,
  // de modo que el guardado los mande ausentes y el servidor los limpie.
  const cambiarConsentimiento = (otorgado: boolean) => {
    setConsentimiento(otorgado)
    if (!otorgado) {
      setForm(f => ({
        ...f,
        afpId: "",
        saludId: "",
        asignacionFamiliarId: "",
        cargas: "",
        mutualidadId: "",
        bancoId: "",
        numeroCuenta: "",
        tipoCuenta: "",
        seguroComplementario: "",
        apv: false,
        medicamentos: "",
        alergias: "",
        condiciones: "",
      }))
    }
  }

  const guardarFicha = async () => {
    if (!editando) return
    if (!form.cargo.trim()) {
      setError("El cargo es obligatorio.")
      return
    }
    if (!form.fechaIngreso) {
      setError("La fecha de ingreso es obligatoria.")
      return
    }
    // Sin consentimiento los campos sensibles están deshabilitados y vacíos:
    // el servidor los descarta igual, así que no se exigen acá. Con
    // consentimiento otorgado siguen siendo obligatorios (liquidaciones).
    if (consentimiento && (!form.afpId || !form.saludId || !form.bancoId)) {
      setError("Seleccione AFP, previsión de salud y banco de los maestros legales.")
      return
    }
    // SAFETY: la ficha reenvía la fila Prisma (nulls en opcionales); los
    // schemas usan .optional() (null NO válido) → se podan (ver sinNulos).
    const r = await crearPersonaApi(sinNulos(personaDesdeFicha(editando, form, consentimiento) as unknown as Record<string, unknown>) as unknown as Parameters<typeof crearPersonaApi>[0])
    if (!r.ok) {
      setError(r.error ?? "No se pudo guardar la ficha.")
      return
    }
    setError(null)
    setOkMsg(`Ficha de ${editando.nombres} ${editando.apellidos} guardada.`)
  }

  const agregarHoraExtra = async () => {
    if (!editandoId) return
    if (!horaExtra.fecha || !horaExtra.horas || !horaExtra.motivo.trim()) {
      setError("Complete fecha, horas y motivo de la hora extra.")
      return
    }
    const r = await registrarHoraExtraApi(editandoId, { fecha: horaExtra.fecha, horas: Number(horaExtra.horas), motivo: horaExtra.motivo.trim() })
    if (!r.ok) {
      setError(r.error ?? "No se pudo registrar la hora extra.")
      return
    }
    setHoraExtra({ fecha: "", horas: "", motivo: "" })
    setOkMsg("Hora extra registrada.")
  }

  const agregarEvaluacion = async () => {
    if (!editandoId) return
    if (!evaluacion.fecha || !evaluacion.puntaje) {
      setError("Complete fecha y puntaje de la evaluación (1 a 7).")
      return
    }
    const puntaje = Number(evaluacion.puntaje)
    if (!Number.isFinite(puntaje) || puntaje < 1 || puntaje > 7) {
      setError("El puntaje debe ir de 1 a 7.")
      return
    }
    const r = await registrarEvaluacionApi(editandoId, { fecha: evaluacion.fecha, puntaje, comentarios: evaluacion.comentarios.trim() || undefined })
    if (!r.ok) {
      setError(r.error ?? "No se pudo registrar la evaluación.")
      return
    }
    setEvaluacion({ fecha: "", puntaje: "", comentarios: "" })
    setOkMsg("Evaluación registrada.")
  }

  const guardarFeriado = async () => {
    if (!formFeriado) return
    if (!formFeriado.fecha || !formFeriado.nombre.trim()) {
      setError("El feriado exige fecha y nombre.")
      return
    }
    const r = formFeriado.id
      ? await actualizarFeriadoApi(formFeriado.id, {
    fecha: formFeriado.fecha,
    nombre: formFeriado.nombre.trim(),
    irrenunciable: formFeriado.irrenunciable,
      })
      : await crearFeriadoApi({
    id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fecha: formFeriado.fecha,
    nombre: formFeriado.nombre.trim(),
    irrenunciable: formFeriado.irrenunciable,
      })
    if (!r.ok) {
      setError(r.error ?? "No se pudo guardar el feriado.")
      return
    }
    setFormFeriado(null)
    setOkMsg("Feriado guardado.")
  }

  const importarCalendarioAnual = async () => {
    const anio = Number(mesProyeccion.slice(0, 4))
    const base: Array<[string, string, boolean]> = [
      [`${anio}-01-01`, "Año Nuevo", true],
      [`${anio}-05-01`, "Día Nacional del Trabajo", true],
      [`${anio}-05-21`, "Día de las Glorias Navales", false],
      [`${anio}-06-29`, "San Pedro y San Pablo", false],
      [`${anio}-07-16`, "Virgen del Carmen", false],
      [`${anio}-08-15`, "Asunción de la Virgen", false],
      [`${anio}-09-18`, "Fiestas Patrias", true],
      [`${anio}-09-19`, "Día de las Glorias del Ejército", true],
      [`${anio}-10-12`, "Encuentro de Dos Mundos", false],
      [`${anio}-12-25`, "Navidad", true],
    ]
    const existentes = new Set(feriados.map(f => f.fecha))
    let agregados = 0
    for (const [fecha, nombre, irr] of base) {
      if (existentes.has(fecha)) continue
      const r = await crearFeriadoApi({ id: `f-${fecha}`, fecha, nombre, irrenunciable: irr })
      if (r.ok) agregados += 1
    }
    setOkMsg(agregados > 0 ? `Calendario ${anio}: ${agregados} feriado(s) importados.` : `El calendario ${anio} ya estaba completo.`)
  }

  const proyeccion = calcularProyeccionCobertura({ feriados, mesAnio: mesProyeccion })
  const costoEstimado = costoProyeccionPE(
    proyeccion.reemplazosNecesarios,
    personal.filter(p => p.estadoCuenta === "activa").length,
    Math.max(0, Number(costoParche) || 0),
    Math.max(0, Number(costoDiaExtra) || 0)
  )

  const enviarProyeccion = async () => {
    const r = await enviarProyeccionCostoApi(mesProyeccion, { costoParche: Math.max(0, Number(costoParche) || 0), costoDiaExtra: Math.max(0, Number(costoDiaExtra) || 0) })
    if (!r.ok) {
      setError(r.error ?? "No se pudo enviar la proyección.")
      return
    }
    setError(null)
    setOkMsg(`Proyección de ${mesProyeccion} enviada a Finanzas (liquidación pendiente en PL).`)
  }

  const iniciarTurno = async () => {
    if (!turnoPersona || !turnoJornada) {
      setError("Seleccione trabajador y jornada para iniciar el turno.")
      return
    }
    const r = await iniciarTurnoApi(turnoPersona, turnoJornada)
    if (!r.ok) {
      setError(r.error ?? "No se pudo iniciar el turno.")
      return
    }
    setError(null)
    setOkMsg("Turno iniciado (evento PE_START_SHIFT registrado).")
  }

  const estadoHoy = estadoReporteDiario(cierresTurnoPE, hoy)
  const tareasAbiertas = trabajosMT.filter(t => (t.estado === "planificado" || t.estado === "en_curso") && t.responsablePersonaId && personal.some(p => p.id === t.responsablePersonaId))


  if (isLoading) {
    return <div className="flex min-h-[60vh] flex-col gap-4 animate-pulse"><div className="h-9 w-72 rounded bg-muted/40" /><div className="h-64 w-full rounded-lg bg-muted" /></div>
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><IconUsersGroup className="size-6" /> Personal y Servicios</h1>
        <p className="text-sm text-muted-foreground">Repositorio maestro de identidad y condiciones laborales del equipo interno.</p>
      </header>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {okMsg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{okMsg}</div>}

      <Tabs defaultValue="trabajadores">
        <TabsList>
          <TabsTrigger value="trabajadores">Trabajadores ({personal.length})</TabsTrigger>
          <TabsTrigger value="feriados">Feriados y Proyección</TabsTrigger>
          <TabsTrigger value="monitoreo">Panel de Monitoreo</TabsTrigger>
        </TabsList>

        {/* --- Fichas integrales --- */}
        <TabsContent value="trabajadores" className="mt-4 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Ficha Integral del Trabajador</CardTitle>
              <CardDescription>Identidad desde MP · previsional y bancaria con FKs a maestros legales · seguridad, asistencia y desempeño.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {personal.length === 0 && <p className="text-sm text-muted-foreground">Sin trabajadores registrados.</p>}
              {personal.map(p => (
                <div key={p.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="flex items-start gap-3">
                    {p.fotografiaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.fotografiaUrl} alt={p.nombreCompleto} className="size-10 rounded-full object-cover" />
                    ) : (
                      <span className="flex size-10 items-center justify-center rounded-full bg-muted"><IconPhotoOff className="size-5 text-muted-foreground" /></span>
                    )}
                    <div>
                      <p className="font-medium leading-tight">{p.nombreCompleto}</p>
                      <p className="text-sm text-muted-foreground">
                        {p.datosLaborales ? `${p.datosLaborales.cargo} · desde ${p.datosLaborales.fechaIngreso}` : "Sin ficha laboral"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        AFP: {p.datosLaborales?.afpId ? afps.find(a => a.id === p.datosLaborales!.afpId)?.nombre ?? "—" : p.datosLaborales?.afp ?? "—"} · Salud: {p.datosLaborales?.saludId ? previsionesSalud.find(x => x.id === p.datosLaborales!.saludId)?.nombre ?? "—" : p.datosLaborales?.prevision ?? "—"}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => abrirFicha(p)}><IconPencil className="mr-1 size-4" />{p.datosLaborales ? "Editar" : "Crear ficha"}</Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <p className="text-sm text-muted-foreground">El detalle contractual y previsional ampliado vive aquí; el cajón RRHH de <Link href="/admin/gestion" className="underline">Gestión Administrativa</Link> sigue mostrando el resumen mínimo.</p>
        </TabsContent>

        {/* --- Feriados y proyección --- */}
        <TabsContent value="feriados" className="mt-4 flex flex-col gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2"><IconCalendarHeart className="size-5" /> Maestro de Feriados</CardTitle>
                <CardDescription>Carga anual nacional/regional para anticipar cobertura de turnos.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={importarCalendarioAnual}>Importar calendario {mesProyeccion.slice(0, 4)}</Button>
                <Button size="sm" onClick={() => setFormFeriado({ fecha: `${mesProyeccion.slice(0, 4)}-09-18`, nombre: "", irrenunciable: false })}><IconPlus className="mr-1 size-4" /> Nuevo</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Fecha</th><th className="p-3">Nombre</th><th className="p-3">Irrenunciable</th><th className="p-3 w-24">Acciones</th></tr></thead>
                <tbody>
                  {[...feriados].sort((a, b) => b.fecha.localeCompare(a.fecha)).map(f => (
                    <tr key={f.id} className="border-b last:border-0">
                      <td className="p-3 font-mono">{f.fecha}</td>
                      <td className="p-3">{f.nombre}</td>
                      <td className="p-3">{f.irrenunciable ? <Badge variant="destructive">Irrenunciable</Badge> : <Badge variant="secondary">Legal</Badge>}</td>
                      <td className="p-3 flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setFormFeriado({ id: f.id, fecha: f.fecha, nombre: f.nombre, irrenunciable: f.irrenunciable })}><IconPencil className="size-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={async () => { const r = await eliminarFeriadoApi(f.id); if (!r.ok) setError(r.error ?? ""); else setOkMsg("Feriado eliminado.") }}><IconTrash className="size-4" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><IconSend className="size-5" /> Proyección de Cobertura y Costos</CardTitle>
              <CardDescription>&quot;En este mes hay N días feriados; necesitará M trabajadores de reemplazo&quot;. La estimación viaja a Finanzas (FI).</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mes-proy">Mes a proyectar *</Label>
                  <Input id="mes-proy" type="month" value={mesProyeccion} onChange={e => setMesProyeccion(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="costo-parche">Costo por parche ($)</Label>
                  <Input id="costo-parche" type="number" min={0} value={costoParche} onChange={e => setCostoParche(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="costo-extra">Pago día extra planta ($)</Label>
                  <Input id="costo-extra" type="number" min={0} value={costoDiaExtra} onChange={e => setCostoDiaExtra(e.target.value)} />
                </div>
              </div>
              <div className="rounded-lg border p-4 text-sm">
                {proyeccion.diasFeriados === 0 ? (
                  <p className="text-muted-foreground">Sin feriados registrados en {mesProyeccion}. Importe o registre feriados arriba.</p>
                ) : (
                  <>
                    <p className="font-medium">En este mes, los días {proyeccion.feriados.map(f => f.fecha.slice(-2)).join(", ")} son feriados.</p>
                    <p>Necesitará <strong>{proyeccion.reemplazosNecesarios}</strong> reemplazo(s) (parches) para cubrir los descansos legales.</p>
                    <p>Sobrecosto operativo estimado: <strong>${costoEstimado.toLocaleString("es-CL")}</strong></p>
                    <Button size="sm" className="mt-3" onClick={enviarProyeccion}><IconSend className="mr-1 size-4" /> Enviar proyección a Finanzas</Button>
                  </>
                )}
              </div>
              {proyeccionesPE.length > 0 && (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Mes</th><th className="p-2">Feriados</th><th className="p-2">Reemplazos</th><th className="p-2">Costo estimado</th><th className="p-2">Liquidación (PL)</th></tr></thead>
                  <tbody>
                    {proyeccionesPE.map(pr => (
                      <tr key={pr.id} className="border-b last:border-0">
                        <td className="p-2 font-mono">{pr.mesAnio}</td>
                        <td className="p-2">{pr.diasFeriados}</td>
                        <td className="p-2">{pr.reemplazosNecesarios}</td>
                        <td className="p-2">${pr.costoEstimado.toLocaleString("es-CL")}</td>
                        <td className="p-2"><Badge variant="outline">{pr.liquidacionPLReferencia === "pendiente" ? "pendiente (PL v8)" : pr.liquidacionPLReferencia}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Panel de monitoreo --- */}
        <TabsContent value="monitoreo" className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-3">
            {jornadas.map(j => (
              <Card key={j.id}>
                <CardHeader className="pb-2">
                  <CardDescription>Jornada {j.nombre} (hoy)</CardDescription>
                  <CardTitle className={estadoHoy[j.id] ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                    {estadoHoy[j.id] ? "Informado" : "No Informado"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {cierresTurnoPE.filter(c => c.fecha === hoy && c.jornadaReportadaId === j.id).length} cierre(s) recibido(s)
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><IconUserShield className="size-5" /> Personal de turno</CardTitle>
              <CardDescription>Marca el inicio del turno (el sistema valida el evento, no cronometra).</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex w-64 flex-col gap-1.5">
                  <Label htmlFor="turno-pers">Trabajador</Label>
                  <Select value={turnoPersona} onValueChange={setTurnoPersona}>
                    <SelectTrigger id="turno-pers"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {personal.map(p => <SelectItem key={p.id} value={p.id}>{p.nombreCompleto}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex w-44 flex-col gap-1.5">
                  <Label htmlFor="turno-jorn">Jornada</Label>
                  <Select value={turnoJornada} onValueChange={setTurnoJornada}>
                    <SelectTrigger id="turno-jorn"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {jornadas.map(j => <SelectItem key={j.id} value={j.id}>{j.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={iniciarTurno}><IconCheck className="mr-1 size-4" /> Iniciar Turno</Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {turnosIniciadosHoy.length === 0 ? "Nadie ha iniciado turno aún hoy." : `Turnos iniciados hoy: ${turnosIniciadosHoy.map(e => e.descripcion.split(" inicia")[0]).join(", ")}.`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><IconClipboardCheck className="size-5" /> Tareas pendientes del personal</CardTitle>
              <CardDescription>Tareas de Mantenimiento asignadas a trabajadores con ficha activa.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {tareasAbiertas.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Sin tareas pendientes asignadas.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Tarea</th><th className="p-3">Responsable</th><th className="p-3">Estado</th><th className="p-3 w-28"></th></tr></thead>
                  <tbody>
                    {tareasAbiertas.map(t => (
                      <tr key={t.id} className="border-b last:border-0">
                        <td className="p-3">{t.titulo}</td>
                        <td className="p-3">{personal.find(p => p.id === t.responsablePersonaId)?.nombreCompleto ?? "—"}</td>
                        <td className="p-3"><Badge variant="secondary">{t.estado}</Badge></td>
                        <td className="p-3">
                          <Button size="sm" variant="outline" onClick={async () => { const r = await completarTareaMonitoreoApi(t.id); if (!r.ok) setError(r.error ?? ""); else setOkMsg(`Tarea "${t.titulo}" completada (PE_TASK_DONE).`) }}>Completar</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Diálogo de ficha integral */}
      <Dialog open={!!editando} onOpenChange={open => !open && setEditandoId(null)}>
        <DialogContent className="max-h-[85vh] sm:max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ficha Integral — {editando?.nombreCompleto}</DialogTitle>
            <DialogDescription>RUT {editando?.rut} · {editando?.email}. Los campos con * son obligatorios.</DialogDescription>
          </DialogHeader>
          {editando && (
            <div className="flex flex-col gap-4">
              <ConsentimientoDatosSensibles
                otorgado={consentimiento}
                otorgadoInicial={consentimientoInicial}
                onOtorgado={cambiarConsentimiento}
              />
              <section className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">Tipología Contractual</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="f-cargo">Cargo *</Label>
                    <Input id="f-cargo" value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} onBlur={() => setForm((f) => ({ ...f, cargo: aTituloCaso(f.cargo) }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="f-ingreso">Fecha ingreso *</Label>
                    <Input id="f-ingreso" type="date" value={form.fechaIngreso} onChange={e => setForm({ ...form, fechaIngreso: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Vínculo</Label>
                    <Select value={form.tipoContrato || undefined} onValueChange={v => setForm({ ...form, tipoContrato: v === "__none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Sin especificar</SelectItem>
                        <SelectItem value="indefinido">Indefinido</SelectItem>
                        <SelectItem value="plazo_fijo">Plazo Fijo</SelectItem>
                        <SelectItem value="honorarios">Honorarios</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">Configuración Previsional y Salud *</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="f-afp">AFP</Label>
                    <Select value={form.afpId || undefined} onValueChange={v => setForm({ ...form, afpId: v === "__none" ? "" : v })}>
                      <SelectTrigger id="f-afp"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>{afps.map(a => <SelectItem key={a.id} value={a.id}>{a.nombre} ({a.tasaCotizacion}%)</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="f-salud">Fonasa / Isapre</Label>
                    <Select value={form.saludId || undefined} onValueChange={v => setForm({ ...form, saludId: v === "__none" ? "" : v })}>
                      <SelectTrigger id="f-salud" disabled={!consentimiento}><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>{previsionesSalud.map(a => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Mutualidad / Caja</Label>
                    <Select value={form.mutualidadId || undefined} onValueChange={v => setForm({ ...form, mutualidadId: v === "__none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Sin especificar</SelectItem>
                        {mutualesCajas.map(a => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Tramo asignación familiar</Label>
                    <Select value={form.asignacionFamiliarId || undefined} onValueChange={v => setForm({ ...form, asignacionFamiliarId: v === "__none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Sin cargas</SelectItem>
                        {asignacionFamiliar.map(a => <SelectItem key={a.id} value={a.id}>{a.nombre} — ${a.monto.toLocaleString("es-CL")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="f-cargas">N° de cargas</Label>
                    <Input id="f-cargas" type="number" min={0} value={form.cargas} onChange={e => setForm({ ...form, cargas: e.target.value })} />
                  </div>
                  <div className="flex items-end gap-4 pb-1">
                    <label className="flex items-center gap-2 text-sm"><Switch checked={form.apv} onCheckedChange={v => setForm({ ...form, apv: v })} /> APV</label>
                  </div>
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label htmlFor="f-seguro">Seguro complementario</Label>
                    <Input id="f-seguro" value={form.seguroComplementario} onChange={e => setForm({ ...form, seguroComplementario: e.target.value })} onBlur={() => setForm((f) => ({ ...f, seguroComplementario: aTituloCaso(f.seguroComplementario) }))} placeholder="Compañía y póliza" />
                  </div>
                </div>
              </section>

              <section className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">Gestión Bancaria</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="f-banco">Banco (maestro)</Label>
                    <Select value={form.bancoId || undefined} onValueChange={v => setForm({ ...form, bancoId: v === "__none" ? "" : v })}>
                      <SelectTrigger id="f-banco"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>{bancos.map(b => <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="f-cuenta">Número de cuenta</Label>
                    <Input id="f-cuenta" value={form.numeroCuenta} onChange={e => setForm({ ...form, numeroCuenta: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Tipo de cuenta</Label>
                    <Select value={form.tipoCuenta || undefined} onValueChange={v => setForm({ ...form, tipoCuenta: v === "__none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Sin especificar</SelectItem>
                        <SelectItem value="corriente">Corriente</SelectItem>
                        <SelectItem value="vista">Vista</SelectItem>
                        <SelectItem value="ahorro">Ahorro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">Seguridad y Salud</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="f-med">Medicamentos</Label>
                    <Input id="f-med" disabled={!consentimiento} value={form.medicamentos} onChange={e => setForm({ ...form, medicamentos: e.target.value })} onBlur={() => setForm((f) => ({ ...f, medicamentos: aOracion(f.medicamentos) }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="f-alerg">Alergias</Label>
                    <Input id="f-alerg" disabled={!consentimiento} value={form.alergias} onChange={e => setForm({ ...form, alergias: e.target.value })} onBlur={() => setForm((f) => ({ ...f, alergias: aOracion(f.alergias) }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="f-cond">Condiciones médicas</Label>
                    <Input id="f-cond" disabled={!consentimiento} value={form.condiciones} onChange={e => setForm({ ...form, condiciones: e.target.value })} onBlur={() => setForm((f) => ({ ...f, condiciones: aOracion(f.condiciones) }))} />
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  <Label>Contactos de emergencia</Label>
                  {form.contactos.map((c, i) => (
                    <div key={i} className="flex gap-2">
                      <Input placeholder="Nombre *" value={c.nombre} onChange={e => setForm({ ...form, contactos: form.contactos.map((x, xi) => xi === i ? { ...x, nombre: e.target.value } : x) })} onBlur={() => setForm((f) => ({ ...f, contactos: f.contactos.map((x, xi) => xi === i ? { ...x, nombre: aTituloCaso(x.nombre), relacion: aTituloCaso(x.relacion) } : x) }))} />
                      <Input placeholder="Teléfono *" value={c.telefono} onChange={e => setForm({ ...form, contactos: form.contactos.map((x, xi) => xi === i ? { ...x, telefono: e.target.value } : x) })} />
                      <Input placeholder="Relación" value={c.relacion} onChange={e => setForm({ ...form, contactos: form.contactos.map((x, xi) => xi === i ? { ...x, relacion: e.target.value } : x) })} />
                      <Button size="icon" variant="ghost" onClick={() => setForm({ ...form, contactos: form.contactos.filter((_, xi) => xi !== i) })}><IconX className="size-4" /></Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="w-fit" onClick={() => setForm({ ...form, contactos: [...form.contactos, { nombre: "", telefono: "", relacion: "" }] })}><IconPlus className="mr-1 size-4" /> Agregar contacto</Button>
                </div>
              </section>

              <section className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">Control de Asistencia y Desempeño</h3>
                <div className="flex flex-col gap-1.5 sm:w-56">
                  <Label htmlFor="f-jornada">Jornada base (horas semanales)</Label>
                  <Input id="f-jornada" type="number" min={1} max={80} value={form.jornadaBaseHoras} onChange={e => setForm({ ...form, jornadaBaseHoras: e.target.value })} placeholder={`Ej.: ${configuracion?.jornadaSemanalEstandar ?? 45}`} />
                </div>
                {(editando.datosLaborales?.horasExtras?.length ?? 0) > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-sm font-medium">Horas extras ({editando.datosLaborales!.horasExtras!.length})</p>
                    <ul className="text-sm text-muted-foreground">
                      {editando.datosLaborales!.horasExtras!.map(h => <li key={h.id}>{h.fecha}: {h.horas} h — {h.motivo}</li>)}
                    </ul>
                  </div>
                )}
                <div className="mt-2 grid items-end gap-2 sm:grid-cols-4">
                  <Input type="date" value={horaExtra.fecha} onChange={e => setHoraExtra({ ...horaExtra, fecha: e.target.value })} aria-label="Fecha hora extra" />
                  <Input type="number" min={1} step={0.5} placeholder="Horas" value={horaExtra.horas} onChange={e => setHoraExtra({ ...horaExtra, horas: e.target.value })} aria-label="Horas" />
                  <Input placeholder="Motivo" value={horaExtra.motivo} onChange={e => setHoraExtra({ ...horaExtra, motivo: e.target.value })} aria-label="Motivo" />
                  <Button variant="outline" onClick={agregarHoraExtra}><IconPlus className="mr-1 size-4" /> Hora extra</Button>
                </div>
                {(editando.datosLaborales?.evaluaciones?.length ?? 0) > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-sm font-medium">Evaluaciones ({editando.datosLaborales!.evaluaciones!.length})</p>
                    <ul className="text-sm text-muted-foreground">
                      {editando.datosLaborales!.evaluaciones!.map(ev => <li key={ev.id}>{ev.fecha}: {ev.puntaje}/7{ev.comentarios ? ` — ${ev.comentarios}` : ""}</li>)}
                    </ul>
                  </div>
                )}
                <div className="mt-2 grid items-end gap-2 sm:grid-cols-4">
                  <Input type="date" value={evaluacion.fecha} onChange={e => setEvaluacion({ ...evaluacion, fecha: e.target.value })} aria-label="Fecha evaluación" />
                  <Input type="number" min={1} max={7} placeholder="Puntaje 1-7" value={evaluacion.puntaje} onChange={e => setEvaluacion({ ...evaluacion, puntaje: e.target.value })} aria-label="Puntaje" />
                  <Input placeholder="Comentarios" value={evaluacion.comentarios} onChange={e => setEvaluacion({ ...evaluacion, comentarios: e.target.value })} aria-label="Comentarios evaluación" />
                  <Button variant="outline" onClick={agregarEvaluacion}><IconPlus className="mr-1 size-4" /> Evaluación</Button>
                </div>
              </section>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditandoId(null)}>Cancelar</Button>
            <Button onClick={guardarFicha}>Guardar ficha</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de feriado */}
      <Dialog open={!!formFeriado} onOpenChange={open => !open && setFormFeriado(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{formFeriado?.id ? "Editar" : "Nuevo"} feriado</DialogTitle>
            <DialogDescription>Alimenta la proyección de cobertura operativa.</DialogDescription>
          </DialogHeader>
          {formFeriado && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fer-fecha">Fecha *</Label>
                <Input id="fer-fecha" type="date" value={formFeriado.fecha} onChange={e => setFormFeriado({ ...formFeriado, fecha: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fer-nombre">Nombre *</Label>
                <Input id="fer-nombre" value={formFeriado.nombre} onChange={e => setFormFeriado({ ...formFeriado, nombre: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={formFeriado.irrenunciable} onCheckedChange={v => setFormFeriado({ ...formFeriado, irrenunciable: v })} /> Irrenunciable (exige cobertura completa)</label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormFeriado(null)}>Cancelar</Button>
            <Button onClick={guardarFeriado}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
