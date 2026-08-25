"use client"

import * as React from "react"
import { useCompassStore, useStoreRehydrated, STORE_VERSION } from "@/lib/store"
import { STORE_KEY } from "@/lib/store-backup"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { IconCheck, IconAlertTriangle, IconDownload, IconTrash, IconRefresh, IconEye, IconHistory, IconFlask, IconBook, IconChevronDown, IconMapPin } from "@tabler/icons-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@workspace/ui/components/collapsible"

type ModuleState = "pendiente" | "cargando" | "ok" | "error"

interface Paso { desc: string; estado: ModuleState; error?: string }

interface ModReport {
  id: string
  label: string
  rank: number
  status: ModuleState
  count: number
  errores: string[]
  pasos: Paso[]
  detalle?: unknown
}

const PLAN: Record<string, string[]> = {
  ma: [
    "Crear Estado Ocupación: TEST-EdO-EnLimpieza (rojo) — para probar que la dona de EF cambia de color",
    "Crear Categoría Macro: TEST-MACRO-TorreQA — etiqueta para Torre",
    "Crear Categoría Micro: TEST-MICRO-PisoQA — etiqueta para Piso",
    "Crear Categoría Unidad: TEST-CATU-LoftQA — etiqueta para Loft",
    "Crear Condición Especial: TEST-VULN-ElectroQA — vulnerabilidad para MP",
    "Crear Estado Inmobiliario: TEST-EINM-PreReservaQA — estado para VU propietario",
    "Crear Contacto Emergencia: TEST-EMER-CerrajeroQA — teléfono 9999 0001",
    "Crear Banco: TEST-BANCO-BancoQA — para ficha PE/FI",
  ],
  tu: ["Crear Plantilla: TU-TEST-LoftQA (45 m², $120.000) con categoría TEST-CATU-LoftQA"],
  mp: ["Crear Persona: 99.999.999-9 (TEST Persona QA Uno) con condición ElectroQA", "Crear Persona: 88.888.888-8 (TEST Persona QA Dos)"],
  "ef-macro": ["Crear Torre: SectorTEST (etiqueta TEST-MACRO-TorreQA) — DescripMSectorTEST"],
  "ef-micro": ["Crear Piso: Piso99-TEST (etiqueta TEST-MICRO-PisoQA) dentro de SectorTEST"],
  "ef-unidad": ["Crear Depto: 999 (tipo LoftQA, estado EnLimpieza, en Piso99-TEST)", "Crear Estacionamiento: E-999 (en Superficie TEST, tipo Estacionamiento)"],
  vu: ["Amarrar Propietario: 99.999.999-9 → Depto 999 (estado PreReservaQA)", "Amarrar Propietario: 99.999.999-9 → Estacionamiento E-999", "Amarrar Arrendatario: 88.888.888-8 → Depto 999 (2026-08-20 a 2027-08-20)"],
  pi: ["Publicar en vitrina: E-999 en venta ($8.500.000) con imagen por referencia", "Registrar lead TEST Lead QA → notificación email_simulado al propietario"],
}

const TITULOS: Record<string, string> = {
  ma: "1. Diccionario — categorías y estados",
  tu: "2. Plantilla del depto",
  mp: "3. Personas",
  "ef-macro": "4. Torre",
  "ef-micro": "5. Piso",
  "ef-unidad": "6. Deptos y Estacionamientos",
  vu: "7. Amarras — quién vive dónde",
  pi: "8. Vitrina Inmobiliaria (PI)",
}

const COMO_LLEGAR: Record<string, string> = {
  ma: "Sistema → Maestros Administrativos → pestañas Categorías / Estados",
  tu: "Inventario → Tipos de Unidad → busca TU-TEST-LoftQA",
  mp: "Comunidad → Directorio de Personas → busca 99.999.999-9",
  "ef-macro": "Inventario → Estructura Física → pestaña SectorTEST",
  "ef-micro": "Inventario → Estructura Física → abre SectorTEST → verás Piso99-TEST",
  "ef-unidad": "Inventario → Estructura Física → tabla filtra 999 y E-999",
  vu: "Comunidad → Directorio de Personas → abre 99.999.999-9 → pestaña Unidades Vinculadas",
  pi: "Comunidad → Portal Inmobiliario → tarjeta E-999",
}

const COMO_LLEGAR_HREF: Record<string, string> = {
  ma: "/admin/maestros",
  tu: "/inventario/tipos",
  mp: "/comunidad/personas",
  "ef-macro": "/inventario/estructura",
  "ef-micro": "/inventario/estructura",
  "ef-unidad": "/inventario/estructura",
  vu: "/comunidad/personas",
  pi: "/comunidad/portal",
}

interface SeedReport {
  ok: boolean
  timestamp: string
  version: number
  modulos: ModReport[]
  historia: { capitulo: string; estado: ModuleState; rank: number }[]
  erroresGlobales: string[]
}

const HISTORIA = [
  { capitulo: "Prólogo - El Diccionario", rank: 0, relato: "María acuerda el idioma: Torre/Piso, Depto/Casa, estados y condiciones. Es el diccionario MA/CF.", gear: "MA.categoriasMacro/Micro/Unidad + estadosOcupacion + CF Rank 0", href: "/admin/maestros" },
  { capitulo: "Cap.1 - El Arquitecto", rank: 1, relato: "Dibuja plantilla Loft 45m2 (TU) y levanta Torre → Piso → Depto 999 (EF). No puedes entregar llave sin edificio.", gear: "TU Rank1 → EF macro→micro→unidad Rank2", href: "/inventario/estructura" },
  { capitulo: "Cap.2 - Llega la Gente", rank: 3, relato: "Registra a Carlos 99.999.999-9 (MP) y lo amarra a 999 como Propietario (VU).", gear: "MP Rank1 → VU Rank3 depende MP+EF", href: "/comunidad/personas" },
  { capitulo: "Cap.3 - Vidas Paralelas", rank: 4, relato: "Jorge (conserje PE), Ana (bodega IR) y Pérez (CO) operan en paralelo tras VU.", gear: "PE/IR/CO Rank4 paralelo", href: "/operaciones/solicitudes" },
  { capitulo: "Epílogo - Huella", rank: 99, relato: "Todo deja evento inmutable en AM y dashboard RE muestra tasa huérfanos 0.", gear: "AM Rank99 sumidero", href: "/admin/metricas" },
]

