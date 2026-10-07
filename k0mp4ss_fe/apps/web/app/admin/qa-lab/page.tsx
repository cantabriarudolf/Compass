"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- seeds TEST del QA Lab: literales complejos cross-módulo validados en runtime por zod (462 pruebas); tiparlos duplicaría los schemas sin valor en esta capa */

import * as React from "react"
import { useCompassStore, useStoreRehydrated, STORE_VERSION } from "@/lib/store"
import { STORE_KEY } from "@/lib/store-backup"
import { calcularProyeccionCobertura } from "@/lib/personal-utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { IconCheck, IconAlertTriangle, IconDownload, IconTrash, IconEye, IconHistory, IconFlask, IconBook, IconChevronDown, IconMapPin } from "@tabler/icons-react"
import { getAppEnv } from "@/lib/env-guard"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@workspace/ui/components/collapsible"
import {
  isTestNotificacion,
  getConfiguracionLimpiaOwnershipScoped,
  tieneDatosTest,
  type ResumenTestBD,
  obtenerIdsEgresosPLTest,
  esCertificadoTest,
  esCobroTest,
  validarEstadoCompleto,
  formatearMensajeValidacion,
} from "@/lib/qa-lab-helpers"

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
  pi: ["Publicar en vitrina vía API: unidad del seed en venta ($8.500.000) con imagen por referencia", "Registrar lead TEST Lead QA vía API → notificación email_simulado al propietario"],
  ad: ["Registrar controles de privacidad para E-999 (morosidad visible, actas ocultas, alertas activas)", "Verificar defaults de lectura sin registro"],
  gd: ["Extender a TEST Persona QA Uno como Presidente de directiva", "Registrar acta TEST con asistencia y minuta", "Firmar hasta quórum 100% → publicada + notificación email_simulado"],
  co: ["Crear plantilla TEST de cobranza con variable [Nombre_Usuario]", "Enviar masivo TEST a los 2 residentes TEST (notificaciones email_simulado)", "Simular lectura del envío (tasa apertura)", "Agregar documento TEST a la biblioteca (referencia D1)", "Ingresar reclamo TEST al buzón (folio BUZ)", "Responder y resolver el ticket TEST"],
  ge: ["Crear ticket grabaciones CCTV TEST (suceso + justificación, unidad E-999… Depto 999)", "Abrir ticket → En Revisión automático", "Admin pide datos → Requiere Acción Vecino (alerta al vecino)", "Vecino responde → En Proceso", "Resolver y cerrar → SLA registrado", "Ticket tipo buzon vinculado al reclamo TEST de CO"],
  ir: ["Crear insumo crítico Cloro TEST (stock 10, umbral 5)", "Crear EPP Casco TEST con renovación semestral", "Crear Llave Depto 999 TEST vinculada a la unidad", "Solicitud SI de cloro ×3 → entrega descuenta stock", "Comodín Escobillón TEST → aprobar y crear en catálogo", "Entrega EPP individual al residente TEST", "Asignar llave al arrendatario TEST"],
  in: ["Crear tipo de falta TEST (Leve, $25.000)", "Registrar infracción leve TEST con evidencia D1", "Apelar con descargos → Apelada", "Registrar infracción grave TEST desde reclamo CO", "Respaldo de directiva TEST sobre la grave", "Aplicar grave → % GC + cargo FI pendiente", "Desestimar la leve con justificación"],
  mt: ["Crear activo Hidropack TEST en catálogo IR", "Trabajo preventivo mensual Hidropack TEST (proveedor AquaServicio TEST)", "Iniciar → En Curso", "Finalizar → genera próximo preventivo automáticamente", "Correctivo con garantía vencida → verificar garantías alerta una vez", "Proyecto Techos TEST ($12M / 120 meses → cuota $100.000)"],
  ra: ["Crear Quincho central TEST (bloques 3h, tarifa $15.000, garantía $20.000, tardía ≤1 día → penalización $5.000)", "Reservar quincho mañana 19:00–22:00 para TEST Persona QA Uno → confirmada con cargo FI pendiente", "Solicitud solapada 20:00–23:00 → rechazada por conflicto horario", "Crear Hidrolavadora TEST (mobiliario, stock 2) y agotar cupo con 2 reservas paralelas", "Cancelar reserva del quincho fuera de plazo → penalización registrada", "Retener garantía de la hidrolavadora por daño"],
  cv: ["Activar plantilla rápida Portón TEST (advertencia) → aviso publicado al instante", "Aviso manual TEST con imagen URL remota → borrador → publicar", "Aviso vencido ayer → caducidad automática lo archiva", "Publicar el acta GD TEST en el visor → avisoCVReferencia materializada con el id del aviso", "Cola del carrusel: avisos publicados vigentes con duraciones individuales"],
  fi: ["Crear Fondo Extraordinario Pintura TEST (especial) junto al seed GC/Reserva/Amenities", "Egreso recurrente TEST imputado al Fondo de Gasto Común con comprobante D1", "Emisión GC variable sobre unidades TEST ($450.000) → cobros prorrateados + aporte 5% reserva", "Emisión sin alcance sobre toda la comunidad → rechazada por unidades sin responsable", "Pago exacto del cobro GC del depto TEST → estado pagado", "Mora al 1% sobre el periodo vencido (mes anterior) e idempotencia diaria", "Pago con descuento justificado en la multa TEST → informe de diferencia inmutable", "Multa grave aplicada tiene cobro multa_in materializado (conexión IN)", "Tarifa del quincho reservado quedó como cobro del fondo amenities (conexión RA)", "Proyecto MT de $12M financiado por fondo GC sin saldo → rechazado (conexión MT)", "Retiro del fondo reserva exige acta publicada → rechazado sin aprobación"],
  pe: ["Ficha integral TEST: 99.999.999-9 con AFP/FONASA/BancoEstado por FK + jornada base y contacto de emergencia", "Hora extra + evaluación de desempeño sobre la ficha TEST (eventos AM)", "Feriado TEST irrenunciable del próximo año → proyección de cobertura calcula reemplazos", "Enviar proyección de costos a Finanzas → registro TEST con liquidación PL pendiente y notificación", "Visita TEST pre-agendada al Depto 999 → marcar Ingresada sella hora y notifica", "Encomienda Chilexpress TEST con evidencia URL (D1) → retiro registrado", "Contratista Gasfitería Don Pedro agendado por residente TEST → confirmar ingreso sella hora", "Proveedor Ascensores TEST + mantención mensual vencida → alerta preventiva visible", "Visita técnica TEST vinculada a la mantención → próxima fecha reprogramada un ciclo", "Cierre de turno nocturno TEST con incidencias → notify administración + copia al trabajador"],
  pl: ["Parámetros legales CF TEST vía API (UF, IMM, tope gratificación 4.75, SIS)", "Ficha con sueldo base vía API + adelanto ADE TEST legacy en store (sin API)", "Generar liquidación LIQ TEST vía API en periodo libre: cálculo completo sin anticipo descontado", "Confirmar LIQ vía API → egreso FI Sueldos en BD + espejo store para CT"],
  ct: ["Certificado Residencia TEST (vínculo activo Depto 999) → PDF firmado con código VC", "Certificado Al Día sobre unidad con deuda → rechazado citando saldo", "Pagar el cobro vencido TEST → Al Día emitido con snapshot de saldo 0", "Certificado Liquidación sobre la LIQ confirmada → folio CT e historial inmutable"],
  re: ["Abrir Centro de Mando → vista auditada RE_DASHBOARD_VIEW", "Reporte TEST con bloques Gastos+Morosidad segmentado a SectorTEST × Residentes × Propietarios", "Distribuir → destinatarios resueltos vigentes y notificaciones email_simulado", "Segunda distribución rechazada (idempotente); tasa huérfanos 0 en el mando"],
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
  ad: "9. Gestión Administrativa (AD)",
  gd: "10. Actas de Directiva (GD)",
  co: "11. Comunicación Vecinos (CO)",
  ge: "12. Solicitudes (GE)",
  ir: "13. Recursos y EPP (IR)",
  in: "14. Infracciones y Multas (IN)",
  mt: "15. Mantenimiento y Proyectos (MT)",
  ra: "16. Reservas y Amenities (RA)",
  cv: "17. Visor de Mensajes (CV)",
  fi: "18. Finanzas y Morosidad (FI)",
  pe: "19. Personal y Servicios (PE)",
  pl: "20. Remuneraciones (PL)",
  ct: "21. Certificados (CT)",
  re: "22. Reportería y Dashboards (RE)",
}

const COMO_LLEGAR: Record<string, string> = {
  ma: "Sistema → Maestros Administrativos → pestañas Categorías / Estados",
  tu: "Inventario → Tipos de Unidad → busca TU-TEST-LoftQA",
  mp: "Comunidad → Directorio de Personas → busca 99.999.999-9",
  "ef-macro": "Inventario → Estructura Física → pestaña SectorTEST",
  "ef-micro": "Inventario → Estructura Física → abre SectorTEST → verás Piso99-TEST",
  "ef-unidad": "Inventario → Estructura Física → tabla filtra 999 y E-999",
  vu: "Comunidad → Directorio de Personas → abre 99.999.999-9 → pestaña Unidades Vinculadas",
  pi: "Comunidad → Portal Inmobiliario → catálogo con la publicación TEST (vía API)",
  ad: "Admin → Gestión Administrativa → controles E-999",
  gd: "Comunidad → Directiva → acta del 2026-08-24 publicada",
  co: "Comunidad → Comunicación → envío TEST, buzón folio BUZ y biblioteca",
  ge: "Operaciones → Solicitudes → ticket GE con workflow completo",
  ir: "Inventario → Recursos y EPP → cloro/casco/llave TEST y solicitud SI",
  in: "Finanzas → Multas → infracciones IN-TEST, panel directiva y catálogo",
  mt: "Inventario → Mantenimiento → trabajos MT-TEST, prevención y proyecto",
  ra: "Operaciones → Reservas y Amenities → quincho/hidrolavadora TEST y calendario",
  cv: "Comunidad → Visor de Mensajes → avisos TEST, actas GD y plantillas",
  fi: "Finanzas → Gastos Comunes → fondos/emisión TEST · Recaudación → cobros y moras TEST",
  pe: "Personas → Personal → ficha 99.999.999-9 · Operaciones → Bitácora (cierre turno) · Proveedores y Servicios",
  pl: "Finanzas → Remuneraciones → LIQ/ADE TEST · Parámetros Legales",
  ct: "Comunidad → Certificados → historial CT TEST",
  re: "Sistema → Reportería y Dashboards → reporte Boletín TEST",
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
  ad: "/admin/gestion",
  gd: "/comunidad/directiva",
  ir: "/inventario/recursos",
  in: "/finanzas/multas",
  mt: "/inventario/proyectos",
  ra: "/operaciones/reservas",
  cv: "/comunidad/visor",
  fi: "/finanzas/gastos-comunes",
  pe: "/personas/personal",
  pl: "/finanzas/remuneraciones",
  ct: "/comunidad/certificados",
  re: "/admin/reporteria",
}

interface SeedReport {
  ok: boolean
  timestamp: string
  version: number
  modulos: ModReport[]
  historia: { capitulo: string; estado: ModuleState; rank: number }[]
  erroresGlobales: string[]
}

// SERIE-GATED-API-BD P4 — QA-Lab coherente: PI/PL poblan vía API REST (BD
// fuente de verdad, igual que las pages). Ids fijos para idempotencia
// (upsert) y limpieza determinista.
const QA_PI_PUB_ID = "test-pub-pi-qa"
const QA_PI_LEAD_ID = "test-lead-pi-qa"
const QA_PL_TRAB_ID = "test-qa-pl-trab"
const QA_PL_RUT = "77.777.777-7"
const QA_PL_EMAIL = "test-qa-pl-trab@test.cl"
// La confirmada es inmutable por diseño: cada corrida consume el primer
// periodo libre de esta ventana rotativa (60 corridas entre reseeds).
const QA_PL_PERIODOS: string[] = (() => {
  const lista: string[] = []
  for (let anio = 2027; anio <= 2031; anio++) {
    for (let mes = 1; mes <= 12; mes++) lista.push(`${anio}-${String(mes).padStart(2, "0")}`)
  }
  return lista
})()

type RespuestaQA = { ok: boolean; status: number; cuerpo: any }

async function apiQA(path: string, init?: RequestInit): Promise<RespuestaQA> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  })
  const cuerpo: any = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, cuerpo }
}

async function listaQA(path: string): Promise<any[]> {
  const r = await apiQA(`${path}?pageSize=100`).catch(() => null)
  const datos = (r?.cuerpo as { data?: any[] } | null)?.data
  return Array.isArray(datos) ? datos : []
}

/** POST JSON de colección para el espejo de estructura (Fase 0). */
function postQA(path: string, body: unknown): Promise<RespuestaQA> {
  return apiQA(path, { method: "POST", body: JSON.stringify(body) })
}

/**
 * Fase 0 — espejo transitorio (design Decisión 7): la escritura al store sigue
 * siendo la validación original; sólo si pasó se espeja a BD vía API REST. Un
 * 409 se interpreta como "ya presente" (idempotencia del upsert). El paso queda
 * `ok` sólo si ambos mundos lo están; si la API falla, el error suma store + API.
 */
async function espejarQA(
  pasos: Paso[],
  idx: number,
  store: { ok: boolean; error?: string },
  llamada: () => Promise<RespuestaQA>
): Promise<void> {
  if (!store.ok) {
    pasos[idx]!.estado = "error"
    pasos[idx]!.error = store.error
    return
  }
  try {
    const r = await llamada()
    if (r.ok || r.status === 409) {
      pasos[idx]!.estado = "ok"
      return
    }
    pasos[idx]!.estado = "error"
    pasos[idx]!.error = `${store.error ?? ""} / API ${r.status}: ${(r.cuerpo as any)?.error}`
  } catch (e) {
    pasos[idx]!.estado = "error"
    pasos[idx]!.error = `${store.error ?? ""} / API error: ${String(e)}`
  }
}

/** Resumen TEST del mundo BD para el guard clean-first (best-effort: si la BD no responde, solo rige el store). */
async function resumenTestBD(): Promise<{ ok: boolean; resumen: ResumenTestBD }> {
  try {
    const [pubs, leads, personas, liqs] = await Promise.all([
      listaQA("/api/publicaciones-portal"),
      listaQA("/api/leads-portal"),
      listaQA("/api/personas"),
      listaQA("/api/liquidaciones"),
    ])
    const esTest = (id: unknown) => typeof id === "string" && id.startsWith("test-")
    return {
      ok: true,
      resumen: {
        publicacionesPortal: pubs.filter(p => esTest(p.id)),
        leadsPortal: leads.filter(l => esTest(l.id)),
        personas: personas.filter(p => esTest(p.id)),
        // Solo borradores: las confirmadas son documentos inmutables y el periodo rotativo evita colisiones.
        liquidacionesBorrador: liqs.filter(l => l.estado === "borrador" && esTest(l.id)),
      },
    }
  } catch {
    return { ok: false, resumen: {} }
  }
}

const HISTORIA = [
  { capitulo: "Prólogo - El Diccionario", rank: 0, relato: "María acuerda el idioma: Torre/Piso, Depto/Casa, estados y condiciones. Es el diccionario MA/CF.", gear: "MA.categoriasMacro/Micro/Unidad + estadosOcupacion + CF Rank 0", href: "/admin/maestros" },
  { capitulo: "Cap.1 - El Arquitecto", rank: 1, relato: "Dibuja plantilla Loft 45m2 (TU) y levanta Torre → Piso → Depto 999 (EF). No puedes entregar llave sin edificio.", gear: "TU Rank1 → EF macro→micro→unidad Rank2", href: "/inventario/estructura" },
  { capitulo: "Cap.2 - Llega la Gente", rank: 3, relato: "Registra a Carlos 99.999.999-9 (MP) y lo amarra a 999 como Propietario (VU).", gear: "MP Rank1 → VU Rank3 depende MP+EF", href: "/comunidad/personas" },
  { capitulo: "Cap.3 - Vidas Paralelas", rank: 4, relato: "Jorge (conserje PE), Ana (bodega IR) y Pérez (CO) operan en paralelo tras VU.", gear: "PE/IR/CO Rank4 paralelo", href: "/operaciones/solicitudes" },
  { capitulo: "Epílogo - Huella", rank: 99, relato: "Todo deja evento inmutable en AM y dashboard RE muestra tasa huérfanos 0.", gear: "AM Rank99 sumidero", href: "/admin/metricas" },
]