const PENDIENTES: { id: string; archivo: string; lineas: number; desc: string; pruebas: string[] }[] = [
  { id: "AD", archivo: "AD - Gestión Administrativa.md", lineas: 38, desc: "Panel admin, cajón comunidad y RRHH", pruebas: ["Cajón Comunidad: propietario con Notificar Residente", "Directiva con cargo y firma digital", "Cajón RRHH vinculado a PE"] },
  { id: "CO", archivo: "CO - Comunicacion Vecinos.md", lineas: 75, desc: "Mensajería masiva y buzón ciudadano", pruebas: ["Envío masivo por filtro EF/MP", "Plantilla con variable [Nombre_Usuario]", "Buzón felicitaciones/sugerencias/reclamos con ticket"] },
  { id: "CT", archivo: "CT - Certificados.md", lineas: 44, desc: "Documentos oficiales y acreditaciones", pruebas: ["Certificado Unidad Al Día con firma digital", "Plantilla CT con datos ST"] },
  { id: "CV", archivo: "CV - Visor de Mensajes.md", lineas: 68, desc: "Carrusel en pantallas comunes", pruebas: ["Carrusel público con rotación", "Visor con contenido de CO/RE"] },
  { id: "FI", archivo: "FI - Finanzas y Morosidad.md", lineas: 76, desc: "Fondos, emisión GC y cobranza", pruebas: ["Maestro Fondos con imputación", "Emisión GC fija vs prorrateo", "Cálculo mora y corte servicios", "Informe diferencia ajuste manual"] },
  { id: "GD", archivo: "GD - Gestión de Directiva.md", lineas: 40, desc: "Gobernanza y actas", pruebas: ["Acta con firma directiva", "Votación asamblea por RP"] },
  { id: "GE", archivo: "GE - Gestion de Solicitudes.md", lineas: 54, desc: "Tickets con workflow automático", pruebas: ["Ticket Nuevo → En Revisión al abrir", "Requiere Acción Vecino → En Proceso", "SLA dashboard GE"] },
  { id: "IN", archivo: "IN - Infracciones y Multas.md", lineas: 53, desc: "Faltas y sanciones", pruebas: ["Infracción con multa y vínculo FI", "Cierre multa → cargo FI"] },
  { id: "IR", archivo: "IR - Inventario y Recursos.md", lineas: 68, desc: "Activos e insumos por EF/PE", pruebas: ["Insumo con área destino y stock", "Vinculación IR ↔ EF ↔ PE"] },
  { id: "MT", archivo: "MT - Mantenimiento y Proyectos.md", lineas: 65, desc: "Trabajos y planificación financiera", pruebas: ["Mantención preventiva con alerta", "Proyecto con fondo FI"] },
  { id: "PE", archivo: "PE - Personal y Servicios.md", lineas: 93, desc: "RRHH, contratos, bitácora y turnos", pruebas: ["Ficha trabajador con AFP/Isapre y banco", "Feriados → proyección reemplazos y costo FI", "Bitácora visita/encomienda/contratista", "Cierre turno con checklist jornada"] },
  { id: "PI", archivo: "PI - Portal Inmobiliario.md", lineas: 27, desc: "Vitrina venta/arriendo unidades", pruebas: ["Unidad en portal con VU", "Contacto interesado → MP"] },
  { id: "PL", archivo: "PL - Liquidaciones y Remuneraciones.md", lineas: 69, desc: "Haberes y descuentos", pruebas: ["Liquidación con asistencia PE", "Generación documento legal"] },
  { id: "RA", archivo: "RA - Reservas y Amenities.md", lineas: 41, desc: "Agendamiento espacios comunes", pruebas: ["Reserva amenity con conflicto horario", "Cobro RA → FI"] },
  { id: "RE", archivo: "RE - Reporteria y Dashboards.md", lineas: 66, desc: "Dashboards y segmentación", pruebas: ["Dashboard demográfico/operativo/financiero", "Segmentación EF+MP+tenencia + distribución CO/RE", "RE_DASHBOARD_VIEW auditado"] },
]

function BadgeEstado({ s }: { s: ModuleState }) {
  if (s === "ok") return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">🟢 Listo</Badge>
  if (s === "error") return <Badge variant="destructive">🔴 Con error</Badge>
  if (s === "cargando") return <Badge className="bg-sky-600">🔵 Cargando...</Badge>
  return <Badge variant="outline">⏳ Sin empezar</Badge>
}

export default function QaLabPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const store = useCompassStore()

  const [report, setReport] = React.useState<SeedReport | null>(null)
  const [activeTab, setActiveTab] = React.useState("carga")
  const [loading, setLoading] = React.useState(false)
  const [detalle, setDetalle] = React.useState<ModReport | null>(null)
  const [msg, setMsg] = React.useState<{ type: "ok" | "error"; text: string } | null>(null)
  const [ultimaFase, setUltimaFase] = React.useState<string | null>(null)

  const isDev = process.env.NODE_ENV !== "production"

  const modulosOrden: { id: string; label: string; rank: number; fase: string }[] = [
    { id: "ma", label: TITULOS["ma"]!, rank: 0, fase: "Paso 1" },
    { id: "tu", label: TITULOS["tu"]!, rank: 1, fase: "Paso 2" },
    { id: "mp", label: TITULOS["mp"]!, rank: 1, fase: "Paso 3" },
    { id: "ef-macro", label: TITULOS["ef-macro"]!, rank: 2, fase: "Paso 4" },
    { id: "ef-micro", label: TITULOS["ef-micro"]!, rank: 2, fase: "Paso 5" },
    { id: "ef-unidad", label: TITULOS["ef-unidad"]!, rank: 2, fase: "Paso 6" },
    { id: "vu", label: TITULOS["vu"]!, rank: 3, fase: "Paso 7" },
    { id: "pi", label: TITULOS["pi"]!, rank: 4, fase: "Paso 8" },
  ]

  const FASE_MODULOS: Record<string, string[]> = {
    "0": ["ma"],
    "1": ["tu", "mp"],
    "2": ["ef-macro", "ef-micro", "ef-unidad"],
    "3": ["vu"],
    "4": ["pi"],
    "todo": ["ma", "tu", "mp", "ef-macro", "ef-micro", "ef-unidad", "vu", "pi"],
  }

  const LABEL_FASE: Record<string, string> = {
    "0": "1. Diccionario — categorías y estados",
    "1": "2. Plantillas y Personas",
    "2": "3. Torres, Pisos y Deptos",
    "3": "4. Amarras — personas a deptos",
    "4": "5. Vitrina — publicación y lead",
    "todo": "Carga completa",
  }

  const getHistoriaEstado = React.useCallback((rank: number): ModuleState => {
    if (!report) return "pendiente"
    const mods = report.modulos.filter(m => m.rank === rank)
    if (mods.length === 0) return "pendiente"
    if (mods.some(m => m.status === "error")) return "error"
    if (mods.every(m => m.status === "ok")) return "ok"
    return "pendiente"
  }, [report])

  const ensureHydrated = React.useCallback(() => {
    if (!hasHydrated) {
      setMsg({ type: "error", text: "El almacenamiento aún se está hidratando. Intenta de nuevo." })
      return false
    }
    return true
  }, [hasHydrated])

  const cargarFase0 = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["ma"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    const run = (idx: number, fn: () => void) => {
      try { fn(); pasos[idx]!.estado = "ok" } catch (e) { pasos[idx]!.estado = "error"; pasos[idx]!.error = String(e) }
    }
    run(0, () => s.saveMaestro("estadosOcupacion", { id: "test-edo-enlimpieza", nombre: "TEST-EdO-EnLimpieza", color: "destructive", hex: "#ef4444" } as any))
    run(1, () => s.saveMaestro("categoriasMacro", { id: "test-macro-torreqa", nombre: "TEST-MACRO-TorreQA" } as any))
    run(2, () => s.saveMaestro("categoriasMicro", { id: "test-micro-pisoqa", nombre: "TEST-MICRO-PisoQA" } as any))
    run(3, () => s.saveMaestro("categoriasUnidad", { id: "test-catu-loftqa", nombre: "TEST-CATU-LoftQA" } as any))
    run(4, () => s.saveMaestro("condicionesEspeciales", { id: "test-vuln-electroqa", nombre: "TEST-VULN-ElectroQA", color: "bg-blue-500 text-white" } as any))
    run(5, () => s.saveMaestro("estadosInmobiliarios", { id: "test-einm-prereservaqa", nombre: "TEST-EINM-PreReservaQA" } as any))
    run(6, () => s.saveMaestro("contactosEmergencia", { id: "test-emer-cerrajeroqa", nombre: "TEST-EMER-CerrajeroQA", telefono: "+56 9 9999 0001", categoria: "tecnico" } as any))
    run(7, () => s.saveMaestro("bancos", { id: "test-banco-bancoqa", nombre: "TEST-BANCO-BancoQA" } as any))
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "ma", label: TITULOS["ma"]!, rank: 0, status: errores.length ? "error" : "ok", count: 8, errores, pasos }
  }, [])

  const cargarFase1TU = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["tu"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    try { s.saveTipoUnidad({ id: "test-tu-loftqa", nombre: "TU-TEST-LoftQA", categoria: "TEST-CATU-LoftQA", metraje: 45, montoBaseGc: 120000, descripcion: "DescLoftTEST", activo: true, historialTarifas: [{ id: "t-test-loftqa", monto: 120000, fechaVigencia: "2026-08-20", creadoEn: "2026-08-20" }] } as any); pasos[0]!.estado = "ok" } catch (e) { pasos[0]!.estado = "error"; pasos[0]!.error = String(e) }
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "tu", label: TITULOS["tu"]!, rank: 1, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  const cargarFase1MP = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["mp"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    try { s.savePersona({ id: "test-p-99", rut: "99.999.999-9", nombreCompleto: "TEST Persona QA Uno", nombres: "TEST", apellidos: "Persona QA Uno", email: "test.qa@compass.cl", telefonoMovil: "+56 9 9999 9999", estadoCuenta: "activa", condicionesEspecialesIds: ["test-vuln-electroqa"], roles: ["residente"] } as any); pasos[0]!.estado = "ok" } catch (e) { pasos[0]!.estado = "error"; pasos[0]!.error = String(e) }
    try { s.savePersona({ id: "test-p-88", rut: "88.888.888-8", nombreCompleto: "TEST Persona QA Dos", nombres: "TEST", apellidos: "Persona QA Dos", email: "test.qa2@compass.cl", telefonoMovil: "+56 9 8888 8888", estadoCuenta: "activa", condicionesEspecialesIds: [], roles: ["residente"] } as any); pasos[1]!.estado = "ok" } catch (e) { pasos[1]!.estado = "error"; pasos[1]!.error = String(e) }
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "mp", label: TITULOS["mp"]!, rank: 1, status: errores.length ? "error" : "ok", count: 2, errores, pasos }
  }, [])

  const cargarFase2Macro = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["ef-macro"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    try { s.saveMacroSector({ id: "test-macro-sectortest", nombre: "SectorTEST", etiqueta: "TEST-MACRO-TorreQA", descripcion: "DescripMSectorTEST" } as any); pasos[0]!.estado = "ok" } catch (e) { pasos[0]!.estado = "error"; pasos[0]!.error = String(e) }
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "ef-macro", label: TITULOS["ef-macro"]!, rank: 2, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  const cargarFase2Micro = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["ef-micro"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    try { s.saveMicroSector({ id: "test-micro-piso99", nombre: "Piso99-TEST", etiqueta: "TEST-MICRO-PisoQA", macroSectorId: "test-macro-sectortest" } as any); pasos[0]!.estado = "ok" } catch (e) { pasos[0]!.estado = "error"; pasos[0]!.error = String(e) }
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "ef-micro", label: TITULOS["ef-micro"]!, rank: 2, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  const cargarFase2Unidad = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["ef-unidad"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    try { s.saveUnidad({ id: "test-u-999", numero: "999", etiqueta: "TEST-CATU-LoftQA", microSectorId: "test-micro-piso99", tipoUnidadId: "test-tu-loftqa", estadoId: "test-edo-enlimpieza", rolSii: "999-99", metraje: 45, prorrateo: 0.01, servicios: {} } as any); pasos[0]!.estado = "ok" } catch (e) { pasos[0]!.estado = "error"; pasos[0]!.error = String(e) }
    try {
      const estMacro = s.macroSectores.find(m => m.id === "estacionamientos")
      const microExist = s.microSectores.find(m => m.id === "test-est-sup-qa")
      if (!microExist && estMacro) s.saveMicroSector({ id: "test-est-sup-qa", nombre: "Superficie TEST", etiqueta: "Piso", macroSectorId: "estacionamientos" } as any)
      s.saveUnidad({ id: "test-u-e-999", numero: "E-999", etiqueta: "Estacionamiento", microSectorId: "test-est-sup-qa", tipoUnidadId: "tipo-es-1", estadoId: "vacante", rolSii: "", metraje: 12.5, prorrateo: 0.005, servicios: {} } as any); pasos[1]!.estado = "ok"
    } catch (e) { pasos[1]!.estado = "error"; pasos[1]!.error = String(e) }
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "ef-unidad", label: TITULOS["ef-unidad"]!, rank: 2, status: errores.length ? "error" : "ok", count: 2, errores, pasos }
  }, [])

  const cargarFase3VU = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["vu"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    const r1 = s.saveVinculo({ id: "test-v-prop-999", personaId: "test-p-99", unidadId: "test-u-999", rol: "propietario", fechaInicio: "2026-08-20", estadoOcupacionPropiedad: "test-einm-prereservaqa", permiteVerFinanzas: true } as any)
    if (!r1.ok) { pasos[0]!.estado = "error"; pasos[0]!.error = r1.error } else pasos[0]!.estado = "ok"
    const r2 = s.saveVinculo({ id: "test-v-prop-e999", personaId: "test-p-99", unidadId: "test-u-e-999", rol: "propietario", fechaInicio: "2026-08-20", permiteVerFinanzas: false } as any)
    if (!r2.ok) { pasos[1]!.estado = "error"; pasos[1]!.error = r2.error } else pasos[1]!.estado = "ok"
    const r3 = s.saveVinculo({ id: "test-v-arr-999", personaId: "test-p-88", unidadId: "test-u-999", rol: "arrendatario", fechaInicio: "2026-08-20", fechaFin: "2027-08-20", permiteVerFinanzas: false } as any)
    if (!r3.ok) { pasos[2]!.estado = "error"; pasos[2]!.error = r3.error } else pasos[2]!.estado = "ok"
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "vu", label: TITULOS["vu"]!, rank: 3, status: errores.length ? "error" : "ok", count: 3, errores, pasos }
  }, [])

  const cargarFase4PI = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["pi"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    const r1 = s.savePublicacionPortal({ id: "test-pub-pi-e999", unidadId: "test-u-e-999", operacion: "venta", precio: 8500000, moneda: "CLP", descripcion: "Estacionamiento TEST publicado en vitrina", urlMapa: "", imagenes: [{ nombre: "test-foto-e999.jpg", tipoMime: "image/jpeg", tamanoKB: 120, url: "https://placeholder.supabase.co/test-foto-e999.jpg" }], activa: true, fechaPublicacion: "2026-08-24" } as any)
    if (!r1.ok) { pasos[0]!.estado = "error"; pasos[0]!.error = r1.error } else pasos[0]!.estado = "ok"
    const r2 = s.saveLeadPortal({ id: "test-lead-pi-1", publicacionId: "test-pub-pi-e999", nombreContacto: "TEST Lead QA", contacto: "+56 9 0000 0001", mensaje: "Interesado en E-999, ¿acepta oferta?", fecha: "2026-08-24", atendido: false } as any)
    if (!r2.ok) { pasos[1]!.estado = "error"; pasos[1]!.error = r2.error } else pasos[1]!.estado = "ok"
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "pi", label: TITULOS["pi"]!, rank: 4, status: errores.length ? "error" : "ok", count: 2, errores, pasos }
  }, [])

  const buildHistoria = React.useCallback((mods: ModReport[]): SeedReport["historia"] => {
    return HISTORIA.map(h => ({ capitulo: h.capitulo, estado: (() => {
      const rankMods = mods.filter(m => m.rank === h.rank)
      if (rankMods.length === 0) return "pendiente" as ModuleState
      if (rankMods.some(m => m.status === "error")) return "error" as ModuleState
      if (rankMods.every(m => m.status === "ok")) return "ok" as ModuleState
      return "pendiente" as ModuleState
    })(), rank: h.rank }))
  }, [])

  const runFase = React.useCallback(async (fase: string) => {
    if (!ensureHydrated()) return
    setLoading(true)
    setMsg(null)
    const start = Date.now()
    const mods: ModReport[] = []
    try {
      if (fase === "0" || fase === "todo") {
        mods.push(await cargarFase0())
      }
      if (fase === "1" || fase === "todo") {
        if (fase === "1") {
          const prev = await cargarFase0()
          if (prev.status === "ok") mods.push(prev); else mods.push(prev)
        }
        mods.push(await cargarFase1TU())
        mods.push(await cargarFase1MP())
      }
      if (fase === "2" || fase === "todo") {
        if (fase === "2") {
          mods.push(await cargarFase0())
          mods.push(await cargarFase1TU())
          mods.push(await cargarFase1MP())
        }
        mods.push(await cargarFase2Macro())
        mods.push(await cargarFase2Micro())
        mods.push(await cargarFase2Unidad())
      }
      if (fase === "3" || fase === "todo") {
        if (fase === "3") {
          mods.push(await cargarFase0())
          mods.push(await cargarFase1TU())
          mods.push(await cargarFase1MP())
          mods.push(await cargarFase2Macro())
          mods.push(await cargarFase2Micro())
          mods.push(await cargarFase2Unidad())
        }
        mods.push(await cargarFase3VU())
      }
      if (fase === "4" || fase === "todo") {
        if (fase === "4") {
          mods.push(await cargarFase0())
          mods.push(await cargarFase1TU())
          mods.push(await cargarFase1MP())
          mods.push(await cargarFase2Macro())
          mods.push(await cargarFase2Micro())
          mods.push(await cargarFase2Unidad())
          mods.push(await cargarFase3VU())
        }
        mods.push(await cargarFase4PI())
      }
      if (fase === "todo") {
        // ya se cargaron todos en orden
      }
      const historia = buildHistoria(mods)
      const erroresGlobales = mods.flatMap(m => m.errores.map(e => `${m.label}: ${e}`))
      const ok = erroresGlobales.length === 0
      const rep: SeedReport = { ok, timestamp: new Date().toISOString(), version: STORE_VERSION, modulos: mods, historia, erroresGlobales }
      setReport(rep)
      setUltimaFase(fase)
      setActiveTab("carga")
      setMsg({ type: ok ? "ok" : "error", text: ok ? `Carga ${fase === "todo" ? "completa" : `FASE ${fase}`} OK en ${Date.now() - start}ms` : `Carga con ${erroresGlobales.length} errores` })
    } finally {
      setLoading(false)
    }
  }, [cargarFase0, cargarFase1MP, cargarFase1TU, cargarFase2Macro, cargarFase2Micro, cargarFase2Unidad, cargarFase3VU, cargarFase4PI, buildHistoria, ensureHydrated])

  const limpiar = React.useCallback(async () => {
    if (!ensureHydrated()) return
    setLoading(true)
    const errores: string[] = []
    const s = useCompassStore.getState()
    // inverso PI -> VU -> EF unidades -> EF micro -> EF macro -> MP -> TU -> MA
    // PI no define removeLeadPortal (los leads son histórico); se purgan por filtro.
    useCompassStore.setState(st => ({
      leadsPortal: st.leadsPortal.filter(l => l.id !== "test-lead-pi-1"),
      notificaciones: st.notificaciones.filter(n => n.moduloOrigen !== "PI" || !n.destinatarioPersonaId?.startsWith("test-")),
    }))
    const rPub = s.removePublicacionPortal("test-pub-pi-e999")
    if (!rPub.ok) errores.push(rPub.error || "pub")
    for (const id of ["test-v-arr-999", "test-v-prop-e999", "test-v-prop-999"]) {
      const r = s.removeVinculo(id)
      if (!r.ok) errores.push(r.error || id)
    }
    for (const id of ["test-u-e-999", "test-u-999"]) {
      const r = s.removeUnidad(id)
      if (!r.ok) errores.push(r.error || id)
    }
    for (const id of ["test-est-sup-qa", "test-micro-piso99"]) {
      const r = s.removeMicroSector(id)
      if (!r.ok) errores.push(r.error || id)
    }
    for (const id of ["test-macro-sectortest"]) {
      const r = s.removeMacroSector(id)
      if (!r.ok) errores.push(r.error || id)
    }
    for (const id of ["test-p-99", "test-p-88"]) {
      const r = s.removePersona(id)
      if (!r.ok) errores.push(r.error || id)
    }
    for (const id of ["test-tu-loftqa"]) {
      const r = s.removeTipoUnidad(id)
      if (!r.ok) errores.push(r.error || id)
    }
    const maestros: [keyof typeof s.maestros, string][] = [
      ["bancos", "test-banco-bancoqa"],
      ["contactosEmergencia", "test-emer-cerrajeroqa"],
      ["estadosInmobiliarios", "test-einm-prereservaqa"],
      ["condicionesEspeciales", "test-vuln-electroqa"],
      ["categoriasUnidad", "test-catu-loftqa"],
      ["categoriasMicro", "test-micro-pisoqa"],
      ["categoriasMacro", "test-macro-torreqa"],
      ["estadosOcupacion", "test-edo-enlimpieza"],
    ]
    for (const [k, id] of maestros) {
      const r = (s.removeMaestro as any)(k, id)
      if (!r.ok) errores.push(r.error || `${String(k)}:${id}`)
    }
    setLoading(false)
    if (errores.length) setMsg({ type: "error", text: `Limpieza con ${errores.length} bloqueos (dependencias): ${errores.slice(0,2).join("; ")}` })
    else {
      setMsg({ type: "ok", text: "TEST-* limpio correctamente" })
      setReport(null)
      setUltimaFase(null)
    }
  }, [ensureHydrated])

  const exportar = React.useCallback(async () => {
    if (!report) { setMsg({ type: "error", text: "Nada que exportar: ejecuta una carga primero" }); return }
    const s = useCompassStore.getState()
    const payload = {
      _summary: {
        exportDate: new Date().toISOString(),
        type: "seed-report",
        ok: report.ok,
        version: STORE_VERSION,
      },
      report,
      diff: {
        tiposUnidad: s.tiposUnidad.filter(t => t.id.startsWith("test-")).length,
        macroSectores: s.macroSectores.filter(m => m.id.startsWith("test-")).length,
        microSectores: s.microSectores.filter(m => m.id.startsWith("test-")).length,
        unidades: s.unidades.filter(u => u.id.startsWith("test-")).length,
        personas: s.personas.filter(p => p.id.startsWith("test-")).length,
        vinculos: s.vinculos.filter(v => v.id.startsWith("test-")).length,
      },
      historiaDetalle: HISTORIA.map(h => ({ ...h, estado: getHistoriaEstado(h.rank) })),
    }
    const jsonStr = JSON.stringify(payload, null, 2)
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
    const fileName = `compass-seed-report-${stamp}.json`
    const blob = new Blob([jsonStr], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
    try {
      const res = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: jsonStr, fileName }) })
      const data = await res.json()
      if (data.ok) setMsg({ type: "ok", text: `Exportado: ${fileName} + copia en ${data.path}` })
      else setMsg({ type: "ok", text: `Descargado: ${fileName} (repo: ${data.error})` })
    } catch {
      setMsg({ type: "ok", text: `Descargado: ${fileName}` })
    }
  }, [report, getHistoriaEstado])

  const validar = React.useCallback(() => {
    if (!ensureHydrated()) return
    const s = useCompassStore.getState()
    const errores: string[] = []
    // check dangling FKs para TEST-*
    for (const u of s.unidades.filter(u => u.id.startsWith("test-"))) {
      if (!s.microSectores.find(m => m.id === u.microSectorId)) errores.push(`unidad ${u.id} micro huérfano ${u.microSectorId}`)
      if (!s.tiposUnidad.find(t => t.id === u.tipoUnidadId)) errores.push(`unidad ${u.id} tipo huérfano ${u.tipoUnidadId}`)
      if (u.estadoId && !s.maestros.estadosOcupacion.find(e => e.id === u.estadoId)) errores.push(`unidad ${u.id} estado huérfano ${u.estadoId}`)
    }
    for (const v of s.vinculos.filter(v => v.id.startsWith("test-"))) {
      if (!s.personas.find(p => p.id === v.personaId)) errores.push(`vinculo ${v.id} persona huérfana`)
      if (!s.unidades.find(u => u.id === v.unidadId)) errores.push(`vinculo ${v.id} unidad huérfana`)
    }
    const tasa = errores.length === 0 ? 0 : errores.length / (s.unidades.length + s.vinculos.length)
    if (errores.length === 0) setMsg({ type: "ok", text: `Validación OK — tasa huérfanos 0, TEST-* coherente` })
    else setMsg({ type: "error", text: `Validación: ${errores.length} huérfanos, tasa ${(tasa*100).toFixed(1)}% — ${errores.slice(0,2).join("; ")}` })
    if (report) setReport({ ...report, erroresGlobales: errores, ok: errores.length === 0 })
  }, [ensureHydrated, report])

  if (!isDev) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold">Laboratorio QA no disponible en producción</h1>
        <p className="text-muted-foreground">Solo visible en desarrollo (`NODE_ENV !== production`).</p>
      </div>
    )
  }

  if (!hasHydrated) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><IconFlask className="size-7 text-primary" /> Laboratorio QA</h1>
          <p className="text-muted-foreground">Tu sala de pruebas segura. Acá puedes poblar datos de prueba sin tocar los datos reales.</p>
          <p className="text-xs text-muted-foreground">Todo lo que crees acá empieza con <code className="font-mono text-xs">TEST-*</code> y se puede borrar con un click. No afecta a la comunidad real.</p>
        </div>
        <Card className="bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900">
          <CardContent className="pt-4">
            <p className="font-semibold text-sm flex items-center gap-2"><IconBook className="size-4 text-blue-600" /> ¿Cómo probar? Te lo dejo simple:</p>
            <ol className="list-decimal pl-5 text-sm mt-2 space-y-1">
              <li><b className="text-emerald-700 dark:text-emerald-400">Poblar todo de una vez</b> — aprieta ese botón verde y listo. Es como armar la casa completa de un golpe.</li>
              <li>Mira que cada tarjeta quede en <Badge className="bg-emerald-600 text-white text-[10px]">🟢 Listo</Badge> — si alguna sale en rojo, aprieta <b>Ver detalle</b> para ver qué pasó.</li>
              <li>Revisa <b>Cómo va quedando</b> para ver cómo la comunidad de María y Carlos va tomando forma.</li>
              <li>Cuando termines, <b>Borrar todo lo de prueba</b> deja todo limpio.</li>
            </ol>
          </CardContent>
        </Card>
        <div className="flex flex-wrap gap-2 items-start">
          <Button onClick={() => runFase("todo")} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700"><IconCheck className="size-4 mr-1" /> Poblar todo de una vez (recomendado)</Button>
          <Button variant="outline" onClick={validar} disabled={loading}><IconEye className="size-4 mr-1" /> Revisar que nada quedó suelto</Button>
          <Button variant="outline" onClick={exportar} disabled={!report}><IconDownload className="size-4 mr-1" /> Guardar comprobante</Button>
          <Button variant="destructive" onClick={limpiar} disabled={loading}><IconTrash className="size-4 mr-1" /> Borrar todo lo de prueba</Button>
        </div>
        <details className="text-xs" open={!!ultimaFase && ultimaFase !== "todo"}>
          <summary className="cursor-pointer text-muted-foreground underline">¿Quieres poblar por partes? (avanzado)</summary>
          <div className="flex flex-wrap gap-2 mt-2">
            {[
              { fase: "0", label: "1. Preparar Diccionario (categorías y estados)" },
              { fase: "1", label: "2. Crear Plantillas y Personas" },
              { fase: "2", label: "3. Levantar Torres, Pisos y Deptos" },
              { fase: "3", label: "4. Amarrar personas a deptos" },
              { fase: "4", label: "5. Publicar vitrina PI con lead" },
            ].map(item => {
              const isActive = ultimaFase === item.fase
              const modsFase = isActive && report ? report.modulos.filter(m => FASE_MODULOS[item.fase]!.includes(m.id)) : []
              const hasError = modsFase.some(m => m.status === "error")
              const allOk = modsFase.length > 0 && modsFase.every(m => m.status === "ok")
              return (
                <Button
                  key={item.fase}
                  variant={isActive ? (hasError ? "destructive" : allOk ? "default" : "outline") : "outline"}
                  size="sm"
                  onClick={() => runFase(item.fase)}
                  disabled={loading}
                  className={isActive && allOk ? "bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 ring-2 ring-emerald-500 dark:ring-emerald-400 ring-offset-1 dark:ring-offset-background" : isActive && hasError ? "ring-2 ring-destructive ring-offset-1" : ""}
                >
                  {isActive && allOk ? <><IconCheck className="size-3 mr-1" /> {item.label} ✓</> : isActive && hasError ? <><IconAlertTriangle className="size-3 mr-1" /> {item.label} — con error</> : item.label}
                </Button>
              )
            })}
            <span className="text-[11px] text-muted-foreground w-full">* El sistema necesita este orden: no puedes crear un depto sin antes tener su torre, ni amarrar a alguien sin depto. Por eso el orden importa.</span>
          </div>
        </details>
        <p className="text-[11px] text-muted-foreground">Detalles técnicos: Store v{STORE_VERSION} · key <code className="font-mono text-xs">{STORE_KEY}</code> · Rank 0..3</p>
      </div>

      {msg && <div className={`rounded-lg border p-3 text-sm ${msg.type === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-300" : "bg-destructive/10 border-destructive/40 text-destructive"}`}>{msg.text}</div>}

      {ultimaFase && ultimaFase !== "todo" && report && (() => {
        const modsFase = report.modulos.filter(m => FASE_MODULOS[ultimaFase]!.includes(m.id))
        if (modsFase.length === 0) return null
        const allOk = modsFase.every(m => m.status === "ok")
        const hasError = modsFase.some(m => m.status === "error")
        const totalPasos = modsFase.reduce((acc, m) => acc + (m.pasos?.length || m.count), 0)
        const pasosOk = modsFase.reduce((acc, m) => acc + (m.pasos?.filter(p => p.estado === "ok").length || 0), 0)
        return (
          <Card className={`animate-in fade-in slide-in-from-top-1 duration-300 shadow-sm ${allOk ? "border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-900" : hasError ? "border-destructive/50 bg-destructive/5" : "border-border"}`}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {allOk ? <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400"><IconCheck className="size-4" /> Paso completado — {LABEL_FASE[ultimaFase]}</span> : hasError ? <span className="flex items-center gap-1.5 text-destructive"><IconAlertTriangle className="size-4" /> Paso con error — {LABEL_FASE[ultimaFase]}</span> : <span>{LABEL_FASE[ultimaFase]}</span>}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {allOk ? `Se ejecutaron ${pasosOk}/${totalPasos} pasos correctamente. Revisa abajo el detalle.` : hasError ? `${pasosOk}/${totalPasos} pasos OK — revisa los errores.` : `Detalle de lo realizado`}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {allOk ? <Badge className="bg-emerald-600 text-white">✓ {pasosOk}/{totalPasos} OK</Badge> : <Badge variant={hasError ? "destructive" : "secondary"}>{pasosOk}/{totalPasos} OK</Badge>}
                  {hasError && <Badge variant="destructive">{modsFase.reduce((acc, m) => acc + m.errores.length, 0)} errores</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {modsFase.map(m => (
                <div key={m.id} className={`rounded-lg border p-3 ${m.status === "ok" ? "bg-white dark:bg-card border-emerald-200 dark:border-emerald-900/50" : m.status === "error" ? "bg-white dark:bg-card border-destructive/30" : "bg-muted/20"}`}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="font-semibold text-xs flex items-center gap-1.5">{m.status === "ok" ? <IconCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" /> : m.status === "error" ? <IconAlertTriangle className="size-3.5 text-destructive" /> : <span className="text-muted-foreground">○</span>} {m.label} <span className="font-normal text-muted-foreground">· {modulosOrden.find(x => x.id === m.id)?.fase}</span></p>
                    <BadgeEstado s={m.status} />
                  </div>
                  <ul className="space-y-1">
                    {(m.pasos || []).map((p, i) => (
                      <li key={i} className="flex gap-1.5 text-xs items-start">
                        {p.estado === "ok" ? <IconCheck className="size-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" /> : p.estado === "error" ? <IconAlertTriangle className="size-3.5 text-destructive mt-0.5 shrink-0" /> : <span className="text-muted-foreground mt-0.5">○</span>}
                        <span className={p.estado === "ok" ? "text-emerald-800 dark:text-emerald-300" : p.estado === "error" ? "text-destructive" : ""}>{p.desc}{p.error ? ` — ${p.error}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                  {m.errores.length > 0 && (
                    <div className="mt-2 rounded border border-destructive/30 bg-destructive/5 p-2">
                      <p className="font-semibold text-destructive text-xs flex items-center gap-1"><IconAlertTriangle className="size-3" /> {m.errores.length} errores</p>
                      <ul className="list-disc pl-5 text-xs mt-1 space-y-1">
                        {m.errores.map((e, i) => <li key={i} className="font-mono">{e}</li>)}
                      </ul>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a href={COMO_LLEGAR_HREF[m.id]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline"><IconMapPin className="size-3" /> Abrir dónde verlo →</a>
                    <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setDetalle(m)}><IconEye className="size-3 mr-1" /> Ver JSON técnico</Button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setActiveTab("carga")}><IconEye className="size-3 mr-1" /> Ver en Qué se probó</Button>
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setActiveTab("historia")}><IconHistory className="size-3 mr-1" /> Ver en Cómo va quedando</Button>
              </div>
            </CardContent>
          </Card>
        )
      })()}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="carga" className="gap-1"><IconFlask className="size-4" /> Qué se probó</TabsTrigger>
          <TabsTrigger value="historia" className="gap-1"><IconHistory className="size-4" /> Cómo va quedando</TabsTrigger>
          <TabsTrigger value="eventual" className="gap-1"><IconEye className="size-4" /> Pruebas eventuales</TabsTrigger>
        </TabsList>

        <TabsContent value="carga" className="pt-4 space-y-4">
          {!report ? (
            <div className="space-y-4">
              <Card><CardContent className="py-6 text-center text-muted-foreground text-sm">Aún no has poblado nada.<br />Abajo ves <b>qué se va a probar</b> en cada tarjeta. Aprieta <b className="text-emerald-700 dark:text-emerald-400">Poblar todo de una vez</b> y cada paso se marcará con ✓.</CardContent></Card>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {modulosOrden.map(mo => (
                  <Card key={mo.id} className="border-dashed">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <CardTitle className="text-sm">{mo.label}</CardTitle>
                          <CardDescription className="text-xs">{mo.fase}</CardDescription>
                        </div>
                        <Badge variant="outline">⏳ Sin empezar</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-full justify-between h-7 text-xs">
                            Ver qué se va a probar ({(PLAN[mo.id] || []).length} pasos)
                            <IconChevronDown className="size-3" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-1 pt-2">
                          <ul className="space-y-1">
                            {(PLAN[mo.id] || []).map((desc, i) => (
                              <li key={i} className="flex gap-1.5 text-xs items-start">
                                <span className="text-muted-foreground mt-0.5">○</span>
                                <span>{desc}</span>
                              </li>
                            ))}
                          </ul>
                        </CollapsibleContent>
                      </Collapsible>
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-full justify-between h-7 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><IconMapPin className="size-3" /> ¿Dónde verlo después?</span>
                            <IconChevronDown className="size-3" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-1">
                          <div className="text-xs bg-muted p-2 rounded space-y-1">
                            <p className="flex items-start gap-1"><IconMapPin className="size-3 mt-0.5 shrink-0" /> {COMO_LLEGAR[mo.id]}</p>
                            <a href={COMO_LLEGAR_HREF[mo.id]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">Abrir dónde verlo →</a>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {report.modulos.map(m => {
                const isHighlighted = !!(ultimaFase && ultimaFase !== "todo" && FASE_MODULOS[ultimaFase]?.includes(m.id))
                return (
                <Card key={m.id} id={`mod-${m.id}`} className={`${m.status === "error" ? "border-destructive/50" : m.status === "ok" ? "border-emerald-500/40 bg-emerald-50/20 dark:border-emerald-900/40 dark:bg-emerald-950/20" : ""} ${isHighlighted ? "ring-2 ring-emerald-500 dark:ring-emerald-400 ring-offset-2 dark:ring-offset-background shadow-md animate-in fade-in duration-300" : ""}`}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <CardTitle className="text-sm flex items-center gap-2">{m.label} {isHighlighted && <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0">● Recién ejecutado</Badge>}</CardTitle>
                        <CardDescription className="text-xs">{modulosOrden.find(x => x.id === m.id)?.fase}</CardDescription>
                      </div>
                      <BadgeEstado s={m.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex gap-2 text-xs">
                      {m.errores.length === 0 && m.status === "ok" ? <Badge className="bg-emerald-600">✓ {m.pasos?.length || m.count} pasos OK</Badge> : <Badge variant={m.status === "error" ? "destructive" : "secondary"}>{m.pasos?.filter((p: Paso) => p.estado === "ok").length || 0}/{m.pasos?.length || m.count} pasos</Badge>}
                      {m.errores.length > 0 && <Badge variant="destructive">{m.errores.length} errores</Badge>}
                    </div>
                    <Collapsible defaultOpen={m.status === "error" || isHighlighted}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-between h-7 text-xs">
                          {m.status === "ok" ? `Ver pasos (${m.pasos?.length || m.count})` : m.status === "error" ? `Ver pasos con error` : `Ver pasos`}
                          <IconChevronDown className="size-3" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-2">
                        <ul className="space-y-1">
                            {(m.pasos || (PLAN[m.id] || []).map(desc => ({ desc, estado: m.status === "ok" ? "ok" as ModuleState : "pendiente" as ModuleState })) as Paso[]).map((paso: Paso, i: number) => (
                             <li key={i} className="flex gap-1.5 text-xs items-start">
                               {paso.estado === "ok" ? <IconCheck className="size-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" /> : paso.estado === "error" ? <IconAlertTriangle className="size-3.5 text-destructive mt-0.5 shrink-0" /> : <span className="text-muted-foreground mt-0.5">○</span>}
                               <span className={paso.estado === "ok" ? "text-emerald-800 dark:text-emerald-300" : paso.estado === "error" ? "text-destructive" : ""}>{paso.desc}{paso.error ? ` — ${paso.error}` : ""}</span>
                            </li>
                          ))}
                        </ul>
                      </CollapsibleContent>
                    </Collapsible>
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-between h-7 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><IconMapPin className="size-3" /> ¿Dónde verlo?</span>
                          <IconChevronDown className="size-3" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-1">
                        <div className="text-xs bg-muted p-2 rounded space-y-1">
                          <p className="flex items-start gap-1"><IconMapPin className="size-3 mt-0.5 shrink-0" /> {COMO_LLEGAR[m.id]}</p>
                          <a href={COMO_LLEGAR_HREF[m.id]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">Abrir dónde verlo →</a>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                    <Button size="sm" variant="ghost" className="w-full text-xs h-7" onClick={() => setDetalle(m)}><IconEye className="size-3 mr-1" /> Ver JSON técnico</Button>
                  </CardContent>
                </Card>
                )
              })}
            </div>
          )}
          {report && (
            <Card className="bg-muted/30">
              <CardHeader><CardTitle className="text-sm">Resumen</CardTitle></CardHeader>
              <CardContent className="text-xs font-mono">
                <p>ok: {String(report.ok)} · version: {report.version} · ts: {report.timestamp}</p>
                <p>historia: {report.historia.map(h => `${h.capitulo.split(" ")[0]}:${h.estado}`).join(" | ")}</p>
                {report.erroresGlobales.length > 0 && <p className="text-destructive">errores: {report.erroresGlobales.join("; ")}</p>}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="historia" className="pt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><IconBook className="size-5 text-primary" /> Cómo va quedando la comunidad</CardTitle>
              <CardDescription>Ves acá la historia paso a paso. Cada fila se prende en verde a medida que poblas. Basado en <code className="font-mono text-xs">34 - Historia de Poblamiento</code>.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {HISTORIA.map(h => {
                const estado = getHistoriaEstado(h.rank)
                return (
                  <div key={h.capitulo} className={`rounded-lg border p-4 flex gap-4 ${estado === "ok" ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900" : estado === "error" ? "bg-destructive/5 border-destructive/30" : "bg-muted/20"}`}>
                    <div className="pt-1"><BadgeEstado s={estado} /></div>
                    <div className="flex-1 space-y-1">
                      <p className="font-bold text-sm">{h.capitulo} <span className="font-mono text-xs text-muted-foreground">Rank {h.rank}</span></p>
                      <p className="text-sm"><span className="font-semibold">Relato:</span> {h.relato}</p>
                      <p className="text-xs text-muted-foreground"><span className="font-semibold">Gear:</span> {h.gear}</p>
                      <p className="text-xs"><span className="font-semibold">Verificación:</span> {h.rank === 0 ? "MA/CF aparece en EF/TU selectores" : h.rank === 1 ? "TU contador 0→1, MP ⚠️" : h.rank === 2 ? "Dona EF roja, tabla filtra 999" : h.rank === 3 ? "VU Historial 999 + FI responsable cobro" : h.rank === 4 ? "PE/IR/CO paralelos" : "AM tasa huérfanos 0"}</p>
                      <a href={(h as any).href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline mt-1"><IconMapPin className="size-3" /> Abrir dónde verlo → <span className="text-[11px] text-muted-foreground">(nueva ventana)</span></a>
                    </div>
                  </div>
                )
              })}
              {!report && <p className="text-sm text-muted-foreground text-center">Aún no hay carga — los capítulos están en ⏳ Pendiente. Carga una FASE para verlos pasar a 🟢.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="eventual" className="pt-4 space-y-4">
          <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/10 dark:border-amber-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm"><IconEye className="size-4 text-amber-600" /> Pruebas eventuales — lo que pasaría si migraras una especificación tentativa</CardTitle>
              <CardDescription className="text-xs">Hoy el QA solo muestra pruebas reales (`13/28` specs formalizados `46.4%`). Aquí ves el estimado de las `15` tentativas en `Data/NSGC/docs/especificaciones/` aún no en `openspec/specs/` — líneas tentativas `877L` → estimado formalizado `~1249L`, total eventual `~2239L` (`44.2%` hoy).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border bg-white dark:bg-card p-2">
                  <p className="text-xs text-muted-foreground">Real</p>
                  <p className="text-lg font-bold text-emerald-600">13 <span className="text-xs font-normal text-muted-foreground">/28</span></p>
                  <p className="text-[11px] text-muted-foreground">46.4% formalizado · 990L spec</p>
                  <p className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">7 módulos QA (ma,tu,mp,ef×3,vu)</p>
                </div>
                <div className="rounded-lg border border-dashed bg-muted/20 p-2">
                  <p className="text-xs text-muted-foreground">Tentativo</p>
                  <p className="text-lg font-bold">15 <span className="text-xs font-normal text-muted-foreground">/28</span></p>
                  <p className="text-[11px] text-muted-foreground">53.6% pendiente · 877L tentativas</p>
                  <p className="text-[10px] font-mono text-muted-foreground">estimado +1249L formalizados</p>
                </div>
                <div className="rounded-lg border bg-white dark:bg-card p-2">
                  <p className="text-xs text-muted-foreground">Eventual</p>
                  <p className="text-lg font-bold">28 <span className="text-xs font-normal text-muted-foreground">total</span></p>
                  <p className="text-[11px] text-muted-foreground">~2239L formalizados</p>
                  <p className="text-[10px] font-mono text-amber-700 dark:text-amber-400">+15 specs → +~40 pruebas QA</p>
                </div>
              </div>
              <div className="rounded border bg-muted/30 p-2 text-xs">
                <p className="font-semibold">Cómo leerlo para un cambio:</p>
                <p className="text-muted-foreground">Si llevas `FI` a `openspec/specs/FI-finanzas-morosidad`, el QA eventual sumaría 4 pruebas nuevas (fondos, emisión GC, mora/corte, informe diferencia) sobre `ST-capa-datos-persistente`. El % subiría a `14/28=50%` y la grilla pasaría de 7 a ~10 módulos.</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PENDIENTES.map(p => (
              <Card key={p.id} className="border-dashed bg-muted/10 hover:bg-muted/20 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-sm flex items-center gap-1.5">{p.id} <Badge variant="outline" className="text-[10px] px-1 py-0">⏳ Tentativo</Badge></CardTitle>
                      <CardDescription className="text-xs truncate" title={p.archivo}>{p.archivo} · {p.lineas}L</CardDescription>
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{p.pruebas.length} pruebas eventual</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{p.desc}</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full justify-between h-7 text-xs">
                        Ver qué probaría ({p.pruebas.length})
                        <IconChevronDown className="size-3" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1 pt-2">
                      <ul className="space-y-1">
                        {p.pruebas.map((t, i) => (
                          <li key={i} className="flex gap-1.5 text-xs items-start">
                            <span className="text-amber-600 dark:text-amber-400 mt-0.5">○</span>
                            <span>{t}</span>
                          </li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                  <div className="text-xs bg-muted p-2 rounded space-y-1">
                    <p className="flex items-start gap-1"><IconBook className="size-3 mt-0.5 shrink-0" /> Tentativo en <code className="font-mono text-[11px]">Data/NSGC/docs/especificaciones/{p.archivo}</code></p>
                    <p className="text-[11px] text-muted-foreground">Al formalizar en <code className="font-mono text-[11px]">openspec/specs/{p.id.toLowerCase()}-*/spec.md</code> aparecería en <b>Qué se probó</b> como módulo real con `Badge 🟢 Listo`.</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="bg-muted/20 border-dashed">
            <CardContent className="py-3 text-xs text-muted-foreground">
              Fuente: <code className="font-mono text-[11px]">Data/NSGC/docs/especificaciones/</code> 30 archivos (28 dominios). Migrados 13. Pendientes listados provienen de `00-index.md:6-40`. Estimación líneas via <code className="font-mono text-[11px]">wc -l</code> y ratio formalizado <code className="font-mono text-[11px]">1.42</code>.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle: {detalle?.label}</DialogTitle>
            <DialogDescription>Rank {detalle?.rank} · estado {detalle?.status} · count {detalle?.count}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <p className="font-semibold text-xs">Pasos realizados:</p>
              <ul className="space-y-1">
                {detalle?.pasos?.map((p, i) => (
                   <li key={i} className="flex gap-1.5 text-xs items-start">
                     {p.estado === "ok" ? <IconCheck className="size-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" /> : p.estado === "error" ? <IconAlertTriangle className="size-3.5 text-destructive mt-0.5 shrink-0" /> : <span className="mt-0.5">○</span>}
                    <span>{p.desc}{p.error ? ` — ${p.error}` : ""}</span>
                  </li>
                ))}
                {!detalle?.pasos?.length && <li className="text-xs text-muted-foreground">Sin pasos detallados</li>}
              </ul>
            </div>
            {detalle?.errores.length === 0 ? <p className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1 text-xs"><IconCheck className="size-4" /> Todos los pasos ✓</p> : (
              <div className="rounded border border-destructive/30 bg-destructive/5 p-3">
                <p className="font-semibold text-destructive flex items-center gap-1"><IconAlertTriangle className="size-4" /> {detalle?.errores.length} errores</p>
                <ul className="list-disc pl-5 text-xs mt-1 space-y-1">
                  {detalle?.errores.map((e, i) => <li key={i} className="font-mono">{e}</li>)}
                </ul>
              </div>
            )}
            <details><summary className="cursor-pointer text-xs text-muted-foreground underline">Ver JSON técnico</summary><div className="rounded bg-muted p-3 font-mono text-xs overflow-auto max-h-64 mt-2"><pre>{JSON.stringify(detalle, null, 2)}</pre></div></details>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(JSON.stringify(detalle, null, 2)); setMsg({ type: "ok", text: "Detalle copiado" }) }}><IconDownload className="size-4 mr-1" /> Copiar JSON</Button>
              <Button size="sm" variant="outline" onClick={() => setActiveTab("historia")}><IconHistory className="size-4 mr-1" /> Ver en Cómo va quedando</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