const PENDIENTES: { id: string; archivo: string; lineas: number; desc: string; pruebas: string[] }[] = [
  { id: "GD", archivo: "GD - Gestión de Directiva.md", lineas: 40, desc: "Gobernanza y actas", pruebas: ["Acta con firma directiva", "Votación asamblea por RP"] },
  { id: "GE", archivo: "GE - Gestion de Solicitudes.md", lineas: 54, desc: "Tickets con workflow automático", pruebas: ["Ticket Nuevo → En Revisión al abrir", "Requiere Acción Vecino → En Proceso", "SLA dashboard GE"] },
  { id: "PI", archivo: "PI - Portal Inmobiliario.md", lineas: 27, desc: "Vitrina venta/arriendo unidades", pruebas: ["Unidad en portal con VU", "Contacto interesado → MP"] },
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
  const [report, setReport] = React.useState<SeedReport | null>(null)
  const [activeTab, setActiveTab] = React.useState("carga")
  const [loading, setLoading] = React.useState(false)
  const [detalle, setDetalle] = React.useState<ModReport | null>(null)
  const [msg, setMsg] = React.useState<{ type: "ok" | "error"; text: string } | null>(null)
  const [ultimaFase, setUltimaFase] = React.useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [pendingFase, setPendingFase] = React.useState<string | null>(null)

  // Mismo criterio que env-guard (isWriteApiEnabled): APP_ENV=development
  // habilita el lab aunque NODE_ENV sea production (build prod de CI e2e).
  // En producción real sin APP_ENV, NODE_ENV=production → oculto.
  const isDev = getAppEnv() === "development"

  const modulosOrden: { id: string; label: string; rank: number; fase: string }[] = [
    { id: "ma", label: TITULOS["ma"]!, rank: 0, fase: "Paso 1" },
    { id: "tu", label: TITULOS["tu"]!, rank: 1, fase: "Paso 2" },
    { id: "mp", label: TITULOS["mp"]!, rank: 1, fase: "Paso 3" },
    { id: "ef-macro", label: TITULOS["ef-macro"]!, rank: 2, fase: "Paso 4" },
    { id: "ef-micro", label: TITULOS["ef-micro"]!, rank: 2, fase: "Paso 5" },
    { id: "ef-unidad", label: TITULOS["ef-unidad"]!, rank: 2, fase: "Paso 6" },
    { id: "vu", label: TITULOS["vu"]!, rank: 3, fase: "Paso 7" },
    { id: "pi", label: TITULOS["pi"]!, rank: 4, fase: "Paso 8" },
    { id: "ad", label: TITULOS["ad"]!, rank: 4, fase: "Paso 9" },
    { id: "gd", label: TITULOS["gd"]!, rank: 5, fase: "Paso 10" },
    { id: "co", label: TITULOS["co"]!, rank: 6, fase: "Paso 11" },
    { id: "ge", label: TITULOS["ge"]!, rank: 6, fase: "Paso 12" },
    { id: "ir", label: TITULOS["ir"]!, rank: 7, fase: "Paso 13" },
    { id: "in", label: TITULOS["in"]!, rank: 7, fase: "Paso 14" },
    { id: "mt", label: TITULOS["mt"]!, rank: 7, fase: "Paso 15" },
    { id: "ra", label: TITULOS["ra"]!, rank: 8, fase: "Paso 16" },
    { id: "cv", label: TITULOS["cv"]!, rank: 8, fase: "Paso 17" },
    { id: "fi", label: TITULOS["fi"]!, rank: 9, fase: "Paso 18" },
    { id: "pe", label: TITULOS["pe"]!, rank: 4, fase: "Paso 19" },
    { id: "pl", label: TITULOS["pl"]!, rank: 6, fase: "Paso 20" },
    { id: "ct", label: TITULOS["ct"]!, rank: 6, fase: "Paso 21" },
    { id: "re", label: TITULOS["re"]!, rank: 99, fase: "Paso 22" },
  ]

  const FASE_MODULOS: Record<string, string[]> = {
    "0": ["ma"],
    "1": ["tu", "mp"],
    "2": ["ef-macro", "ef-micro", "ef-unidad"],
    "3": ["vu"],
    "4": ["pi"],
    "5": ["ad"],
    "6": ["gd"],
    "7": ["co"],
    "8": ["ge"],
    "9": ["ir"],
    "10": ["in"],
    "11": ["mt"],
    "12": ["ra", "cv"],
    "13": ["fi"],
    "14": ["pe"],
    "15": ["pl", "ct", "re"],
    "todo": ["ma", "tu", "mp", "ef-macro", "ef-micro", "ef-unidad", "vu", "pi", "ad", "gd", "co", "ge", "ir", "in", "mt", "ra", "cv", "fi", "pe", "pl", "ct", "re"],
  }

  const LABEL_FASE: Record<string, string> = {
    "0": "1. Diccionario — categorías y estados",
    "1": "2. Plantillas y Personas",
    "2": "3. Torres, Pisos y Deptos",
    "3": "4. Amarras — personas a deptos",
    "4": "5. Vitrina — publicación y lead",
    "5": "6. Panel AD — controles por unidad",
    "6": "7. Acta GD — firmas y publicación",
    "7": "8. CO — envío masivo, buzón y biblioteca",
    "8": "9. GE — workflow de tickets y SLA",
    "9": "10. IR — catálogo, stock crítico y EPP",
    "10": "11. IN — faltas, apelaciones y directiva",
    "11": "12. MT — preventivos y proyectos",
    "12": "13. RA+CV — reservas, avisos y actas en visor",
    "13": "14. FI — fondos, emisión GC y morosidad",
    "14": "15. PE — fichas, bitácora y cierre de turno",
    "15": "16. PL+CT+RE — remuneraciones, certificados y reportería",
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
    // Fase 0 espejo (design D7): cada maestro conserva su escritura al store y
    // además se persiste en BD vía POST /api/maestros/<tipo> (upsert idempotente).
    const run = async (idx: number, key: string, tipo: string, item: Record<string, unknown>) => {
      let store: { ok: boolean; error?: string }
      try { store = s.saveMaestro(key as any, item as any) } catch (e) { store = { ok: false, error: String(e) } }
      await espejarQA(pasos, idx, store, () => postQA(`/api/maestros/${tipo}`, item))
    }
    await run(0, "estadosOcupacion", "estados-ocupacion", { id: "test-edo-enlimpieza", nombre: "TEST-EdO-EnLimpieza", color: "destructive", hex: "#ef4444" })
    await run(1, "categoriasMacro", "categorias-macro", { id: "test-macro-torreqa", nombre: "TEST-MACRO-TorreQA" })
    await run(2, "categoriasMicro", "categorias-micro", { id: "test-micro-pisoqa", nombre: "TEST-MICRO-PisoQA" })
    await run(3, "categoriasUnidad", "categorias-unidad", { id: "test-catu-loftqa", nombre: "TEST-CATU-LoftQA" })
    await run(4, "condicionesEspeciales", "condiciones-especiales", { id: "test-vuln-electroqa", nombre: "TEST-VULN-ElectroQA", color: "bg-blue-500 text-white" })
    await run(5, "estadosInmobiliarios", "estados-inmobiliarios", { id: "test-einm-prereservaqa", nombre: "TEST-EINM-PreReservaQA" })
    await run(6, "contactosEmergencia", "contactos-emergencia", { id: "test-emer-cerrajeroqa", nombre: "TEST-EMER-CerrajeroQA", telefono: "+56 9 9999 0001", categoria: "tecnico" })
    await run(7, "bancos", "bancos", { id: "test-banco-bancoqa", nombre: "TEST-BANCO-BancoQA" })
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "ma", label: TITULOS["ma"]!, rank: 0, status: errores.length ? "error" : "ok", count: 8, errores, pasos }
  }, [])

  const cargarFase1TU = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["tu"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    const tu = { id: "test-tu-loftqa", nombre: "TU-TEST-LoftQA", categoria: "TEST-CATU-LoftQA", metraje: 45, montoBaseGc: 120000, descripcion: "DescLoftTEST", activo: true, historialTarifas: [{ id: "t-test-loftqa", monto: 120000, fechaVigencia: "2026-08-20", creadoEn: "2026-08-20" }] }
    let store: { ok: boolean; error?: string }
    try { store = s.saveTipoUnidad(tu as any) } catch (e) { store = { ok: false, error: String(e) } }
    await espejarQA(pasos, 0, store, () => postQA("/api/tipos-unidad", tu))
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "tu", label: TITULOS["tu"]!, rank: 1, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  const cargarFase1MP = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["mp"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    const p99 = { id: "test-p-99", rut: "99.999.999-9", nombreCompleto: "TEST Persona QA Uno", nombres: "TEST", apellidos: "Persona QA Uno", email: "test.qa@compass.cl", telefonoMovil: "+56 9 9999 9999", estadoCuenta: "activa", condicionesEspecialesIds: ["test-vuln-electroqa"], roles: ["residente"] }
    let store0: { ok: boolean; error?: string }
    try { store0 = s.savePersona(p99 as any) } catch (e) { store0 = { ok: false, error: String(e) } }
    await espejarQA(pasos, 0, store0, () => postQA("/api/personas", p99))
    const p88 = { id: "test-p-88", rut: "88.888.888-8", nombreCompleto: "TEST Persona QA Dos", nombres: "TEST", apellidos: "Persona QA Dos", email: "test.qa2@compass.cl", telefonoMovil: "+56 9 8888 8888", estadoCuenta: "activa", condicionesEspecialesIds: [], roles: ["residente"] }
    let store1: { ok: boolean; error?: string }
    try { store1 = s.savePersona(p88 as any) } catch (e) { store1 = { ok: false, error: String(e) } }
    await espejarQA(pasos, 1, store1, () => postQA("/api/personas", p88))
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "mp", label: TITULOS["mp"]!, rank: 1, status: errores.length ? "error" : "ok", count: 2, errores, pasos }
  }, [])

  const cargarFase2Macro = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["ef-macro"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    const macro = { id: "test-macro-sectortest", nombre: "SectorTEST", etiqueta: "TEST-MACRO-TorreQA", descripcion: "DescripMSectorTEST" }
    let store: { ok: boolean; error?: string }
    try { store = s.saveMacroSector(macro as any) } catch (e) { store = { ok: false, error: String(e) } }
    await espejarQA(pasos, 0, store, () => postQA("/api/macro-sectores", macro))
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "ef-macro", label: TITULOS["ef-macro"]!, rank: 2, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  const cargarFase2Micro = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["ef-micro"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    const micro = { id: "test-micro-piso99", nombre: "Piso99-TEST", etiqueta: "TEST-MICRO-PisoQA", macroSectorId: "test-macro-sectortest" }
    let store: { ok: boolean; error?: string }
    try { store = s.saveMicroSector(micro as any) } catch (e) { store = { ok: false, error: String(e) } }
    await espejarQA(pasos, 0, store, () => postQA("/api/micro-sectores", micro))
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "ef-micro", label: TITULOS["ef-micro"]!, rank: 2, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  const cargarFase2Unidad = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["ef-unidad"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    const u999 = { id: "test-u-999", numero: "999", etiqueta: "TEST-CATU-LoftQA", microSectorId: "test-micro-piso99", tipoUnidadId: "test-tu-loftqa", estadoId: "test-edo-enlimpieza", rolSii: "999-99", metraje: 45, prorrateo: 0.01, servicios: {} }
    let store0: { ok: boolean; error?: string }
    try { store0 = s.saveUnidad(u999 as any) } catch (e) { store0 = { ok: false, error: String(e) } }
    await espejarQA(pasos, 0, store0, () => postQA("/api/unidades", u999))
    const microEst = { id: "test-est-sup-qa", nombre: "Superficie TEST", etiqueta: "Piso", macroSectorId: "estacionamientos" }
    const uE999 = { id: "test-u-e-999", numero: "E-999", etiqueta: "Estacionamiento", microSectorId: "test-est-sup-qa", tipoUnidadId: "tipo-es-1", estadoId: "vacante", rolSii: "", metraje: 12.5, prorrateo: 0.005, servicios: {} }
    try {
      const estMacro = s.macroSectores.find(m => m.id === "estacionamientos")
      const microExist = s.microSectores.find(m => m.id === "test-est-sup-qa")
      if (!microExist && estMacro) s.saveMicroSector(microEst as any)
      const store1 = s.saveUnidad(uE999 as any)
      // Espejo BD: el sub-sector de estacionamientos también debe existir en BD
      // (FK de la unidad); el POST es idempotente por id.
      if (store1.ok) await postQA("/api/micro-sectores", microEst).catch(() => null)
      await espejarQA(pasos, 1, store1, () => postQA("/api/unidades", uE999))
    } catch (e) { pasos[1]!.estado = "error"; pasos[1]!.error = String(e) }
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "ef-unidad", label: TITULOS["ef-unidad"]!, rank: 2, status: errores.length ? "error" : "ok", count: 2, errores, pasos }
  }, [])

  const cargarFase3VU = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["vu"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    const v1 = { id: "test-v-prop-999", personaId: "test-p-99", unidadId: "test-u-999", rol: "propietario", fechaInicio: "2026-08-20", estadoOcupacionPropiedad: "test-einm-prereservaqa", permiteVerFinanzas: true }
    let r1: { ok: boolean; error?: string }
    try { r1 = s.saveVinculo(v1 as any) } catch (e) { r1 = { ok: false, error: String(e) } }
    await espejarQA(pasos, 0, r1, () => postQA("/api/vinculos", v1))
    const v2 = { id: "test-v-prop-e999", personaId: "test-p-99", unidadId: "test-u-e-999", rol: "propietario", fechaInicio: "2026-08-20", permiteVerFinanzas: false }
    let r2: { ok: boolean; error?: string }
    try { r2 = s.saveVinculo(v2 as any) } catch (e) { r2 = { ok: false, error: String(e) } }
    await espejarQA(pasos, 1, r2, () => postQA("/api/vinculos", v2))
    const v3 = { id: "test-v-arr-999", personaId: "test-p-88", unidadId: "test-u-999", rol: "arrendatario", fechaInicio: "2026-08-20", fechaFin: "2027-08-20", permiteVerFinanzas: false }
    let r3: { ok: boolean; error?: string }
    try { r3 = s.saveVinculo(v3 as any) } catch (e) { r3 = { ok: false, error: String(e) } }
    await espejarQA(pasos, 2, r3, () => postQA("/api/vinculos", v3))
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "vu", label: TITULOS["vu"]!, rank: 3, status: errores.length ? "error" : "ok", count: 3, errores, pasos }
  }, [])

  // P4 SERIE-GATED-API-BD: la vitrina lee BD vía API (P2), así que la fase
  // pobla vía API REST (upsert idempotente con ids fijos QA). El reporte
  // mantiene 2 pasos para no romper el 22/22 de poblado-idempotente.
  const cargarFase4PI = React.useCallback(async (): Promise<ModReport> => {
    const pasos: Paso[] = (PLAN["pi"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    const hoy = new Date().toISOString().slice(0, 10)
    // 1) Unidad del seed vía API (misma receta que el GATED portal P2).
    const pubs = await listaQA("/api/unidades")
    const unidad = pubs[0] as { id: string } | undefined
    if (!unidad) {
      pasos[0]!.estado = "error"; pasos[0]!.error = "Sin unidades en BD (ejecuta el reseed)"
    } else {
      const rPub = await apiQA("/api/publicaciones-portal", {
        method: "POST",
        body: JSON.stringify({
          id: QA_PI_PUB_ID,
          unidadId: unidad.id,
          operacion: "venta",
          precio: 8500000,
          moneda: "CLP",
          descripcion: "Publicación TEST del QA-Lab (vía API, visible en la vitrina)",
          imagenes: [{ nombre: "test-foto-qa.jpg", tipoMime: "image/jpeg", tamanoKB: 120, url: "https://placeholder.supabase.co/test-foto-qa.jpg" }],
          activa: true,
          fechaPublicacion: hoy,
        }),
      })
      if (!rPub.ok) { pasos[0]!.estado = "error"; pasos[0]!.error = `POST publicación ${rPub.status}: ${(rPub.cuerpo as any)?.error ?? "sin detalle"}` }
      else pasos[0]!.estado = "ok"
    }
    // 2) Lead TEST vía API (upsert; la notificación al propietario solo se genera al alta).
    if (pasos[0]!.estado === "ok") {
      const rLead = await apiQA("/api/leads-portal", {
        method: "POST",
        body: JSON.stringify({
          id: QA_PI_LEAD_ID,
          publicacionId: QA_PI_PUB_ID,
          nombreContacto: "TEST Lead QA",
          contacto: "+56 9 0000 0001",
          mensaje: "Interesado TEST del QA-Lab (vía API)",
          fecha: hoy,
          atendido: false,
        }),
      })
      if (!rLead.ok) { pasos[1]!.estado = "error"; pasos[1]!.error = `POST lead ${rLead.status}: ${(rLead.cuerpo as any)?.error ?? "sin detalle"}` }
      else pasos[1]!.estado = "ok"
    } else {
      pasos[1]!.estado = "error"; pasos[1]!.error = "Sin publicación TEST (paso previo)"
    }
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "pi", label: TITULOS["pi"]!, rank: 4, status: errores.length ? "error" : "ok", count: 2, errores, pasos }
  }, [])

  const cargarFase5AD = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["ad"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    const r1 = s.saveControlPropiedad({ id: "test-ctrl-e999", unidadId: "test-u-e-999", residenteVeMorosidad: true, residenteVeActas: false, alertasResidentesActivas: true } as any)
    if (!r1.ok) { pasos[0]!.estado = "error"; pasos[0]!.error = r1.error } else pasos[0]!.estado = "ok"
    // Defaults de lectura: una unidad sin registro asume actas/morosidad ocultas y alertas activas
    const sinRegistro = !s.controlesPropiedades.some(c => c.unidadId === "test-u-999")
    if (sinRegistro) pasos[1]!.estado = "ok"
    else { pasos[1]!.estado = "error"; pasos[1]!.error = "La unidad test-u-999 no debiera tener controles aún." }
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "ad", label: TITULOS["ad"]!, rank: 4, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  const cargarFase6GD = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["gd"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    // 1) Extender a la persona TEST con gobernanza (presidente)
    const p99 = s.personas.find(x => x.id === "test-p-99")
    if (!p99) { pasos[0]!.estado = "error"; pasos[0]!.error = "Falta test-p-99 (carga fase MP)" }
    else {
      const r1 = s.savePersona({ ...p99, roles: Array.from(new Set([...(p99.roles ?? []), "directiva"])), datosGobernanza: { id: "gob-test-1", cargoDirectiva: "presidente", fechaAsuncion: "2026-08-24" } } as any)
      if (!r1.ok) { pasos[0]!.estado = "error"; pasos[0]!.error = r1.error } else pasos[0]!.estado = "ok"
    }
    // 2) Registrar acta TEST con asistencia
    const r2 = s.saveActaGD({ id: "test-acta-gd", fecha: "2026-08-24", hora: "19:30", lugar: "Sede comunitaria TEST", tablaTemas: ["Tema TEST GD"], presentes: ["test-p-99"], ausentes: [], invitados: [], minuta: "Minuta de prueba del acta TEST.", adjuntos: [{ nombre: "test-acta.pdf", tipoMime: "application/pdf", tamanoKB: 250, url: "https://placeholder.supabase.co/test-acta.pdf" }], estado: "borrador", aprobaciones: [] } as any)
    if (!r2.ok) { pasos[1]!.estado = "error"; pasos[1]!.error = r2.error } else pasos[1]!.estado = "ok"
    // 3) Firmar hasta quórum 100% de la directiva vigente (fresco + incluye test-p-99)
    const directivaVigente = useCompassStore.getState().personas.filter(p => p.datosGobernanza && p.estadoCuenta === "activa").map(p => p.id)
    let falloFirma: string | null = null
    for (const idMiembro of directivaVigente) {
      const r3 = s.aprobarActaGD("test-acta-gd", idMiembro)
      if (!r3.ok && !falloFirma) falloFirma = `${idMiembro}: ${r3.error}`
    }
    const actaFinal = useCompassStore.getState().actasGD.find(a => a.id === "test-acta-gd")
    if (falloFirma || actaFinal?.estado !== "publicada") { pasos[2]!.estado = "error"; pasos[2]!.error = falloFirma ?? `Estado final: ${actaFinal?.estado}` } else pasos[2]!.estado = "ok"
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "gd", label: TITULOS["gd"]!, rank: 5, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  const cargarFase7CO = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["co"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    // 1) Plantilla TEST de cobranza con variable
    const r1 = s.savePlantillaCO({ id: "test-plant-co", nombre: "TEST-Plantilla-CobranzaQA", categoria: "cobranza", asunto: "Recordatorio GC [Nombre_Usuario]", cuerpo: "Estimado/a [Nombre_Usuario], su gasto común TEST vence pronto." })
    if (!r1.ok) { pasos[0]!.estado = "error"; pasos[0]!.error = r1.error } else pasos[0]!.estado = "ok"
    // 2) Envío masivo TEST a las 2 personas TEST
    const r2 = s.saveEnvioCO({ id: "test-env-co-1", asunto: "Aviso TEST CO", cuerpo: "Hola [Nombre_Usuario], este es un envío masivo de prueba.", plantillaId: undefined, destinatarios: [{ personaId: "test-p-99" }, { personaId: "test-p-88" }], fechaEnvio: "2026-08-25", lecturas: [] })
    if (!r2.ok) { pasos[1]!.estado = "error"; pasos[1]!.error = r2.error } else pasos[1]!.estado = "ok"
    // 3) Lectura simulada del primer destinatario
    if (r2.ok) {
      const r3 = s.registrarLecturaEnvioCO("test-env-co-1", "test-p-99")
      if (!r3.ok) { pasos[2]!.estado = "error"; pasos[2]!.error = r3.error } else pasos[2]!.estado = "ok"
    }
    // 4) Documento TEST por referencia (D1)
    const r4 = s.saveDocumentoCO({ id: "test-doc-co", nombre: "TEST-ReglamentoQA.pdf", tipoMime: "application/pdf", tamanoKB: 180, url: "https://placeholder.supabase.co/test-reglamento.pdf", categoria: "reglamento" })
    if (!r4.ok) { pasos[3]!.estado = "error"; pasos[3]!.error = r4.error } else pasos[3]!.estado = "ok"
    // 5) Reclamo TEST al buzón
    const r5 = s.saveMensajeBuzonCO({ id: "test-buz-co-1", folio: "", clasificacion: "reclamo", reportantePersonaId: "test-p-88", reportanteNombre: "TEST Persona QA Dos", asunto: "Reclamo TEST buzón", cuerpo: "Falla de servicio en área común TEST.", visibilidadComite: true, fechaIngreso: "2026-08-25", estado: "recibido", respuestas: [] })
    if (!r5.ok) { pasos[4]!.estado = "error"; pasos[4]!.error = r5.error } else pasos[4]!.estado = "ok"
    // 6) Responder → En Gestión; resolver → notifica al reportante
    let r6: { ok: boolean; error?: string } | null = null
    if (r5.ok) {
      r6 = s.responderMensajeBuzonCO("test-buz-co-1", { autor: "Administración", texto: "Respuesta TEST al reclamo.", compromisos: "Visita técnica esta semana" })
      const r6b = s.cambiarEstadoBuzonCO("test-buz-co-1", "resuelto")
      if (!r6.ok || !r6b.ok) { pasos[5]!.estado = "error"; pasos[5]!.error = r6.error ?? r6b.error } else pasos[5]!.estado = "ok"
    }
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "co", label: TITULOS["co"]!, rank: 6, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  const cargarFase8GE = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["ge"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    // 1) Ticket grabaciones CCTV TEST sobre Depto 999
    const r1 = s.saveSolicitudGE({ id: "test-sol-ge-1", folio: "", tipo: "grabaciones", titulo: "Grabaciones CCTV TEST", descripcion: "Revisión de cámaras por paquete retirado indebidamente.", solicitantePersonaId: "test-p-88", unidadId: "test-u-999", estado: "nuevo", fechaCreacion: "2026-08-25", comentarios: [], detalleGrabaciones: { fechaSuceso: "2026-08-24", horaSuceso: "18:30", justificacion: "Un courier retiró un paquete que no era suyo a las 18:30." }, historialEstados: [] })
    if (!r1.ok) { pasos[0]!.estado = "error"; pasos[0]!.error = r1.error } else pasos[0]!.estado = "ok"
    // 2) Abrir → En Revisión automático
    if (r1.ok) {
      const r2 = s.abrirSolicitudGE("test-sol-ge-1")
      const estadoTrasAbrir = useCompassStore.getState().solicitudesGE.find(x => x.id === "test-sol-ge-1")?.estado
      if (!r2.ok || estadoTrasAbrir !== "en_revision") { pasos[1]!.estado = "error"; pasos[1]!.error = `Estado tras abrir: ${estadoTrasAbrir}` } else pasos[1]!.estado = "ok"
    }
    // 3) Admin pide datos → Requiere Acción Vecino + alerta
    if (r1.ok) {
      const r3 = s.responderSolicitudGE("test-sol-ge-1", { autorRol: "administracion", texto: "Indique la hora exacta del retiro." })
      const estado3 = useCompassStore.getState().solicitudesGE.find(x => x.id === "test-sol-ge-1")?.estado
      if (!r3.ok || estado3 !== "requiere_accion_vecino") { pasos[2]!.estado = "error"; pasos[2]!.error = `Estado: ${estado3}` } else pasos[2]!.estado = "ok"
    }
    // 4) Vecino responde → En Proceso
    const r4 = s.responderSolicitudGE("test-sol-ge-1", { autorRol: "solicitante", texto: "Fue a las 18:30 aprox." })
    const estado4 = useCompassStore.getState().solicitudesGE.find(x => x.id === "test-sol-ge-1")?.estado
    if (!r4.ok || estado4 !== "en_proceso") { pasos[3]!.estado = "error"; pasos[3]!.error = `Estado: ${estado4}` } else pasos[3]!.estado = "ok"
    // 5) Resolver y cerrar → SLA
    const r5 = s.resolverSolicitudGE("test-sol-ge-1", "Se entregó link TEST del video al vecino.")
    const r5b = s.cerrarSolicitudGE("test-sol-ge-1")
    const estado5 = useCompassStore.getState().solicitudesGE.find(x => x.id === "test-sol-ge-1")?.estado
    if (!r5.ok || !r5b.ok || estado5 !== "cerrado") { pasos[4]!.estado = "error"; pasos[4]!.error = `Estado final: ${estado5}` } else pasos[4]!.estado = "ok"
    // 6) Ticket tipo buzon vinculado al reclamo TEST de CO
    const r6 = s.saveSolicitudGE({ id: "test-sol-ge-2", folio: "", tipo: "buzon", titulo: "[Buzón] Reclamo TEST buzón", descripcion: "Gestión operativa del reclamo ciudadano TEST.", unidadId: "test-u-999", estado: "nuevo", fechaCreacion: "2026-08-25", comentarios: [], mensajeBuzonId: "test-buz-co-1", historialEstados: [] })
    if (!r6.ok) { pasos[5]!.estado = "error"; pasos[5]!.error = r6.error } else pasos[5]!.estado = "ok"
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "ge", label: TITULOS["ge"]!, rank: 6, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  const cargarFase9IR = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["ir"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    // 1) Insumo crítico con stock y umbral
    const r1 = s.saveRecursoIR({ id: "test-ir-cloro", nombre: "Cloro bidón 5L TEST", categoria: "insumo", estadoActivo: "disponible", stock: 10, esCritico: true, umbralCritico: 5, proveedor: "Distribuidora TEST", numeroFactura: "F-QA-001" } as any)
    if (!r1.ok) { pasos[0]!.estado = "error"; pasos[0]!.error = r1.error } else pasos[0]!.estado = "ok"
    // 2) EPP con renovación semestral
    const r2 = s.saveRecursoIR({ id: "test-ir-casco", nombre: "Casco seguridad TEST", categoria: "epp", estadoActivo: "disponible", stock: 0, esCritico: false, talla: "M", renovacionMeses: 6 } as any)
    if (!r2.ok) { pasos[1]!.estado = "error"; pasos[1]!.error = r2.error } else pasos[1]!.estado = "ok"
    // 3) Llave vinculada a la unidad Depto 999
    const r3 = s.saveRecursoIR({ id: "test-ir-llave999", nombre: "Llave Depto 999 TEST", categoria: "acceso", estadoActivo: "disponible", stock: 0, esCritico: false, unidadId: "test-u-999" } as any)
    if (!r3.ok) { pasos[2]!.estado = "error"; pasos[2]!.error = r3.error } else pasos[2]!.estado = "ok"
    // 4) Solicitud SI de cloro ×3 → entrega (10 → 7, sin cruzar umbral 5)
    const r4 = s.saveSolicitudInsumoIR({ id: "test-si-1", folio: "", solicitantePersonaId: "test-p-99", recursoInsumoId: "test-ir-cloro", estadoComodin: "no_comodin", cantidad: 3, areaDestino: "Piso 1 Torre TEST", estado: "pendiente", fechaSolicitud: "2026-08-25" } as any)
    let r4b: { ok: boolean; error?: string } = { ok: false }
    if (r4.ok) {
      r4b = s.entregarSolicitudInsumoIR("test-si-1")
      const stockTrasEntrega = useCompassStore.getState().activosIR.find(x => x.id === "test-ir-cloro")?.stock
      if (!r4b.ok || stockTrasEntrega !== 7) { pasos[3]!.estado = "error"; pasos[3]!.error = `Stock tras entrega: ${stockTrasEntrega}` } else pasos[3]!.estado = "ok"
    } else { pasos[3]!.estado = "error"; pasos[3]!.error = r4.error }
    // 5) Comodín → aprobar y crear en catálogo
    const r5 = s.saveSolicitudInsumoIR({ id: "test-si-2", folio: "", solicitantePersonaId: "test-p-88", comodin: { descripcionArticulo: "Escobillón industrial TEST", justificacion: "Emergencia de aseo post evento TEST en áreas comunes del edificio." }, estadoComodin: "no_comodin", cantidad: 1, areaDestino: "Conserjería TEST", estado: "pendiente", fechaSolicitud: "2026-08-25" } as any)
    let r5b: { ok: boolean; error?: string } = { ok: false }
    if (r5.ok) {
      r5b = s.resolverComodinIR("test-si-2", "aprobar_crear")
      const creado = useCompassStore.getState().activosIR.find(x => x.nombre === "Escobillón industrial TEST")
      if (!r5b.ok || !creado) { pasos[4]!.estado = "error"; pasos[4]!.error = r5b.error ?? "No se creó el artículo" } else pasos[4]!.estado = "ok"
    } else { pasos[4]!.estado = "error"; pasos[4]!.error = r5.error }
    // 6) Entrega EPP individual con renovación calculada
    const r6 = s.registrarEntregaEPP({ id: "test-epp-1", recursoId: "test-ir-casco", personaId: "test-p-88", fechaEntrega: "2026-08-25", talla: "M", estado: "nuevo" } as any)
    const eppGuardada = useCompassStore.getState().entregasEPP.find(e => e.id === "test-epp-1")
    if (!r6.ok || eppGuardada?.proximaRenovacion !== "2027-02-25") { pasos[5]!.estado = "error"; pasos[5]!.error = r6.error ?? `Renovación: ${eppGuardada?.proximaRenovacion}` } else pasos[5]!.estado = "ok"
    // 7) Asignar llave al arrendatario TEST
    const r7 = s.asignarAccesoIR("test-ir-llave999", "test-p-88")
    if (!r7.ok) { pasos[6]!.estado = "error"; pasos[6]!.error = r7.error } else pasos[6]!.estado = "ok"
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "ir", label: TITULOS["ir"]!, rank: 7, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  const cargarFase10IN = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["in"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    // Directiva TEST vigente (requisito de respaldo; reusa extensión GD si existe).
    const p99 = s.personas.find(x => x.id === "test-p-99")
    if (!p99?.datosGobernanza) {
      const rAux = s.savePersona({ ...s.personas.find(x => x.id === "test-p-99")!, roles: Array.from(new Set([...(p99?.roles ?? []), "directiva"])), datosGobernanza: { id: "gob-test-1", cargoDirectiva: "presidente", fechaAsuncion: "2026-08-24" } } as any)
      if (!rAux.ok) { pasos[0]!.estado = "error"; pasos[0]!.error = rAux.error }
    }
    // 1) Tipo de falta TEST monto fijo
    const r1 = s.saveTipoInfraccionIN({ id: "test-tipo-in", nombre: "Falta TEST Reglamento", categoria: "leve", tipoSancion: "monto_fijo", valor: 25000 } as any)
    if (!r1.ok) { pasos[0]!.estado = "error"; pasos[0]!.error = r1.error } else pasos[0]!.estado = "ok"
    // 2) Infracción leve con evidencia D1
    const r2 = s.saveInfraccionIN({ id: "test-in-leve", folio: "", tipoInfraccionId: "test-tipo-in", unidadId: "test-u-999", reportantePersonaId: undefined, fechaSuceso: "2026-08-24", horaSuceso: "21:30", antecedentes: "Basura depositada fuera de horario en contenedor central TEST.", evidencias: [{ nombre: "test-evidencia.jpg", tipoMime: "image/jpeg", tamanoKB: 80, url: "https://placeholder.supabase.co/test-evidencia.jpg" }], estado: "en_revision", fechaRegistro: "2026-08-25", comentariosDirectiva: [], respaldosDirectiva: [] } as any)
    if (!r2.ok) { pasos[1]!.estado = "error"; pasos[1]!.error = r2.error } else pasos[1]!.estado = "ok"
    // 3) Apelación con descargos
    const r3 = s.apelarInfraccionIN("test-in-leve", "Los desechos eran del servicio de mudanza contratado por el vecino vecino.")
    if (!r3.ok) { pasos[2]!.estado = "error"; pasos[2]!.error = r3.error } else pasos[2]!.estado = "ok"
    // 4) Infracción grave nacida desde el reclamo TEST de CO
    const r4 = s.saveInfraccionIN({ id: "test-in-grave", folio: "", tipoInfraccionId: "tipo-in-ruidos", unidadId: "test-u-999", mensajeBuzonId: "test-buz-co-1", fechaSuceso: "2026-08-24", horaSuceso: "23:45", antecedentes: "Ruidos molestos reiterados verificados mediante revisión de cámaras CCTV.", evidencias: [], estado: "en_revision", fechaRegistro: "2026-08-25", comentariosDirectiva: [], respaldosDirectiva: [] } as any)
    if (!r4.ok) { pasos[3]!.estado = "error"; pasos[3]!.error = r4.error } else pasos[3]!.estado = "ok"
    // 5) Respaldo directiva sobre la grave
    const r5 = s.respaldarInfraccionIN("test-in-grave", "test-p-99")
    if (!r5.ok) { pasos[4]!.estado = "error"; pasos[4]!.error = r5.error } else pasos[4]!.estado = "ok"
    // 6) Aplicar grave → % GC + cobro FI materializado
    const r6 = s.aplicarInfraccionIN("test-in-grave")
    const grave = useCompassStore.getState().infraccionesIN.find(i => i.id === "test-in-grave")
    if (!r6.ok || grave?.estado !== "aplicada" || !String(grave.cargoFIReferencia ?? "").startsWith("cob-") || !useCompassStore.getState().cobrosFI.some(c => c.id === grave.cargoFIReferencia && c.concepto === "multa_in")) {
      pasos[5]!.estado = "error"; pasos[5]!.error = r6.error ?? `Estado/cargo: ${grave?.estado}/${grave?.cargoFIReferencia}`
    } else pasos[5]!.estado = "ok"
    // 7) Desestimar la leve apelada con justificación
    const r7 = s.desestimarInfraccionIN("test-in-leve", "Descargos verificados: los residuos corresponden a mudanza autorizada.")
    if (!r7.ok) { pasos[6]!.estado = "error"; pasos[6]!.error = r7.error } else pasos[6]!.estado = "ok"
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "in", label: TITULOS["in"]!, rank: 7, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  const cargarFase11MT = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["mt"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    // 1) Activo de infraestructura IR para vincular el trabajo
    const r0 = s.saveRecursoIR({ id: "test-ir-hidro", nombre: "Hidropack TEST", categoria: "infraestructura", marca: "Grundfos TEST", estadoActivo: "disponible", stock: 0, esCritico: false, microSectorId: "test-micro-piso99" } as any)
    if (!r0.ok) { pasos[0]!.estado = "error"; pasos[0]!.error = r0.error } else pasos[0]!.estado = "ok"
    // 2) Trabajo preventivo mensual con proveedor externo
    const r1 = s.saveTrabajoMT({ id: "test-mt-1", folio: "", titulo: "Mantención mensual Hidropack TEST", descripcion: "Revisión de presiones, sellos y tablero de control del hidropack del recinto.", activoIRId: "test-ir-hidro", microSectorId: "test-micro-piso99", proveedor: { nombre: "AquaServicio TEST", contacto: "+56 9 8888 0000" }, prioridad: "alta", costoTotal: 180000, origenFondos: "gasto_comun", estadoPago: "pendiente", alertaGarantiaEnviada: false, evidencias: [], preventivo: { periodicidadMeses: 1 }, cargoFIReferencia: "pendiente" } as any)
    if (!r1.ok) { pasos[1]!.estado = "error"; pasos[1]!.error = r1.error } else pasos[1]!.estado = "ok"
    // 3) Iniciar → En Curso
    const r2 = s.iniciarTrabajoMT("test-mt-1")
    const enCurso = useCompassStore.getState().trabajosMT.find(t => t.id === "test-mt-1")?.estado === "en_curso"
    if (!r2.ok || !enCurso) { pasos[2]!.estado = "error"; pasos[2]!.error = r2.error ?? "No quedó En Curso" } else pasos[2]!.estado = "ok"
    // 4) Finalizar → genera próximo preventivo (+1 mes)
    const r3 = s.finalizarTrabajoMT("test-mt-1", { fechaTermino: "2026-08-25", costoFinal: 185000 })
    const generado = useCompassStore.getState().trabajosMT.find(t => t.estado === "planificado" && t.preventivo && t.id !== "test-mt-1")
    if (!r3.ok || !generado || generado.fechaProgramada !== "2026-09-25") {
      pasos[3]!.estado = "error"; pasos[3]!.error = r3.error ?? `Próximo preventivo: ${generado?.fechaProgramada}`
    } else pasos[3]!.estado = "ok"
    // 5) Correctivo con garantía vencida → verificar alerta única
    const r4 = s.saveTrabajoMT({ id: "test-mt-2", folio: "", titulo: "Impermeabilización losa TEST", descripcion: "Sellado de losas y muros perimetrales del estanque de agua potable.", microSectorId: "test-micro-piso99", proveedor: { nombre: "WaterProof TEST" }, prioridad: "media", costoTotal: 950000, origenFondos: "fondo_reserva", estadoPago: "parcial", estado: "finalizado", fechaTermino: "2026-01-10", garantiaInicio: "2026-01-10", garantiaFin: "2026-07-01", alertaGarantiaEnviada: false, evidencias: [{ tipo: "factura", nombre: "test-factura.pdf", tipoMime: "application/pdf", tamanoKB: 210, url: "https://placeholder.supabase.co/test-factura.pdf" }] } as any)
    if (r4.ok) {
      s.verificarGarantiasMT()
      const eventosGarantia = useCompassStore.getState().eventos.filter(e => e.tipoAccion === "MT_GUARANTEE_EXPIRED" && e.referenciaId === "test-mt-2")
      if (eventosGarantia.length !== 1) { pasos[4]!.estado = "error"; pasos[4]!.error = `Alertas garantía: ${eventosGarantia.length}` } else pasos[4]!.estado = "ok"
    } else { pasos[4]!.estado = "error"; pasos[4]!.error = r4.error }
    // 6) Proyecto largo plazo con cuota derivable ($12M / 120m = $100.000)
    const r5 = s.saveProyectoMT({ id: "test-py-techos", nombre: "Mantención de techos TEST", presupuestoEstimado: 12000000, plazoMeses: 120, estado: "planificado" } as any)
    if (!r5.ok) { pasos[5]!.estado = "error"; pasos[5]!.error = r5.error } else pasos[5]!.estado = "ok"
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "mt", label: TITULOS["mt"]!, rank: 7, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  const mananaStr = () => {
    const m = new Date()
    m.setDate(m.getDate() + 1)
    return m.toISOString().slice(0, 10)
  }

  const cargarFase12RA = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["ra"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    // 1) Quincho TEST con reglas completas (tarifa/garantía/tardía)
    const r1 = s.saveElementoRA({ id: "test-ra-quincho", nombre: "Quincho central TEST", tipo: "espacio_fisico", microSectorId: "test-micro-piso99", franja: "bloques_horas", duracionBloqueHoras: 3, tarifaUso: 15000, garantiaRequerida: 20000, aforo: 20, anticipacionMinimaDias: 0, cancelacionTardiaDias: 1, penalizacionTardiaMonto: 5000, activo: true } as any)
    if (!r1.ok) { pasos[0]!.estado = "error"; pasos[0]!.error = r1.error } else pasos[0]!.estado = "ok"
    // 2) Reserva confirmada mañana 19:00–22:00
    const r2 = s.saveReservaRA({ id: "test-ra-rs-1", folio: "", elementoId: "test-ra-quincho", solicitantePersonaId: "test-p-99", unidadId: "test-u-999", fecha: mananaStr(), horaInicio: "19:00", horaFin: "22:00", estado: "confirmada", montoTarifa: 0, montoGarantia: 0 } as any)
    const rs1 = useCompassStore.getState().reservasRA.find(x => x.id === "test-ra-rs-1")
    if (!r2.ok || !/^RA-\d{4}$/.test(rs1?.folio ?? "") || !String(rs1?.cargoFIReferencia ?? "").startsWith("cob-")) { pasos[1]!.estado = "error"; pasos[1]!.error = r2.error ?? `Folio/cargo: ${rs1?.folio}/${rs1?.cargoFIReferencia}` } else pasos[1]!.estado = "ok"
    // 3) Solapamiento rechazado
    const r3 = s.saveReservaRA({ id: "test-ra-rs-x", folio: "", elementoId: "test-ra-quincho", solicitantePersonaId: "test-p-88", fecha: mananaStr(), horaInicio: "20:00", horaFin: "23:00", estado: "confirmada", montoTarifa: 0, montoGarantia: 0 } as any)
    if (r3.ok || !String(r3.error).includes("Conflicto horario")) { pasos[2]!.estado = "error"; pasos[2]!.error = r3.ok ? "El solapamiento pasó" : String(r3.error) } else pasos[2]!.estado = "ok"
    // 4) Hidrolavadora stock 2 → 2 paralelas OK, tercera rechazada
    const r4 = s.saveElementoRA({ id: "test-ra-hidro", nombre: "Hidrolavadora TEST", tipo: "activo_mobiliario", microSectorId: "test-micro-piso99", franja: "dia_completo", tarifaUso: 5000, garantiaRequerida: 30000, stock: 2, activo: true } as any)
    if (!r4.ok) { pasos[3]!.estado = "error"; pasos[3]!.error = r4.error } else {
      const a = s.saveReservaRA({ id: "test-ra-rs-2", folio: "", elementoId: "test-ra-hidro", solicitantePersonaId: "test-p-88", unidadId: "test-u-999", fecha: mananaStr(), horaInicio: "00:00", horaFin: "23:59", estado: "confirmada", montoTarifa: 0, montoGarantia: 0 } as any)
      const b = s.saveReservaRA({ id: "test-ra-rs-3", folio: "", elementoId: "test-ra-hidro", solicitantePersonaId: "test-p-99", fecha: mananaStr(), horaInicio: "00:00", horaFin: "23:59", estado: "confirmada", montoTarifa: 0, montoGarantia: 0 } as any)
      const c = s.saveReservaRA({ id: "test-ra-rs-y", folio: "", elementoId: "test-ra-hidro", solicitantePersonaId: "test-p-88", fecha: mananaStr(), horaInicio: "00:00", horaFin: "23:59", estado: "confirmada", montoTarifa: 0, montoGarantia: 0 } as any)
      if (!a.ok || !b.ok || c.ok || !String(c.error).includes("Conflicto horario")) { pasos[3]!.estado = "error"; pasos[3]!.error = c.ok ? "Tercera reserva paralela pasó el control de stock" : a.error ?? b.error ?? String(c.error) } else pasos[3]!.estado = "ok"
    }
    // 5) Cancelación tardía con penalización
    const r5 = s.cancelarReservaRA("test-ra-rs-1")
    const cancelada = useCompassStore.getState().reservasRA.find(x => x.id === "test-ra-rs-1")
    if (!r5.ok || cancelada?.cancelacion?.tardia !== true || cancelada.cancelacion.penalizacion !== 5000) { pasos[4]!.estado = "error"; pasos[4]!.error = r5.error ?? `Cancelación: ${JSON.stringify(cancelada?.cancelacion)}` } else pasos[4]!.estado = "ok"
    // 6) Retención de garantía por daño
    const r6 = s.retenerGarantiaRA("test-ra-rs-2", "Manguera fracturada al devolver el equipo TEST.")
    const retenida = useCompassStore.getState().reservasRA.find(x => x.id === "test-ra-rs-2")?.garantiaRetenida
    if (!r6.ok || retenida?.monto !== 30000) { pasos[5]!.estado = "error"; pasos[5]!.error = r6.error ?? JSON.stringify(retenida) } else pasos[5]!.estado = "ok"
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "ra", label: TITULOS["ra"]!, rank: 8, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  const cargarFase12CV = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["cv"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    // 1) Activación instantánea de plantilla por personal de servicio
    const r1 = s.activarPlantillaCV("plant-cv-porton")
    const avisoPorton = useCompassStore.getState().avisosCV.find(a => a.plantillaId === "plant-cv-porton")
    if (!r1.ok || avisoPorton?.estado !== "publicado" || avisoPorton.tipologia !== "advertencia") { pasos[0]!.estado = "error"; pasos[0]!.error = r1.error ?? `Estado: ${avisoPorton?.estado}` } else pasos[0]!.estado = "ok"
    // 2) Aviso manual con imagen URL remota → publicar
    const ayer = new Date()
    ayer.setDate(ayer.getDate() - 1)
    const r2 = s.saveAvisoCV({ id: "test-cv-manual", titulo: "Corte de agua programado TEST", cuerpo: "Corte de agua TEST entre 10:00 y 14:00 por mantención del estanque.", tipologia: "info", duracionSegundos: 8, imagenUrl: "https://placeholder.supabase.co/test-cv-agua.jpg", pantallaCompleta: false, tags: ["qa", "cortes"], estado: "borrador", requiereVistoBueno: false, origen: "manual", fechaCreacion: new Date().toISOString().slice(0, 10) })
    let publicadoOk = false
    if (!r2.ok) { pasos[1]!.estado = "error"; pasos[1]!.error = r2.error } else {
      publicadoOk = s.publicarAvisoCV("test-cv-manual").ok && useCompassStore.getState().avisosCV.find(a => a.id === "test-cv-manual")?.estado === "publicado"
      if (!publicadoOk) { pasos[1]!.estado = "error"; pasos[1]!.error = "No quedó publicado" } else pasos[1]!.estado = "ok"
    }
    // 3) Caducidad automática de un vencido
    const r3 = s.saveAvisoCV({ id: "test-cv-expirado", titulo: "Aviso vencido TEST", cuerpo: "Este aviso TEST venció ayer para probar la caducidad automática.", tipologia: "exito", duracionSegundos: 5, expiresAt: ayer.toISOString().slice(0, 10), pantallaCompleta: false, tags: ["qa"], estado: "borrador", requiereVistoBueno: false, origen: "manual", fechaCreacion: ayer.toISOString().slice(0, 10) })
    let caducadoOk = false
    if (!r3.ok) { pasos[2]!.estado = "error"; pasos[2]!.error = r3.error } else {
      s.publicarAvisoCV("test-cv-expirado")
      s.caducarAvisosCV()
      caducadoOk = useCompassStore.getState().avisosCV.find(a => a.id === "test-cv-expirado")?.estado === "archivado"
      if (!caducadoOk) { pasos[2]!.estado = "error"; pasos[2]!.error = "No fue archivado por caducidad" } else pasos[2]!.estado = "ok"
    }
    // 4) Publicar acta GD TEST → materializa avisoCVReferencia
    const acta = useCompassStore.getState().actasGD.find(a => a.id === "test-acta-gd")
    if (!acta || acta.estado !== "publicada") {
      pasos[3]!.estado = "error"; pasos[3]!.error = "Falta test-acta-gd publicada (ejecuta la fase GD)"
    } else {
      const r4 = s.publicarActaEnCV("test-acta-gd")
      const actaFinal = useCompassStore.getState().actasGD.find(a => a.id === "test-acta-gd")
      const avisoActa = actaFinal?.avisoCVReferencia ? useCompassStore.getState().avisosCV.find(a => a.id === actaFinal.avisoCVReferencia) : undefined
      if (!r4.ok || !actaFinal || !actaFinal.avisoCVReferencia || actaFinal.avisoCVReferencia === "pendiente" || avisoActa?.origen !== "acta_gd" || avisoActa.estado !== "publicado") {
        pasos[3]!.estado = "error"; pasos[3]!.error = r4.error ?? `Referencia: ${actaFinal?.avisoCVReferencia}`
      } else pasos[3]!.estado = "ok"
    }
    // 5) Cola del carrusel con duraciones individuales
    const cola = useCompassStore.getState().avisosCV.filter(a => a.estado === "publicado")
    const duraciones = new Set(cola.map(a => a.duracionSegundos))
    if (cola.length < 3 || duraciones.size < 2) { pasos[4]!.estado = "error"; pasos[4]!.error = `Cola: ${cola.length} avisos, ${duraciones.size} duración(es)` } else pasos[4]!.estado = "ok"
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "cv", label: TITULOS["cv"]!, rank: 8, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  const periodoMesesAtrasFI = (meses: number): string => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - meses)
    return d.toISOString().slice(0, 7)
  }

  const cargarFase13FI = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["fi"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    // 1) Fondo extraordinario TEST junto al seed de fondos NSGC
    const r1 = s.saveFondoFI({ id: "test-fondo-pintura", nombre: "Fondo Cuota Extraordinaria Pintura TEST", tipo: "especial", descripcion: "Cuota aprobada en asamblea para pintura de fachadas.", activo: true } as any)
    if (!r1.ok) { pasos[0]!.estado = "error"; pasos[0]!.error = r1.error } else pasos[0]!.estado = "ok"
    // 2) Egreso recurrente imputado con comprobante D1
    const r2 = s.saveEgresoFI({ id: "test-egr-1", fecha: new Date().toISOString().slice(0, 10), categoria: "sueldos", descripcion: "Sueldo conserje TEST", monto: 350000, fondoId: "fondo-gc", esRecurrente: true, comprobante: { nombre: "test-boleta.pdf", tipoMime: "application/pdf", tamanoKB: 90, url: "https://placeholder.supabase.co/test-boleta.pdf" } } as any)
    if (!r2.ok || !useCompassStore.getState().egresosFI.find(e => e.id === "test-egr-1")?.folio?.startsWith("FE-")) { pasos[1]!.estado = "error"; pasos[1]!.error = r2.error ?? "Sin folio FE" } else pasos[1]!.estado = "ok"
    // 3) Emisión GC variable sobre unidades TEST con aporte al fondo de reserva
    const unidadTest = "test-u-999"
    const uTest = s.unidades.find(u => u.id === unidadTest)
    const montoEsperado = Math.round(450000 * (uTest?.prorrateo ?? 0))
    const r3 = s.emitirGastoComun({ periodo: new Date().toISOString().slice(0, 7), gastoTotal: 450000, unidadIds: [unidadTest] })
    const emision = useCompassStore.getState().emisionesGC.find(e => e.periodo === new Date().toISOString().slice(0, 7))
    const aporteEsperado = Math.round(montoEsperado * 5 / 100)
    if (!r3.ok || !emision || emision.lineas[0]?.monto !== montoEsperado || emision.fondoReservaAporte?.monto !== aporteEsperado) {
      pasos[2]!.estado = "error"; pasos[2]!.error = r3.error ?? `Monto/aporte: ${emision?.lineas[0]?.monto}/${emision?.fondoReservaAporte?.monto} (esperado ${montoEsperado}/${aporteEsperado})`
    } else pasos[2]!.estado = "ok"
    // 4) Emisión sin alcance → bloqueada por unidades sin responsable
    const r4 = s.emitirGastoComun({ periodo: "2025-12", gastoTotal: 1000000 })
    if (r4.ok || !String(r4.error).includes("responsable de cobro")) { pasos[3]!.estado = "error"; pasos[3]!.error = r4.ok ? "La emisión completa pasó sin responsables" : String(r4.error) } else pasos[3]!.estado = "ok"
    // 5) Pago exacto del cobro GC del depto TEST
    const cobroGC = useCompassStore.getState().cobrosFI.find(c => c.concepto === "gasto_comun" && c.periodo === new Date().toISOString().slice(0, 7))
    if (!cobroGC) { pasos[4]!.estado = "error"; pasos[4]!.error = "No existe el cobro GC del periodo" } else {
      const exigibleGC = cobroGC.montoBase + cobroGC.moras.reduce((a, m) => a + m.monto, 0) - cobroGC.pagos.reduce((a, p) => a + p.monto, 0)
      const r5 = s.registrarPagoFI(cobroGC.id, { monto: exigibleGC, medio: "transferencia" })
      const pagadoOk = useCompassStore.getState().cobrosFI.find(c => c.id === cobroGC.id)?.pagos.length === 1
      if (!r5.ok || !pagadoOk) { pasos[4]!.estado = "error"; pasos[4]!.error = r5.error ?? "Pago no registrado" } else pasos[4]!.estado = "ok"
    }
    // 6) Mora sobre el periodo vencido (2 meses atrás garantiza vencimiento aunque hoy sea día 1), idempotente por día
    const r6a = s.emitirGastoComun({ periodo: periodoMesesAtrasFI(2), gastoTotal: 200000, unidadIds: [unidadTest] })
    const cobroVencido = useCompassStore.getState().cobrosFI.find(c => c.concepto === "gasto_comun" && c.periodo === periodoMesesAtrasFI(2))
    let moraOk = false
    if (r6a.ok && cobroVencido) {
      s.aplicarMoraFI(cobroVencido.id, 1)
      moraOk = (useCompassStore.getState().cobrosFI.find(c => c.id === cobroVencido.id)?.moras.length ?? 0) >= 1
      s.aplicarMoraFI(cobroVencido.id, 1)
      moraOk = moraOk && (useCompassStore.getState().cobrosFI.find(c => c.id === cobroVencido.id)?.moras.length ?? 0) >= 1
    }
    if (!moraOk) { pasos[5]!.estado = "error"; pasos[5]!.error = r6a.error ?? "Mora no aplicada" } else pasos[5]!.estado = "ok"
    // 7) Pago con descuento justificado sobre la multa TEST → informe de diferencia inmutable.
    // El descuento es proporcional (10%, mínimo $1) porque una multa % GC sin emisión
    // previa cae al valor nominal del catálogo (ej. $50) y un descuento fijo de $1000
    // daría un monto negativo que el store rechaza siempre.
    const cobroMulta = useCompassStore.getState().cobrosFI.find(c => c.concepto === "multa_in")
    if (!cobroMulta) { pasos[6]!.estado = "error"; pasos[6]!.error = "No existe el cobro multa_in (ejecuta la fase IN)" } else {
      const pendienteMulta = cobroMulta.montoBase + cobroMulta.moras.reduce((a, m) => a + m.monto, 0) - cobroMulta.pagos.reduce((a, p) => a + p.monto, 0)
      const descuento = Math.max(1, Math.round(pendienteMulta * 0.1))
      const montoConDescuento = pendienteMulta - descuento
      const sinJustificacion = s.registrarPagoFI(cobroMulta.id, { monto: montoConDescuento, medio: "efectivo" })
      const conJustificacion = s.registrarPagoFI(cobroMulta.id, { monto: montoConDescuento, medio: "efectivo", ajusteJustificacion: "Condonación parcial autorizada por la directiva TEST." })
      const dif = useCompassStore.getState().cobrosFI.find(c => c.id === cobroMulta.id)?.diferencias.length === 1
      if (!sinJustificacion.ok && conJustificacion.ok && dif && useCompassStore.getState().eventos.some(e => e.tipoAccion === "FI_MANUAL_DISCOUNT")) pasos[6]!.estado = "ok"
      else { pasos[6]!.estado = "error"; pasos[6]!.error = conJustificacion.error ?? `Diferencias: ${useCompassStore.getState().cobrosFI.find(c => c.id === cobroMulta.id)?.diferencias.length}` }
    }
    // 8) Conexión IN: la multa grave aplicada vive como cobro real imputado
    const grave = s.infraccionesIN.find(i => i.id === "test-in-grave")
    const cobroGrave = useCompassStore.getState().cobrosFI.find(c => c.origenRef === "test-in-grave" && c.concepto === "multa_in")
    if (!grave || !String(grave.cargoFIReferencia ?? "").startsWith("cob-") || !cobroGrave || cobroGrave.fondoId !== "fondo-gc") {
      pasos[7]!.estado = "error"; pasos[7]!.error = "Cobro multa_in no materializado (ejecuta la fase IN)"
    } else pasos[7]!.estado = "ok"
    // 9) Conexión RA: la tarifa del quincho quedó como cobro del fondo amenities (cargo puede ser penalización tras cancelación)
    const reservaQuincho = useCompassStore.getState().reservasRA.find(r => r.id === "test-ra-rs-1")
    const cobroTarifa = useCompassStore.getState().cobrosFI.find(c => c.origenRef === "test-ra-rs-1" && c.concepto === "reserva_ra")
    if (!reservaQuincho || !cobroTarifa || cobroTarifa.fondoId !== "fondo-amenities") {
      pasos[8]!.estado = "error"; pasos[8]!.error = "Cobro reserva_ra no materializado (ejecuta la fase RA)"
    } else pasos[8]!.estado = "ok"
    // 10) Conexión MT: proyecto financiado por fondo GC sin saldo → rechazado
    const r10 = s.saveProyectoMT({ id: "test-py-financiado", nombre: "Repintado fachada TEST", presupuestoEstimado: 12000000, plazoMeses: 120, estado: "planificado", fondoFinanciamientoId: "fondo-gc" } as any)
    if (r10.ok || !String(r10.error).includes("Saldo insuficiente")) { pasos[9]!.estado = "error"; pasos[9]!.error = r10.ok ? "El proyecto pasó sin saldo suficiente" : String(r10.error) } else pasos[9]!.estado = "ok"
    // 11) Retiro del fondo de reserva sin acta publicada → rechazado
    const r11 = s.retirarFondoFI({ fondoId: "fondo-reserva", monto: 50000, descripcion: "Retiro sin respaldo TEST" })
    if (r11.ok || !String(r11.error).includes("acta")) { pasos[10]!.estado = "error"; pasos[10]!.error = r11.ok ? "El retiro sin acta pasó" : String(r11.error) } else pasos[10]!.estado = "ok"
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "fi", label: TITULOS["fi"]!, rank: 9, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  const cargarFase14PE = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["pe"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    const hoy = new Date().toISOString().slice(0, 10)
    const anioProximo = new Date().getFullYear() + 1
    const mesProyeccion = `${anioProximo}-01`
    // 1) Ficha integral del trabajador TEST con FKs a maestros legales
    const p99 = s.personas.find(p => p.id === "test-p-99")
    const r1 = p99 ? s.savePersona({
      ...p99,
      datosLaborales: {
        id: "l-test-pe", cargo: "Conserje Turno Noche TEST", afp: "Habitat", prevision: "FONASA",
        fechaIngreso: "2026-01-05", tipoContrato: "indefinido", afpId: "afp-habitat", saludId: "fonasa",
        bancoId: "banco-estado", asignacionFamiliarId: "asf-a", cargas: 1, jornadaBaseHoras: 45,
        contactosEmergencia: [{ id: "test-pe-ce-1", nombre: "Contacto Emergencia TEST", telefono: "+56 9 9999 0000", relacion: "Pareja" }],
      },
    } as any) : { ok: false, error: "test-p-99 no existe" }
    if (!r1.ok || !useCompassStore.getState().personas.find(p => p.id === "test-p-99")?.datosLaborales?.afpId) { pasos[0]!.estado = "error"; pasos[0]!.error = r1.ok ? "Ficha sin FKs legales" : r1.error } else pasos[0]!.estado = "ok"
    // 2) Hora extra + evaluación de desempeño auditadas
    const r2a = s.registrarHoraExtraPE("test-p-99", { fecha: hoy, horas: 2, motivo: "Reemplazo jornada tarde TEST" })
    const r2b = s.registrarEvaluacionPE("test-p-99", { fecha: hoy, puntaje: 6, comentarios: "Desempeño TEST destacado" })
    if (!r2a.ok || !r2b.ok || (useCompassStore.getState().eventos.filter(e => e.tipoAccion === "PE_HORA_EXTRA_REGISTRADA" || e.tipoAccion === "PE_EVALUACION_REGISTRADA").length < 2)) { pasos[1]!.estado = "error"; pasos[1]!.error = r2a.error ?? r2b.error } else pasos[1]!.estado = "ok"
    // 3) Feriado TEST irrenunciable → proyección de cobertura
    const rFeriado = s.saveMaestro("feriados", { id: `test-feriado-${anioProximo}-0101`, fecha: `${anioProximo}-01-01`, nombre: "Año Nuevo TEST", irrenunciable: true } as any)
    if (!rFeriado.ok) { pasos[2]!.estado = "error"; pasos[2]!.error = rFeriado.error } else {
      const proyeccionBase = calcularProyeccionCobertura({ feriados: useCompassStore.getState().maestros.feriados, mesAnio: mesProyeccion })
      if (proyeccionBase.diasFeriados !== 1 || proyeccionBase.reemplazosNecesarios !== 2) { pasos[2]!.estado = "error"; pasos[2]!.error = `Cobertura: ${proyeccionBase.diasFeriados} feriado(s), ${proyeccionBase.reemplazosNecesarios} reemplazo(s)` } else pasos[2]!.estado = "ok"
    }
    // 4) Enviar proyección de costos a FI con PL pendiente
    const r4 = s.enviarProyeccionCostoFI(mesProyeccion, { costoParche: 30000, costoDiaExtra: 25000, id: "test-pe-proy" })
    const proy = useCompassStore.getState().proyeccionesPE.find(p => p.id === "test-pe-proy")
    if (!r4.ok || !proy || proy.liquidacionPLReferencia !== "pendiente") { pasos[3]!.estado = "error"; pasos[3]!.error = r4.error ?? "Proyección sin marcador PL" } else pasos[3]!.estado = "ok"
    // 5) Visita pre-agendada → ingresada sella hora
    const r5a = s.saveBitacoraVisitaPE({ id: "test-pe-visita", fecha: hoy, nombre: "Visita QA TEST", dni: "16.444.555-0", unidadId: "test-u-999", destinoPersonaId: "test-p-88", jornadaId: "j-manana", origenAgenda: "pre_agendada", estado: "agendada" } as any)
    const r5b = s.ingresarBitacoraVisitaPE("test-pe-visita")
    const visitaIngresada = useCompassStore.getState().bitacoraVisitasPE.find(v => v.id === "test-pe-visita")
    if (!r5a.ok || !r5b.ok || visitaIngresada?.estado !== "ingresada" || !visitaIngresada.horaIngreso) { pasos[4]!.estado = "error"; pasos[4]!.error = r5a.error ?? r5b.error ?? "Hora de ingreso no sellada" } else pasos[4]!.estado = "ok"
    // 6) Encomienda TEST con evidencia D1 y retiro
    const r6a = s.saveEncomiendaPE({ id: "test-pe-enc", courierId: "cour-chilexpress", destinatarioPersonaId: "test-p-99", descripcionPaquete: "Paquete TEST", evidencia: { nombre: "test-paquete.jpg", tipoMime: "image/jpeg", tamanoKB: 80, url: "https://placeholder.supabase.co/test-paquete.jpg" }, fechaRecepcion: hoy, estado: "recibida" } as any)
    const r6b = s.registrarRetiroEncomiendaPE("test-pe-enc", "TEST Persona QA Uno")
    if (!r6a.ok || !r6b.ok) { pasos[5]!.estado = "error"; pasos[5]!.error = r6a.error ?? r6b.error } else pasos[5]!.estado = "ok"
    // 7) Contratista agendado por residente → confirmación sella hora
    const r7a = s.saveIngresoContratistaPE({ id: "test-pe-cont", contratistaId: "cont-gasfiteria", motivo: "Reparación de fuga en cocina Depto 999 TEST", unidadId: "test-u-999", fecha: hoy, jornadaId: "j-tarde", agendadoPor: "residente", personaAgendaId: "test-p-88", estado: "agendado" } as any)
    const r7b = s.confirmarIngresoContratistaPE("test-pe-cont")
    if (!r7a.ok || !r7b.ok) { pasos[6]!.estado = "error"; pasos[6]!.error = r7a.error ?? r7b.error } else pasos[6]!.estado = "ok"
    // 8) Proveedor TEST + mantención mensual vencida → alerta
    const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const r8a = s.saveProveedorPE({ id: "test-pe-prov", rut: "76.543.210-3", nombre: "Ascensores TEST Ltda.", rubro: "Ascensores", telefono: "+56 2 9999 8888", activo: true } as any)
    const r8b = s.saveMantencionPE({ id: "test-pe-mant", proveedorId: "test-pe-prov", descripcion: "Mantención ascensor Torre TEST", periodicidadMeses: 1, proximaFecha: ayer, alertaDiasAntes: 5, activo: true } as any)
    if (!r8a.ok || !r8b.ok) { pasos[7]!.estado = "error"; pasos[7]!.error = r8a.error ?? r8b.error } else pasos[7]!.estado = "ok"
    // 9) Visita técnica reprograma el ciclo preventivo un mes
    const r9 = s.registrarVisitaTecnicaPE({ id: "test-pe-vt", proveedorId: "test-pe-prov", mantencionId: "test-pe-mant", tecnicoNombre: "Técnico TEST", fecha: hoy, trabajoRealizado: "Inspección completa de cabina TEST", supervisorPersonaId: "test-p-99" } as any)
    const proxima = useCompassStore.getState().mantencionesPreventivasPE.find(m => m.id === "test-pe-mant")?.proximaFecha
    const mesSiguiente = (() => { const d = new Date(`${hoy}T00:00:00`); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10) })()
    if (!r9.ok || proxima !== mesSiguiente) { pasos[8]!.estado = "error"; pasos[8]!.error = r9.error ?? `Próxima fecha ${proxima} != ${mesSiguiente}` } else pasos[8]!.estado = "ok"
    // 10) Cierre de turno nocturno con incidencias → notify administración + copia
    const r10a = s.iniciarTurnoPE("test-p-99", "j-noche")
    const r10b = s.cerrarTurnoPE({
      id: "test-pe-cierre",
      fecha: hoy,
      hora: "20:30",
      jornadaReportadaId: "j-noche",
      trabajadorPersonaId: "test-p-99",
      novedadesGenerales: "Rondas nocturnas completas TEST.",
      incidencias: { hubo: true, descripcion: "Luminaria del perímetro norte fuera de servicio TEST.", evidencias: [{ nombre: "test-luminaria.jpg", tipoMime: "image/jpeg", tamanoKB: 95, url: "https://placeholder.supabase.co/test-luminaria.jpg" }] },
      checklistInstalaciones: [
        { item: "Perímetro verificado con rondas", ok: true },
        { item: "Puertas de acceso aseguradas", ok: true },
        { item: "Iluminación nocturna operativa", ok: false, observacion: "Luminaria norte" },
        { item: "Registro de ronda al día", ok: true },
      ],
      checklistEquipamiento: [
        { item: "Celular de turno operativo", ok: true },
        { item: "PC de conserjería operativo", ok: true },
        { item: "Llaves maestras completas", ok: true },
      ],
    } as any)
    const notifPE = useCompassStore.getState().notificaciones.filter(n => n.moduloOrigen === "PE" && n.asunto.toLowerCase().includes("cierre de turno"))
    const copiaTrabajador = notifPE.some(n => n.destinatarioRol === "personal" && n.destinatarioPersonaId === "test-p-99")
    const avisoAdmin = notifPE.some(n => n.destinatarioRol === "administracion")
    if (!r10a.ok || !r10b.ok || !copiaTrabajador || !avisoAdmin) { pasos[9]!.estado = "error"; pasos[9]!.error = r10a.error ?? r10b.error ?? `Notificaciones admin/copía: ${avisoAdmin}/${copiaTrabajador}` } else pasos[9]!.estado = "ok"
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "pe", label: TITULOS["pe"]!, rank: 4, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  // P4 SERIE-GATED-API-BD: Remuneraciones lee BD vía API (P3), así que la
  // fase pobla vía API REST. El adelanto demo sigue en store legacy
  // documentado (sin /api/adelantos por alcance P3; la pestaña Adelantos lo
  // muestra) y la confirmada BD se refleja al store como espejo transitorio
  // (consumidores legacy: dropdown en Certificados, paso CT-4, huérfanos 0).
  const cargarFase15PL = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["pl"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    const hoy = new Date().toISOString().slice(0, 10)
    // 1) Parámetros legales CF vía API (idempotentes, reseed-proof).
    const rCfg = await apiQA("/api/configuracion", {
      method: "PUT",
      body: JSON.stringify({ ufMensual: 39000, ingresoMinimoMensual: 500000, topeGratificacionLegal: 4.75, tasaSIS: 1.48 }),
    })
    if (!rCfg.ok) { pasos[0]!.estado = "error"; pasos[0]!.error = `PUT configuración ${rCfg.status}: ${(rCfg.cuerpo as any)?.error ?? "sin detalle"}` }
    else pasos[0]!.estado = "ok"
    // 2) Trabajador QA con ficha vía API (upsert) + adelanto legacy en store.
    const maestros = async (tipo: string): Promise<{ id: string }[]> => {
      const r = await apiQA(`/api/maestros/${tipo}?pageSize=100`).catch(() => null)
      return ((r?.cuerpo as any)?.data ?? []) as { id: string }[]
    }
    const [afps, salud, tramos] = await Promise.all([
      maestros("afps"), maestros("previsiones-salud"), maestros("asignaciones-familiar"),
    ])
    if (!afps[0] || !salud[0] || !tramos[0]) {
      pasos[1]!.estado = "error"; pasos[1]!.error = "Maestros legales sin seed (ejecuta el reseed)"
    } else {
      const rTrab = await apiQA("/api/personas", {
        method: "POST",
        body: JSON.stringify({
          id: QA_PL_TRAB_ID,
          rut: QA_PL_RUT,
          nombreCompleto: "TEST Trabajador QA",
          nombres: "TEST Trabajador",
          apellidos: "QA",
          email: QA_PL_EMAIL,
          telefonoMovil: "+56900000999",
          estadoCuenta: "activa",
          condicionesEspecialesIds: [],
          roles: ["personal"],
          datosLaborales: {
            id: "lab-qa-pl",
            cargo: "Conserje Turno Noche TEST",
            afp: "AFP Habitat",
            prevision: "FONASA",
            fechaIngreso: "2026-01-05",
            tipoContrato: "indefinido",
            afpId: afps[0]!.id,
            saludId: (salud.find(x => (x as any).tipo === "fonasa") ?? salud[0])!.id,
            asignacionFamiliarId: tramos[0]!.id,
            cargas: 1,
            jornadaBaseHoras: 45,
            sueldoBase: 600000,
          },
        }),
      })
      // Adelanto demo legacy en store (visible en la pestaña Adelantos; sin contraparte API).
      const rAde = s.saveAdelantoPL({ id: "test-ade-1", folio: "", trabajadorPersonaId: "test-p-99", fecha: hoy, monto: 80000, glosa: "Adelanto quincena TEST (legacy store, sin API)", estado: "pendiente" })
      const ade = useCompassStore.getState().adelantosPL.find(a => a.id === "test-ade-1")
      if (!rTrab.ok || !rAde.ok || !ade?.folio.startsWith("ADE-")) {
        pasos[1]!.estado = "error"; pasos[1]!.error = !rTrab.ok ? `POST persona ${rTrab.status}: ${(rTrab.cuerpo as any)?.error ?? "sin detalle"}` : (rAde.error ?? "Sin folio ADE")
      } else pasos[1]!.estado = "ok"
    }
    // 3) Generar liquidación vía API en el primer periodo libre (la confirmada es inmutable: rota).
    let liqId = ""
    if (pasos[1]!.estado === "ok") {
      const liqs = await listaQA("/api/liquidaciones")
      const tomadas = new Set(liqs.filter(l => l.trabajadorPersonaId === QA_PL_TRAB_ID).map(l => l.periodo))
      const periodo = QA_PL_PERIODOS.find(p => !tomadas.has(p))
      if (!periodo) {
        pasos[2]!.estado = "error"; pasos[2]!.error = "Sin periodos libres en la ventana rotativa (ejecuta reseed+higiene)"
      } else {
        liqId = `test-liq-pl-qa-${periodo.replace("-", "")}`
        const rGen = await apiQA("/api/liquidaciones", {
          method: "POST",
          body: JSON.stringify({ id: liqId, trabajadorPersonaId: QA_PL_TRAB_ID, periodo, diasTrabajados: 30, asignacionMovilizacion: 30000 }),
        })
        // Sin descuento por adelanto: no hay /api/adelantos y el servidor solo descuenta pendientes de BD.
        const liq = rGen.cuerpo as any
        if (!rGen.ok || !liq?.folio?.startsWith("LIQ-") || !(liq.valorHoraOrdinaria > 0) || !(liq.gratificacionLegal > 0)) {
          pasos[2]!.estado = "error"; pasos[2]!.error = !rGen.ok ? `POST liquidaciones ${rGen.status}: ${(rGen.cuerpo as any)?.error ?? "sin detalle"}` : `Cálculo LIQ incompleto (${liq?.folio})`
        } else pasos[2]!.estado = "ok"
      }
    } else {
      pasos[2]!.estado = "error"; pasos[2]!.error = "Sin trabajador TEST (paso previo)"
    }
    // 4) Confirmar vía API → egreso FI Sueldos en BD + espejo store transitorio para CT/certificados/huérfanos.
    // El confirmar responde { ok, egresoId } (no la liquidación): se verifica
    // el egreso y se relee la liquidación para afirmar el estado.
    if (pasos[2]!.estado === "ok" && liqId) {
      const rConf = await apiQA(`/api/liquidaciones/${liqId}/confirmar`, { method: "POST" })
      const egrRef = (rConf.cuerpo as any)?.egresoId as string | undefined
      const rEgr = egrRef ? await apiQA(`/api/egresos-fi/${egrRef}`).catch(() => null) : null
      const rLiq = await apiQA(`/api/liquidaciones/${liqId}`).catch(() => null)
      const conf = (rLiq?.cuerpo as any) ?? (rConf.cuerpo as any)
      if (!rConf.ok || !egrRef?.startsWith("egr-") || !rEgr?.ok || conf?.estado !== "confirmada") {
        pasos[3]!.estado = "error"; pasos[3]!.error = !rConf.ok ? `POST confirmar ${rConf.status}: ${(rConf.cuerpo as any)?.error ?? "sin detalle"}` : "Egreso espejo no materializado en BD"
      } else {
        // Espejo store: misma liquidación (trabajador del relato store) + egreso, para CT-4 y validación.
        const espejoLiq: any = { ...(conf as any), trabajadorPersonaId: "test-p-99", adelantosIds: [] }
        delete espejoLiq.comunidadId
        const espejoEgr: any = { ...((rEgr!.cuerpo as any) ?? {}), id: egrRef, fondoId: "fondo-gc" }
        delete espejoEgr.comunidadId
        useCompassStore.setState(st => ({
          liquidacionesPL: ((st.liquidacionesPL as any[]).some(l => l.id === liqId)
            ? (st.liquidacionesPL as any[]).map(l => l.id === liqId ? espejoLiq : l)
            : [...(st.liquidacionesPL as any[]), espejoLiq]) as typeof st.liquidacionesPL,
          egresosFI: ((st.egresosFI as any[]).some(e => e.id === egrRef)
            ? st.egresosFI
            : [...(st.egresosFI as any[]), espejoEgr]) as typeof st.egresosFI,
        }))
        pasos[3]!.estado = "ok"
      }
    } else if (pasos[2]!.estado !== "ok") {
      pasos[3]!.estado = "error"; pasos[3]!.error = "Sin liquidación TEST (paso previo)"
    }
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "pl", label: TITULOS["pl"]!, rank: 6, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  const cargarFase15CT = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["ct"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    const unidadTest = "test-u-999"
    // 1) Residencia TEST sobre vínculo activo del depto TEST. Se usa el
    // propietario porque su vínculo no tiene fechaFin; el arrendatario TEST
    // tiene contrato a plazo y el store exige vínculo sin fechaFin (vigente).
    const r1 = s.generarCertificadoCT({ tipo: "residencia", personaId: "test-p-99", unidadId: unidadTest, solicitanteNombre: "TEST Persona QA Uno" })
    const certRes = useCompassStore.getState().certificadosCT.find(c => c.tipo === "residencia" && c.personaId === "test-p-99")
    if (!r1.ok || !certRes || !certRes.folio.startsWith("CT-") || !certRes.codigoVerificacion.startsWith("VC-")) {
      pasos[0]!.estado = "error"; pasos[0]!.error = r1.error ?? "Certificado residencia sin folio/código"
    } else pasos[0]!.estado = "ok"
    // 2) Al Día con deuda → rechazado citando saldo
    const tieneDeuda = s.cobrosFI.some(c => c.unidadId === unidadTest && c.fechaVencimiento && c.fechaVencimiento < new Date().toISOString().slice(0, 10))
    if (!tieneDeuda) {
      // Sin deuda previa el paso se valida como gate no disparado (unidad al día).
      pasos[1]!.estado = "ok"
    } else {
      const r2 = s.generarCertificadoCT({ tipo: "al_dia", unidadId: unidadTest, solicitanteNombre: "TEST QA" })
      if (r2.ok || !String(r2.error).includes("saldo")) { pasos[1]!.estado = "error"; pasos[1]!.error = r2.ok ? "El Al Día pasó con deuda" : String(r2.error) } else pasos[1]!.estado = "ok"
    }
    // 3) Pagar TODOS los cargos pendientes TEST (GC, multa IN, tarifas/penalizaciones
    // RA y garantía retenida) → Al Día emitido. El certificado exige saldo total <= 0
    // de la unidad; pagar solo gasto_comun deja cargos cross-módulo vivos y lo bloquea.
    const pendientesUnidad = s.cobrosFI.filter(c => c.unidadId === unidadTest)
    for (const c of pendientesUnidad) {
      const pendiente = c.montoBase + c.moras.reduce((a, m) => a + m.monto, 0) - c.pagos.reduce((a, p) => a + p.monto, 0)
      if (pendiente > 0) s.registrarPagoFI(c.id, { monto: pendiente, medio: "transferencia TEST" })
    }
    const r3 = s.generarCertificadoCT({ id: "test-ct-alday", tipo: "al_dia", unidadId: unidadTest, solicitanteNombre: "TEST QA" })
    if (!r3.ok) { pasos[2]!.estado = "error"; pasos[2]!.error = r3.error ?? "Al Día no emitido tras pagar" } else pasos[2]!.estado = "ok"
    // 4) Certificado de la liquidación confirmada PL + historial inmutable
    const liqConf = useCompassStore.getState().liquidacionesPL.find(l => l.estado === "confirmada")
    if (!liqConf) { pasos[3]!.estado = "error"; pasos[3]!.error = "Falta liquidación confirmada (ejecuta fase PL)" } else {
      const r4 = s.generarCertificadoCT({ id: "test-ct-liq", tipo: "liquidacion_sueldo", liquidacionId: liqConf.id, solicitanteNombre: "TEST QA" })
      const bloqueoHistorial = s.removeCertificadoCT(useCompassStore.getState().certificadosCT.find(c => !c.id.startsWith("test-"))?.id ?? "ct-nadie")
      if (!r4.ok || bloqueoHistorial.ok || !String(bloqueoHistorial.error).includes("inmutable")) {
        pasos[3]!.estado = "error"; pasos[3]!.error = r4.error ?? "El historial permitió eliminar un certificado real"
      } else pasos[3]!.estado = "ok"
    }
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "ct", label: TITULOS["ct"]!, rank: 6, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  const cargarFase15RE = React.useCallback(async (): Promise<ModReport> => {
    const s = useCompassStore.getState()
    const pasos: Paso[] = (PLAN["re"]! as string[]).map(desc => ({ desc, estado: "pendiente" as ModuleState }))
    // 1) Vista auditada
    s.registrarVistaDashboardRE("demografico")
    if (!useCompassStore.getState().eventos.some(e => e.tipoAccion === "RE_DASHBOARD_VIEW")) { pasos[0]!.estado = "error"; pasos[0]!.error = "Sin RE_DASHBOARD_VIEW" } else pasos[0]!.estado = "ok"
    // 2) Reporte segmentado Torre TEST × residentes × propietarios
    const rGen = s.generarReporteRE({
      titulo: "Boletín Sector TEST",
      bloques: ["gastos_mes", "morosidad"],
      segmento: { macroSectorIds: ["test-macro-sectortest"], tenencias: ["propietarios", "arrendatarios"] },
      id: "test-re-rep",
    })
    const rep = useCompassStore.getState().reportesRE.find(r => r.id === "test-re-rep")
    if (!rGen.ok || !rep || rep.bloques.length !== 2 || rep.payloadSnapshot.every(b => b.lineas.length === 0)) {
      pasos[1]!.estado = "error"; pasos[1]!.error = rGen.error ?? "Snapshot vacío"
    } else pasos[1]!.estado = "ok"
    // 3) Distribución → destinatarios vigentes + notificaciones
    const antesNotif = useCompassStore.getState().notificaciones.filter(n => n.moduloOrigen === "RE").length
    const rDist = rep ? s.distribuirReporteRE(rep.id) : { ok: false, error: "sin reporte" }
    const repDist = useCompassStore.getState().reportesRE.find(r => r.id === "test-re-rep")
    const notifNuevas = useCompassStore.getState().notificaciones.filter(n => n.moduloOrigen === "RE").length - antesNotif
    if (!rDist.ok || !repDist || repDist.distribuidoA === 0 || notifNuevas !== repDist.distribuidoA) {
      pasos[2]!.estado = "error"; pasos[2]!.error = rDist.ok ? `Alcance/notificación ${repDist?.distribuidoA}/${notifNuevas}` : rDist.error
    } else pasos[2]!.estado = "ok"
    // 4) Idempotencia + tasa huérfanos 0
    const dup = s.distribuirReporteRE("test-re-rep")
    const microTestOk = s.microSectores.some(m => m.id === "test-micro-piso99")
    const dangling = microTestOk ? 0 : 1
    if (dup.ok || dangling > 0) { pasos[3]!.estado = "error"; pasos[3]!.error = dup.ok ? "Segunda distribución pasó" : "Inconsistencia EF TEST" } else pasos[3]!.estado = "ok"
    const errores = pasos.filter(p => p.estado === "error").map(p => p.error || p.desc)
    return { id: "re", label: TITULOS["re"]!, rank: 99, status: errores.length ? "error" : "ok", count: 1, errores, pasos }
  }, [])

  const buildHistoria = React.useCallback((mods: ModReport[]): SeedReport["historia"] => {    return HISTORIA.map(h => ({ capitulo: h.capitulo, estado: (() => {
      const rankMods = mods.filter(m => m.rank === h.rank)
      if (rankMods.length === 0) return "pendiente" as ModuleState
      if (rankMods.some(m => m.status === "error")) return "error" as ModuleState
      if (rankMods.every(m => m.status === "ok")) return "ok" as ModuleState
      return "pendiente" as ModuleState
    })(), rank: h.rank }))
  }, [])

  const runFase = React.useCallback(async (fase: string) => {
    if (!ensureHydrated()) return
    // Guard idempotente: si hay datos TEST-* ofrece confirmación "Limpiar y poblar de una vez".
    // P4: cubre ambos mundos (store + BD vía API); las confirmadas inmutables no bloquean por diseño.
    const estadoStore = useCompassStore.getState() as unknown as Record<string, unknown>
    const bd = await resumenTestBD()
    if (tieneDatosTest(estadoStore) || (bd.ok && tieneDatosTest(estadoStore, bd.resumen))) {
      setPendingFase(fase)
      setConfirmOpen(true)
      return
    }
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
      if (fase === "5" || fase === "todo") {
        if (fase === "5") {
          mods.push(await cargarFase0())
          mods.push(await cargarFase1TU())
          mods.push(await cargarFase1MP())
          mods.push(await cargarFase2Macro())
          mods.push(await cargarFase2Micro())
          mods.push(await cargarFase2Unidad())
          mods.push(await cargarFase3VU())
        }
        mods.push(await cargarFase5AD())
      }
      if (fase === "6" || fase === "todo") {
        if (fase === "6") {
          mods.push(await cargarFase0())
          mods.push(await cargarFase1TU())
          mods.push(await cargarFase1MP())
          mods.push(await cargarFase2Macro())
          mods.push(await cargarFase2Micro())
          mods.push(await cargarFase2Unidad())
          mods.push(await cargarFase3VU())
        }
        mods.push(await cargarFase6GD())
      }
      if (fase === "7" || fase === "todo") {
        if (fase === "7") {
          mods.push(await cargarFase0())
          mods.push(await cargarFase1TU())
          mods.push(await cargarFase1MP())
          mods.push(await cargarFase2Macro())
          mods.push(await cargarFase2Micro())
          mods.push(await cargarFase2Unidad())
          mods.push(await cargarFase3VU())
        }
        mods.push(await cargarFase7CO())
      }
      if (fase === "8") {
        mods.push(await cargarFase0())
        mods.push(await cargarFase1TU())
        mods.push(await cargarFase1MP())
        mods.push(await cargarFase2Macro())
        mods.push(await cargarFase2Micro())
        mods.push(await cargarFase2Unidad())
        mods.push(await cargarFase3VU())
        mods.push(await cargarFase7CO())
        mods.push(await cargarFase8GE())
      }
      if (fase === "9") {
        mods.push(await cargarFase0())
        mods.push(await cargarFase1TU())
        mods.push(await cargarFase1MP())
        mods.push(await cargarFase2Macro())
        mods.push(await cargarFase2Micro())
        mods.push(await cargarFase2Unidad())
        mods.push(await cargarFase3VU())
        mods.push(await cargarFase9IR())
      }
      if (fase === "10") {
        mods.push(await cargarFase0())
        mods.push(await cargarFase1TU())
        mods.push(await cargarFase1MP())
        mods.push(await cargarFase2Macro())
        mods.push(await cargarFase2Micro())
        mods.push(await cargarFase2Unidad())
        mods.push(await cargarFase3VU())
        mods.push(await cargarFase7CO())
        mods.push(await cargarFase10IN())
      }
      if (fase === "11") {
        mods.push(await cargarFase0())
        mods.push(await cargarFase1TU())
        mods.push(await cargarFase1MP())
        mods.push(await cargarFase2Macro())
        mods.push(await cargarFase2Micro())
        mods.push(await cargarFase2Unidad())
        mods.push(await cargarFase3VU())
        mods.push(await cargarFase11MT())
      }
      if (fase === "12") {
        mods.push(await cargarFase0())
        mods.push(await cargarFase1TU())
        mods.push(await cargarFase1MP())
        mods.push(await cargarFase2Macro())
        mods.push(await cargarFase2Micro())
        mods.push(await cargarFase2Unidad())
        mods.push(await cargarFase3VU())
        mods.push(await cargarFase6GD())
        mods.push(await cargarFase12RA())
        mods.push(await cargarFase12CV())
      }
      if (fase === "13") {
        mods.push(await cargarFase0())
        mods.push(await cargarFase1TU())
        mods.push(await cargarFase1MP())
        mods.push(await cargarFase2Macro())
        mods.push(await cargarFase2Micro())
        mods.push(await cargarFase2Unidad())
        mods.push(await cargarFase3VU())
        mods.push(await cargarFase7CO())
        mods.push(await cargarFase6GD())
        mods.push(await cargarFase10IN())
        mods.push(await cargarFase11MT())
        mods.push(await cargarFase12RA())
        mods.push(await cargarFase13FI())
      }
      if (fase === "14") {
        mods.push(await cargarFase0())
        mods.push(await cargarFase1TU())
        mods.push(await cargarFase1MP())
        mods.push(await cargarFase2Macro())
        mods.push(await cargarFase2Micro())
        mods.push(await cargarFase2Unidad())
        mods.push(await cargarFase3VU())
        mods.push(await cargarFase14PE())
      }
      if (fase === "15") {
        mods.push(await cargarFase0())
        mods.push(await cargarFase1TU())
        mods.push(await cargarFase1MP())
        mods.push(await cargarFase2Macro())
        mods.push(await cargarFase2Micro())
        mods.push(await cargarFase2Unidad())
        mods.push(await cargarFase3VU())
        mods.push(await cargarFase14PE())
        mods.push(await cargarFase15PL())
        mods.push(await cargarFase15CT())
        mods.push(await cargarFase15RE())
      }
      if (fase === "todo") {
        mods.push(await cargarFase8GE())
        mods.push(await cargarFase9IR())
        mods.push(await cargarFase10IN())
        mods.push(await cargarFase11MT())
        mods.push(await cargarFase12RA())
        mods.push(await cargarFase12CV())
        mods.push(await cargarFase13FI())
        mods.push(await cargarFase14PE())
        mods.push(await cargarFase15PL())
        mods.push(await cargarFase15CT())
        mods.push(await cargarFase15RE())
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
  }, [cargarFase0, cargarFase1MP, cargarFase1TU, cargarFase2Macro, cargarFase2Micro, cargarFase2Unidad, cargarFase3VU, cargarFase4PI, cargarFase5AD, cargarFase6GD, cargarFase7CO, cargarFase8GE, cargarFase9IR, cargarFase10IN, cargarFase11MT, cargarFase12RA, cargarFase12CV, cargarFase13FI, cargarFase14PE, cargarFase15PL, cargarFase15CT, cargarFase15RE, buildHistoria, ensureHydrated])

  const limpiar = React.useCallback(async () => {
    if (!ensureHydrated()) return
    setLoading(true)
    const errores: string[] = []
    const s = useCompassStore.getState()
    const idsEgresosPLTest = obtenerIdsEgresosPLTest(s as unknown as Record<string, unknown>)
    // FI: libro de cobros TEST (unidadId u origenRef test-*), emisiones sobre TEST, egresos (incl. aleatorios de PL) y fondos TEST se purgan primero.
    useCompassStore.setState(st => ({
      cobrosFI: st.cobrosFI.filter(c => !esCobroTest(c as unknown as { id: string; unidadId: string; origenRef?: string })),
      emisionesGC: st.emisionesGC.filter(e => !e.lineas.some(l => l.unidadId.startsWith("test-"))),
      egresosFI: st.egresosFI.filter(e => !e.id.startsWith("test-") && !idsEgresosPLTest.has(e.id)),
      fondosFI: st.fondosFI.filter(f => !f.id.startsWith("test-")),
      notificaciones: (st.notificaciones as unknown as Parameters<typeof isTestNotificacion>[0][]).filter(n => !isTestNotificacion(n as unknown as Parameters<typeof isTestNotificacion>[0])) as unknown as typeof st.notificaciones,
    }))
    // PE: colecciones operacionales TEST se purgan antes de personas y unidades; los cierres de turno con id aleatorio se filtran por trabajador TEST.
    useCompassStore.setState(st => ({
      bitacoraVisitasPE: st.bitacoraVisitasPE.filter(v => !v.id.startsWith("test-")),
      encomiendasPE: st.encomiendasPE.filter(e => !e.id.startsWith("test-")),
      ingresosContratistasPE: st.ingresosContratistasPE.filter(i => !i.id.startsWith("test-")),
      proveedoresPE: st.proveedoresPE.filter(p => !p.id.startsWith("test-")),
      mantencionesPreventivasPE: st.mantencionesPreventivasPE.filter(m => !m.id.startsWith("test-")),
      visitasTecnicasPE: st.visitasTecnicasPE.filter(v => !v.id.startsWith("test-")),
      cierresTurnoPE: st.cierresTurnoPE.filter(c => !c.trabajadorPersonaId.startsWith("test-") && !c.id.startsWith("test-")),
      proyeccionesPE: st.proyeccionesPE.filter(p => !p.id.startsWith("test-")),
      notificaciones: (st.notificaciones as unknown as Parameters<typeof isTestNotificacion>[0][]).filter(n => !isTestNotificacion(n as unknown as Parameters<typeof isTestNotificacion>[0])) as unknown as typeof st.notificaciones,
    }))
    // Feriado TEST del calendario de proyección.
    useCompassStore.setState(st => ({
      maestros: { ...st.maestros, feriados: st.maestros.feriados.filter(f => !f.id.startsWith("test-")) },
    }))
    // PL/CT/RE: colecciones transaccionales TEST se purgan en orden inverso RE → CT → PL; config CF ownership-scoped.
    useCompassStore.setState(st => {
      const cfg = st.configuracion as unknown as Record<string, unknown>
      const limpia = getConfiguracionLimpiaOwnershipScoped(cfg)
      return {
        configuracion: limpia as unknown as typeof st.configuracion,
        notificaciones: (st.notificaciones as unknown as Parameters<typeof isTestNotificacion>[0][]).filter(n => !isTestNotificacion(n as unknown as Parameters<typeof isTestNotificacion>[0])) as unknown as typeof st.notificaciones,
      }
    })
    useCompassStore.setState(st => ({
      reportesRE: st.reportesRE.filter(r => !r.id.startsWith("test-")),
      certificadosCT: (st.certificadosCT as unknown as Parameters<typeof esCertificadoTest>[0][]).filter(c => !esCertificadoTest(c as unknown as Parameters<typeof esCertificadoTest>[0])) as unknown as typeof st.certificadosCT,
      liquidacionesPL: st.liquidacionesPL.filter(l => !l.id.startsWith("test-")),
      adelantosPL: st.adelantosPL.filter(a => !a.id.startsWith("test-")),
    }))
    // Eventos AM de entidades TEST (referenciaId test-*) se purgan para evitar huérfanos post-limpieza.
    useCompassStore.setState(st => ({
      eventos: st.eventos.filter(e => !(e.referenciaId && String(e.referenciaId).startsWith("test-"))),
    }))
    // inverso MT -> IN -> IR -> GE -> CO -> GD -> AD -> PI -> VU -> EF unidades -> EF micro -> EF macro -> MP -> TU -> MA
    // MT
    useCompassStore.setState(st => ({ proyectosMT: st.proyectosMT.filter(p => p.id !== "test-py-techos") }))
    const rMt2 = s.removeTrabajoMT("test-mt-2")
    if (!rMt2.ok) errores.push(rMt2.error || "mt-2")
    // El preventivo generado automáticamente hereda el título TEST del padre.
    useCompassStore.setState(st => ({
      trabajosMT: st.trabajosMT.filter(t => !t.titulo.includes("TEST")),
    }))
    // CV (antes de remover el acta GD): purga avisos TEST, los nacidos del acta TEST y los activados desde plantilla en la fase; el maestro sembrado se conserva.
    useCompassStore.setState(st => ({
      avisosCV: st.avisosCV.filter(a =>
        !a.id.startsWith("test-") && !(a.actaId && String(a.actaId).startsWith("test-")) && a.plantillaId !== "plant-cv-porton"
      ),
    }))
    // RA: reservas y elementos TEST se purgan directo (removeElementoRA exige reservas canceladas; el filtro inverso no depende de estados).
    useCompassStore.setState(st => ({
      reservasRA: st.reservasRA.filter(r => !r.id.startsWith("test-ra-")),
      elementosRA: st.elementosRA.filter(e => !e.id.startsWith("test-ra-")),
      notificaciones: (st.notificaciones as unknown as Parameters<typeof isTestNotificacion>[0][]).filter(n => !isTestNotificacion(n as unknown as Parameters<typeof isTestNotificacion>[0])) as unknown as typeof st.notificaciones,
    }))
    // IN
    const rIn1 = s.removeInfraccionIN("test-in-leve")
    if (!rIn1.ok) errores.push(rIn1.error || "in-leve")
    const rIn2 = s.removeInfraccionIN("test-in-grave")
    if (!rIn2.ok) errores.push(rIn2.error || "in-grave")
    const rTipoIn = s.removeTipoInfraccionIN("test-tipo-in")
    if (!rTipoIn.ok) errores.push(rTipoIn.error || "tipo-in")
    // IR
    useCompassStore.setState(st => ({
      solicitudesInsumoIR: st.solicitudesInsumoIR.filter(x => !x.id.startsWith("test-")),
      entregasEPP: st.entregasEPP.filter(e => !e.id.startsWith("test-")),
    }))
    const rDev = s.devolverAccesoIR("test-ir-llave999")
    if (!rDev.ok && s.activosIR.some(x => x.id === "test-ir-llave999")) errores.push(rDev.error || "dev-llave")
    for (const id of ["test-ir-cloro", "test-ir-casco", "test-ir-llave999", "test-ir-hidro"]) {
      const r = s.removeRecursoIR(id)
      if (!r.ok && s.activosIR.some(x => x.id === id)) errores.push(r.error || id)
    }
    useCompassStore.setState(st => ({
      activosIR: st.activosIR.filter(a => a.nombre !== "Escobillón industrial TEST"),
      notificaciones: (st.notificaciones as unknown as Parameters<typeof isTestNotificacion>[0][]).filter(n => !isTestNotificacion(n as unknown as Parameters<typeof isTestNotificacion>[0])) as unknown as typeof st.notificaciones,
    }))
    const rSol1 = s.removeSolicitudGE("test-sol-ge-1")
    if (!rSol1.ok) errores.push(rSol1.error || "sol-ge-1")
    const rSol2 = s.removeSolicitudGE("test-sol-ge-2")
    if (!rSol2.ok) errores.push(rSol2.error || "sol-ge-2")
    const rBuz = s.removeMensajeBuzonCO("test-buz-co-1")
    if (!rBuz.ok) errores.push(rBuz.error || "buz-co")
    const rDoc = s.removeDocumentoCO("test-doc-co")
    if (!rDoc.ok) errores.push(rDoc.error || "doc-co")
    // CO no define removeEnvioCO (el snapshot es histórico); se purga por filtro.
    useCompassStore.setState(st => ({
      enviosCO: st.enviosCO.filter(e => e.id !== "test-env-co-1"),
      notificaciones: (st.notificaciones as unknown as Parameters<typeof isTestNotificacion>[0][]).filter(n => !isTestNotificacion(n as unknown as Parameters<typeof isTestNotificacion>[0])) as unknown as typeof st.notificaciones,
    }))
    const rPlant = s.removePlantillaCO("test-plant-co")
    if (!rPlant.ok) errores.push(rPlant.error || "plant-co")
    const rActa = s.removeActaGD("test-acta-gd")
    if (!rActa.ok) errores.push(rActa.error || "acta")
    useCompassStore.setState(st => ({ notificaciones: (st.notificaciones as unknown as Parameters<typeof isTestNotificacion>[0][]).filter(n => !isTestNotificacion(n as unknown as Parameters<typeof isTestNotificacion>[0])) as unknown as typeof st.notificaciones }))
    const rCtrl = s.removeControlPropiedad("test-ctrl-e999")
    if (!rCtrl.ok) errores.push(rCtrl.error || "ctrl")
    // PI no define removeLeadPortal (los leads son histórico); se purgan por filtro.
    // P4: el store PI ya no se puebla (la fase escribe BD vía API); el remove es
    // idempotente (ausente = limpio) y la purga BD va al final del limpiar().
    useCompassStore.setState(st => ({
      leadsPortal: st.leadsPortal.filter(l => l.id !== "test-lead-pi-1"),
      notificaciones: (st.notificaciones as unknown as Parameters<typeof isTestNotificacion>[0][]).filter(n => !isTestNotificacion(n as unknown as Parameters<typeof isTestNotificacion>[0])) as unknown as typeof st.notificaciones,
    }))
    const rPub = s.removePublicacionPortal("test-pub-pi-e999")
    if (!rPub.ok && s.publicacionesPortal.some(p => p.id === "test-pub-pi-e999")) errores.push(rPub.error || "pub")
    // Limpieza idempotente: un TEST-* ya ausente cuenta como limpio; solo se
    // reporta bloqueo si la entidad existe y el remove la rechaza (p. ej. FK
    // inversa). Regresión 2026-09-14 (5e9b689): removeVinculo devuelve !ok
    // cuando el id no existe. Mismo patrón del bloque IR de este limpiar().
    for (const id of ["test-v-arr-999", "test-v-prop-e999", "test-v-prop-999"]) {
      const r = s.removeVinculo(id)
      if (!r.ok && s.vinculos.some(v => v.id === id)) errores.push(r.error || id)
    }
    for (const id of ["test-u-e-999", "test-u-999"]) {
      const r = s.removeUnidad(id)
      if (!r.ok && s.unidades.some(u => u.id === id)) errores.push(r.error || id)
    }
    for (const id of ["test-est-sup-qa", "test-micro-piso99"]) {
      const r = s.removeMicroSector(id)
      if (!r.ok && s.microSectores.some(m => m.id === id)) errores.push(r.error || id)
    }
    for (const id of ["test-macro-sectortest"]) {
      const r = s.removeMacroSector(id)
      if (!r.ok && s.macroSectores.some(m => m.id === id)) errores.push(r.error || id)
    }
    for (const id of ["test-p-99", "test-p-88"]) {
      const r = s.removePersona(id)
      if (!r.ok && s.personas.some(p => p.id === id)) errores.push(r.error || id)
    }
    for (const id of ["test-tu-loftqa"]) {
      const r = s.removeTipoUnidad(id)
      if (!r.ok && s.tiposUnidad.some(t => t.id === id)) errores.push(r.error || id)
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
      if (!r.ok && (s.maestros[k] as { id: string }[]).some(m => m.id === id)) errores.push(r.error || `${String(k)}:${id}`)
    }
    // Purga final de eventos TEST huérfanos generados por los remove* (VU genera VU_ASSIGN_RELEASED/DELETE con id test-*)
    useCompassStore.setState(st => ({
      eventos: st.eventos.filter(e => !(e.referenciaId && String(e.referenciaId).startsWith("test-"))),
    }))
    // P4 SERIE-GATED-API-BD: purga BD vía API (fases PI/PL poblan BD). Orden
    // hijos→padres por el guard 409. Best-effort idempotente: ausente = limpio;
    // solo bloquea si la entidad existe y el DELETE la rechaza. La confirmada
    // QA es inmutable por diseño y se salta (residuo honesto con periodo
    // rotativo que no colisiona; `e2e:higiene` la purga en cada reseed).
    const borrarSiExiste = async (path: string, etiqueta: string) => {
      try {
        const r = await fetch(path, { method: "DELETE" })
        if (r.ok || r.status === 404) return
        const v = await fetch(path).catch(() => null)
        if (v?.ok) errores.push(`${etiqueta}: DELETE ${r.status}`)
      } catch (e) { errores.push(`${etiqueta}: ${String(e)}`) }
    }
    try {
      await borrarSiExiste(`/api/leads-portal/${QA_PI_LEAD_ID}`, "lead-qa")
      await borrarSiExiste(`/api/publicaciones-portal/${QA_PI_PUB_ID}`, "pub-qa")
      // Notificaciones PI TEST generadas por el lead (cuerpo con marca TEST).
      const notifs = await listaQA("/api/notificaciones")
      for (const n of notifs.filter(n => n.moduloOrigen === "PI" && /TEST/.test(`${n.asunto ?? ""} ${n.cuerpo ?? ""}`))) {
        await borrarSiExiste(`/api/notificaciones/${n.id}`, "notif-pi-qa")
      }
      // Liquidaciones QA: borradores se eliminan; confirmadas se saltan (inmutables).
      const liqsQA = (await listaQA("/api/liquidaciones")).filter(l => l.trabajadorPersonaId === QA_PL_TRAB_ID || (typeof l.id === "string" && l.id.startsWith("test-liq-pl-qa-")))
      for (const l of liqsQA.filter(l => l.estado === "borrador")) {
        await borrarSiExiste(`/api/liquidaciones/${l.id}`, "liq-borrador-qa")
      }
      // Egresos espejo QA (de borradores y confirmadas): eliminables vía API.
      for (const l of liqsQA) {
        if (typeof l.egresoFIReferencia === "string" && l.egresoFIReferencia.startsWith("egr-")) {
          await borrarSiExiste(`/api/egresos-fi/${l.egresoFIReferencia}`, "egreso-espejo-qa")
        }
      }
      await borrarSiExiste(`/api/personas/${QA_PL_TRAB_ID}`, "persona-qa-pl")
    } catch (e) { errores.push(`purga BD: ${String(e)}`) }
    setLoading(false)
    if (errores.length) setMsg({ type: "error", text: `Limpieza con ${errores.length} bloqueos (dependencias): ${errores.slice(0,2).join("; ")}` })
    else {
      setMsg({ type: "ok", text: "TEST-* limpio correctamente" })
      setReport(null)
      setUltimaFase(null)
    }
  }, [ensureHydrated])

  const handleConfirmPoblar = React.useCallback(async () => {
    const fase = pendingFase ?? "todo"
    setConfirmOpen(false)
    setPendingFase(null)
    await limpiar()
    await runFase(fase)
  }, [pendingFase, limpiar, runFase])

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
    const s = useCompassStore.getState() as unknown as Record<string, unknown>
    const resultado = validarEstadoCompleto(s)
    const tasa = resultado.total === 0 ? 0 : resultado.total / (Number(((s as unknown as { unidades: unknown[] }).unidades.length)) + Number(((s as unknown as { vinculos: unknown[] }).vinculos.length)) || 1)
    if (resultado.total === 0) setMsg({ type: "ok", text: formatearMensajeValidacion(resultado) })
    else {
      const base = formatearMensajeValidacion(resultado)
      const tasaStr = (tasa * 100).toFixed(1)
      setMsg({ type: "error", text: `${base} — tasa ${tasaStr}%` })
    }
    if (report) setReport({ ...report, erroresGlobales: resultado.errores, ok: resultado.total === 0 })
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
          <Button
            variant="outline"
            disabled={loading}
            onClick={async () => {
              setLoading(true)
              setMsg(null)
              try {
                const res = await fetch("/api/admin/seed-authz", { method: "POST" })
                const data = await res.json()
                if (res.ok) setMsg({ type: "ok", text: `Seed AU B3 OK: ${data.counts.membresias} membresías en ${data.counts.comunidades} comunidades (admin@test.cl en A+B, resto en A)` })
                else setMsg({ type: "error", text: data.error ?? "Error seed AU" })
              } catch (e) { setMsg({ type: "error", text: String(e) }) }
              finally { setLoading(false) }
            }}
            className="border-violet-300 text-violet-700 hover:bg-violet-50"
          >
            👥 Crear usuarios TEST (2 comunidades, B3)
          </Button>
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
              { fase: "5", label: "6. Panel AD con controles" },
              { fase: "6", label: "7. Acta GD firmada y publicada" },
              { fase: "7", label: "8. CO — masivo, buzón y biblioteca" },
              { fase: "8", label: "9. GE — tickets con workflow y SLA" },
              { fase: "9", label: "10. IR — catálogo, stock crítico y EPP" },
              { fase: "10", label: "11. IN — faltas, apelaciones y directiva" },
              { fase: "11", label: "12. MT — preventivos y proyectos" },
              { fase: "12", label: "13. RA+CV — reservas, avisos y visor" },
              { fase: "13", label: "14. FI — fondos, emisión GC y morosidad" },
              { fase: "14", label: "15. PE — fichas, bitácora y cierre de turno" },
              { fase: "15", label: "16. PL+CT+RE — remuneraciones, certificados y reportería" },
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
              <CardDescription className="text-xs">Hoy el QA solo muestra pruebas reales (`17/28` specs formalizados `60.7%`). Aquí ves el estimado de las `11` tentativas en `Data/NSGC/docs/especificaciones/` aún no en `openspec/specs/`.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border bg-white dark:bg-card p-2">
                  <p className="text-xs text-muted-foreground">Real</p>
                  <p className="text-lg font-bold text-emerald-600">17 <span className="text-xs font-normal text-muted-foreground">/28</span></p>
                  <p className="text-[11px] text-muted-foreground">60.7% formalizado · 1119L spec</p>
                  <p className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">14 módulos QA (ma,tu,mp,ef×3,vu,pi,ad,gd,co,ge,ir,in,mt,ra,cv)</p>
                </div>
                <div className="rounded-lg border border-dashed bg-muted/20 p-2">
                  <p className="text-xs text-muted-foreground">Tentativo</p>
                  <p className="text-lg font-bold">11 <span className="text-xs font-normal text-muted-foreground">/28</span></p>
                  <p className="text-[11px] text-muted-foreground">39.3% pendiente · 639L tentativas</p>
                  <p className="text-[10px] font-mono text-muted-foreground">estimado +908L formalizados</p>
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

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Existen datos TEST-*</DialogTitle>
            <DialogDescription>Existen datos TEST-* — ¿Limpiar y poblar de una vez?</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Se borrarán los datos de prueba actuales y se poblará la comunidad completa (22 fases). Esta acción es idempotente.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmOpen(false); setPendingFase(null) }}>Cancelar</Button>
            <Button onClick={handleConfirmPoblar} className="bg-emerald-600 hover:bg-emerald-700">Limpiar y poblar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="sm:max-w-2xl">
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
