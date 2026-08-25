// Esquemas Zod de las entidades del dominio (fuente única de contratos de datos).
// Los tipos se derivan con z.infer y son estructuralmente compatibles con las
// interfaces declaradas en apps/web/data/. El store los usa para validar toda
// escritura antes de persistir (spec ST - Capa de Datos Persistente).

import { z } from "zod"
import { validarDocumentoIdentidad } from "./rut"

// --- Helpers ---

export const IdEntidadSchema = z
  .string({ required_error: "El identificador es obligatorio." })
  .min(1, "El identificador es obligatorio.")

export const FechaISOSchema = z
  .string({ required_error: "La fecha es obligatoria." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Debe ser una fecha con formato AAAA-MM-DD.")

// --- Inventario: Tipos de Unidad (TU) ---

export const TarifaHistoricaSchema = z.object({
  id: IdEntidadSchema,
  monto: z.number({ required_error: "El monto es obligatorio." }).min(0, "El monto no puede ser negativo."),
  fechaVigencia: FechaISOSchema,
  creadoEn: FechaISOSchema,
})

export const TipoUnidadSchema = z.object({
  id: IdEntidadSchema,
  nombre: z.string({ required_error: "El nombre es obligatorio." }).min(1, "El nombre es obligatorio."),
  categoria: z.string({ required_error: "La categoría es obligatoria." }).min(1, "La categoría es obligatoria."),
  metraje: z.number({ required_error: "El metraje es obligatorio." }).min(0, "El metraje no puede ser negativo."),
  montoBaseGc: z.number({ required_error: "El monto base GC es obligatorio." }).min(0, "El monto base GC no puede ser negativo."),
  descripcion: z.string().optional(),
  activo: z.boolean({ required_error: "El estado activo es obligatorio." }),
  historialTarifas: z.array(TarifaHistoricaSchema),
})

export const MacroSectorSchema = z.object({
  id: IdEntidadSchema,
  nombre: z.string({ required_error: "El nombre es obligatorio." }).min(1, "El nombre es obligatorio."),
  etiqueta: z.string({ required_error: "La etiqueta es obligatoria." }).min(1, "La etiqueta es obligatoria."),
  descripcion: z.string().optional(),
})

export const MicroSectorSchema = z.object({
  id: IdEntidadSchema,
  macroSectorId: IdEntidadSchema,
  nombre: z.string({ required_error: "El nombre es obligatorio." }).min(1, "El nombre es obligatorio."),
  etiqueta: z.string({ required_error: "La etiqueta es obligatoria." }).min(1, "La etiqueta es obligatoria."),
})

const ServicioMedidorSchema = z.object({
  cliente: z.string(),
  medidor: z.string(),
})

export const ServiciosUnidadSchema = z.object({
  agua: ServicioMedidorSchema.optional(),
  luz: ServicioMedidorSchema.optional(),
  gas: ServicioMedidorSchema.optional(),
})

export const UnidadSchema = z.object({
  id: IdEntidadSchema,
  microSectorId: IdEntidadSchema,
  numero: z.string({ required_error: "El número de unidad es obligatorio." }).min(1, "El número de unidad es obligatorio."),
  etiqueta: z.string({ required_error: "La categoría de la unidad es obligatoria." }).min(1, "La categoría de la unidad es obligatoria."),
  tipoUnidadId: IdEntidadSchema,
  metraje: z.number({ required_error: "El metraje es obligatorio." }).min(0, "El metraje no puede ser negativo."),
  prorrateo: z.number({ required_error: "El prorrateo es obligatorio." }).min(0, "El prorrateo no puede ser negativo."),
  rolSii: z.string(),
  estadoId: IdEntidadSchema,
  servicios: ServiciosUnidadSchema.default({}),
})

// --- Comunidad: Vínculos (VU) y Personas (MP) ---

export const RolesVinculo = ["propietario", "arrendatario", "copropietario", "ocupante"] as const
export const RolVinculoSchema = z.enum(RolesVinculo)

export const VinculoUnidadSchema = z.object({
  id: IdEntidadSchema,
  personaId: IdEntidadSchema,
  unidadId: IdEntidadSchema,
  rol: RolVinculoSchema,
  fechaInicio: FechaISOSchema,
  fechaFin: FechaISOSchema.optional(),
  // Trigger Inmobiliario (PI): referencia a estadosInmobiliarios (MA)
  estadoOcupacionPropiedad: z.string().min(1).optional(),
  permiteVerFinanzas: z.boolean({ required_error: "El flag de privacidad financiera es obligatorio." }),
  // Cierre automático de tramo anterior (solo propietario/arrendatario)
  cerrarAnterior: z.boolean().optional(),
})

export const ExtensionLaboralSchema = z.object({
  id: IdEntidadSchema,
  cargo: z.string().min(1, "El cargo es obligatorio."),
  afp: z.string().min(1, "La AFP es obligatoria."),
  prevision: z.string().min(1, "La previsión es obligatoria."),
  fechaIngreso: FechaISOSchema,
})

export const ExtensionGobernanzaSchema = z.object({
  id: IdEntidadSchema,
  cargoDirectiva: z.enum(["presidente", "tesorero", "secretario", "director"]),
  firmaDigital: z.string().optional(),
  fechaAsuncion: FechaISOSchema,
})

export const ROLES_PERSONA = ["propietario", "residente", "personal", "directiva", "contratista"] as const

// --- Portal Inmobiliario (PI) ---

// D1 (media por referencia): solo metadatos + URL; jamás payload binario.
export const ImagenReferenciaSchema = z.object({
  nombre: z.string().min(1, "El nombre del archivo es obligatorio."),
  tipoMime: z.string().min(1, "El tipo MIME es obligatorio."),
  tamanoKB: z.number().min(0, "El tamaño no puede ser negativo."),
  url: z
    .string()
    .min(1, "La URL de la imagen es obligatoria.")
    .max(2048, "La URL excede el largo permitido.")
    .refine((valor) => !/^data:/i.test(valor) && !/^blob:/i.test(valor), {
      message: "Media por referencia: no se permiten data-URL ni Blob embebidos (D1).",
    }),
})

export const OperacionPortalSchema = z.enum(["venta", "arriendo"])

export const PublicacionPortalSchema = z.object({
  id: IdEntidadSchema,
  unidadId: IdEntidadSchema,
  operacion: OperacionPortalSchema,
  precio: z.number({ required_error: "El precio es obligatorio." }).min(0, "El precio no puede ser negativo."),
  moneda: z.enum(["CLP", "UF"]).optional(),
  dormitorios: z.number().int().min(0).optional(),
  banos: z.number().int().min(0).optional(),
  etiquetaEstado: z.string().optional(),
  descripcion: z.string().optional(),
  urlMapa: z.string().url("La URL del mapa no es válida.").or(z.literal("")).optional(),
  condicionesContractuales: z.string().optional(),
  imagenes: z.array(ImagenReferenciaSchema),
  activa: z.boolean({ required_error: "El estado activo es obligatorio." }),
  fechaPublicacion: FechaISOSchema,
})

export const LeadPortalSchema = z.object({
  id: IdEntidadSchema,
  publicacionId: IdEntidadSchema,
  nombreContacto: z.string().min(1, "El nombre de contacto es obligatorio."),
  contacto: z.string().min(1, "El contacto (teléfono o correo) es obligatorio."),
  mensaje: z.string().optional(),
  fecha: FechaISOSchema,
  atendido: z.boolean({ required_error: "El estado atendido es obligatorio." }),
})

// D3 (notificaciones simuladas): bandeja in-app con canal email_simulado.
export const NotificacionSchema = z.object({
  id: IdEntidadSchema,
  destinatarioRol: z.enum(["administracion", "propietario", "residente", "directiva", "personal"]),
  destinatarioPersonaId: z.string().optional(),
  asunto: z.string().min(1, "El asunto es obligatorio."),
  cuerpo: z.string().min(1, "El cuerpo es obligatorio."),
  canal: z.literal("email_simulado"),
  moduloOrigen: z.string().min(1),
  fecha: FechaISOSchema,
  leida: z.boolean(),
})

// --- Gestión Administrativa (AD) ---

// Controles de privacidad/comunicación del propietario sobre su unidad.
// Defaults al leer sin registro: {residenteVeMorosidad:false, residenteVeActas:false, alertasResidentesActivas:true}
export const ControlPropiedadSchema = z.object({
  id: IdEntidadSchema,
  unidadId: IdEntidadSchema,
  residenteVeMorosidad: z.boolean({ required_error: "El flag de morosidad visible es obligatorio." }),
  residenteVeActas: z.boolean({ required_error: "El flag de actas visibles es obligatorio." }),
  alertasResidentesActivas: z.boolean({ required_error: "El flag de alertas es obligatorio." }),
})

export const MensajeDocumentoInvalido = "RUT inválido (dígito verificador incorrecto) o pasaporte con formato no válido."

const DocumentoIdentidadSchema = z
  .string({ required_error: "El RUT o pasaporte es obligatorio." })
  .min(1, "El RUT o pasaporte es obligatorio.")
  .refine((valor) => validarDocumentoIdentidad(valor), { message: MensajeDocumentoInvalido })

export const PersonaSchema = z.object({
  id: IdEntidadSchema,
  rut: DocumentoIdentidadSchema,
  nombreCompleto: z.string({ required_error: "El nombre completo es obligatorio." }).min(1, "El nombre completo es obligatorio."),
  nombres: z.string({ required_error: "Los nombres son obligatorios." }).min(1, "Los nombres son obligatorios."),
  apellidos: z.string({ required_error: "Los apellidos son obligatorios." }).min(1, "Los apellidos son obligatorios."),
  email: z.string({ required_error: "El correo electrónico es obligatorio." }).email("El correo electrónico no es válido."),
  telefonoMovil: z.string({ required_error: "El teléfono móvil es obligatorio." }).min(1, "El teléfono móvil es obligatorio."),
  telefonoFijo: z.string().optional(),
  fotografiaUrl: z.string().optional(),
  estadoCuenta: z.enum(["activa", "inactiva", "bloqueada"], {
    required_error: "El estado de cuenta es obligatorio.",
    invalid_type_error: "Estado de cuenta inválido.",
  }),
  condicionesEspecialesIds: z.array(z.string()),
  roles: z.array(z.enum(ROLES_PERSONA)),
  vinculosUnidad: z.array(VinculoUnidadSchema).optional(),
  datosLaborales: ExtensionLaboralSchema.optional(),
  datosGobernanza: ExtensionGobernanzaSchema.optional(),
})

// --- Administración: Maestros (MA) ---

export const AfpSchema = z.object({
  id: IdEntidadSchema,
  nombre: z.string().min(1, "El nombre es obligatorio."),
  tasaCotizacion: z.number().min(0, "La tasa de cotización no puede ser negativa."),
})

export const PrevisionSaludSchema = z.object({
  id: IdEntidadSchema,
  nombre: z.string().min(1, "El nombre es obligatorio."),
  tipo: z.enum(["fonasa", "isapre"]),
})

export const NombreSimpleSchema = z.object({
  id: IdEntidadSchema,
  nombre: z.string().min(1, "El nombre es obligatorio."),
})

export const MutualCajaSchema = NombreSimpleSchema
export const BancoSchema = NombreSimpleSchema
export const CategoriaInsumoSchema = NombreSimpleSchema
export const CategoriaMacroSchema = NombreSimpleSchema
export const CategoriaMicroSchema = NombreSimpleSchema
export const CategoriaUnidadSchema = NombreSimpleSchema

export const FeriadoSchema = z.object({
  id: IdEntidadSchema,
  fecha: FechaISOSchema,
  nombre: z.string().min(1, "El nombre es obligatorio."),
  irrenunciable: z.boolean(),
})

export const IndiceAjusteSchema = z.object({
  id: IdEntidadSchema,
  nombre: z.string().min(1, "El nombre es obligatorio."),
  codigo: z.string().min(1, "El código es obligatorio."),
})

export const CajaFondoSchema = z.object({
  id: IdEntidadSchema,
  nombre: z.string().min(1, "El nombre es obligatorio."),
  tipo: z.enum(["gasto-comun", "reserva", "especial", "amenities"]),
})

export const UnidadMedidaSchema = z.object({
  id: IdEntidadSchema,
  nombre: z.string().min(1, "El nombre es obligatorio."),
  abreviatura: z.string().min(1, "La abreviatura es obligatoria."),
})

export const ContactoEmergenciaSchema = z.object({
  id: IdEntidadSchema,
  categoria: z.enum(["urgencia", "tecnico"]).optional(),
  nombre: z.string().min(1, "El nombre es obligatorio."),
  telefono: z.string().min(1, "El teléfono es obligatorio."),
  sitioWeb: z.string().optional(),
})

export const CondicionEspecialSchema = z.object({
  id: IdEntidadSchema,
  nombre: z.string().min(1, "El nombre es obligatorio."),
  color: z.string().min(1, "El color es obligatorio."),
})

export const EstadoOcupacionSchema = z.object({
  id: IdEntidadSchema,
  nombre: z.string().min(1, "El nombre es obligatorio."),
  color: z.string().min(1, "El color es obligatorio."),
  hex: z.string().optional(),
})

export const EstadoInmobiliarioSchema = z.object({
  id: IdEntidadSchema,
  nombre: z.string().min(1, "El nombre es obligatorio."),
  color: z.string().optional(),
})

export const MAESTRO_SCHEMAS = {
  afps: AfpSchema,
  previsionesSalud: PrevisionSaludSchema,
  mutualesCajas: MutualCajaSchema,
  feriados: FeriadoSchema,
  bancos: BancoSchema,
  indicesAjuste: IndiceAjusteSchema,
  cajasFondos: CajaFondoSchema,
  categoriasInsumos: CategoriaInsumoSchema,
  unidadesMedida: UnidadMedidaSchema,
  contactosEmergencia: ContactoEmergenciaSchema,
  condicionesEspeciales: CondicionEspecialSchema,
  estadosOcupacion: EstadoOcupacionSchema,
  categoriasMacro: CategoriaMacroSchema,
  categoriasMicro: CategoriaMicroSchema,
  categoriasUnidad: CategoriaUnidadSchema,
  estadosInmobiliarios: EstadoInmobiliarioSchema,
} as const

// --- Administración: Configuración Global (CF) ---

export const ModoCalculoGCSchema = z.enum(["fijo", "variable"])
export const SeguridadSMTPSchema = z.enum(["ssl", "tls", "none"])

export const ConfiguracionGlobalSchema = z.object({
  // 1. Identidad y Representación Legal
  nombreComunidad: z.string().min(1, "El nombre de la comunidad es obligatorio."),
  logoUrl: z.string().optional(),
  faviconUrl: z.string().optional(),
  rutCondominio: DocumentoIdentidadSchema,
  direccionOficial: z.string().min(1, "La dirección oficial es obligatoria."),
  administradorResponsable: z.string().min(1, "El administrador responsable es obligatorio."),
  rutAdministrador: DocumentoIdentidadSchema,
  telefonoAdmin: z.string().min(1, "El teléfono del administrador es obligatorio."),
  firmaDigitalizadaUrl: z.string().optional(),

  // 2. Parametrización del Gasto Común
  modoCalculoGC: ModoCalculoGCSchema,
  diaCortePago: z.number().int().min(1, "El día de corte debe estar entre 1 y 31.").max(31, "El día de corte debe estar entre 1 y 31."),
  limiteMesesAvisoCorte: z.number().int().min(1, "El límite de meses debe ser mayor a 0."),

  // 3. Configuración de Correo Electrónico (SMTP)
  smtpHost: z.string().min(1, "El servidor SMTP es obligatorio."),
  smtpPort: z.number().int().min(1, "El puerto SMTP es inválido.").max(65535, "El puerto SMTP es inválido."),
  smtpUser: z.string().min(1, "El usuario SMTP es obligatorio."),
  smtpPassword: z.string(),
  smtpSecurity: SeguridadSMTPSchema,
  smtpFrom: z.string().min(1, "El remitente SMTP es obligatorio."),
  smtpFromName: z.string().min(1, "El nombre del remitente es obligatorio."),
  smtpBcc: z.string().optional(),
  smtpRecepcion: z.string().optional(),

  // 4. Reglas y Opt-in de Módulos
  notificarEmisionGC: z.boolean(),
  notificarRegistroVisitas: z.boolean(),
  notificarEncomiendas: z.boolean(),
  notificarReservas: z.boolean(),
  notificarAvisosSistema: z.boolean(),
  notificarSugerenciasReclamos: z.boolean(),

  // 5. Parámetros Operativos y Seguridad
  diasMesComercial: z.number().int().min(1, "Los días mes comercial deben estar entre 1 y 31.").max(31, "Los días mes comercial deben estar entre 1 y 31."),
  diasVacacionesMes: z.number().positive("Los días de vacaciones deben ser mayores a 0."),
  jornadaSemanalEstandar: z.number().int().min(1, "La jornada semanal debe ser mayor a 0.").max(80, "La jornada semanal no puede superar 80 horas."),
  claveEliminacionMaestro: z.string(),

  // 6. Portal Inmobiliario (PI): opcional para compatibilidad con stores previos.
  // Ausente = modo "residentes" (por defecto, según spec PI).
  visibilidadPortalInmobiliario: z.enum(["residentes", "publica"]).optional(),
})

// --- Auditoría interna del store ---

export const EventoAuditoriaSchema = z.object({
  id: IdEntidadSchema,
  timestamp: z.string().min(1),
  usuario: z.string().min(1),
  categoria: z.string().min(1),
  tipoAccion: z.string().min(1),
  referenciaId: z.string().min(1),
  descripcion: z.string().min(1),
})

// --- Tipos derivados (z.infer): contratos únicos del dominio ---

export type TarifaHistorica = z.infer<typeof TarifaHistoricaSchema>
export type TipoUnidad = z.infer<typeof TipoUnidadSchema>
export type MacroSector = z.infer<typeof MacroSectorSchema>
export type MicroSector = z.infer<typeof MicroSectorSchema>
export type ServiciosUnidad = z.infer<typeof ServiciosUnidadSchema>
export type Unidad = z.infer<typeof UnidadSchema>
export type RolVinculo = z.infer<typeof RolVinculoSchema>
export type VinculoUnidad = z.infer<typeof VinculoUnidadSchema>
export type ExtensionLaboral = z.infer<typeof ExtensionLaboralSchema>
export type ExtensionGobernanza = z.infer<typeof ExtensionGobernanzaSchema>
export type Persona = z.infer<typeof PersonaSchema>
export type Afp = z.infer<typeof AfpSchema>
export type PrevisionSalud = z.infer<typeof PrevisionSaludSchema>
export type MutualCaja = z.infer<typeof MutualCajaSchema>
export type Feriado = z.infer<typeof FeriadoSchema>
export type Banco = z.infer<typeof BancoSchema>
export type IndiceAjuste = z.infer<typeof IndiceAjusteSchema>
export type CajaFondo = z.infer<typeof CajaFondoSchema>
export type CategoriaInsumo = z.infer<typeof CategoriaInsumoSchema>
export type UnidadMedida = z.infer<typeof UnidadMedidaSchema>
export type ContactoEmergencia = z.infer<typeof ContactoEmergenciaSchema>
export type CondicionEspecial = z.infer<typeof CondicionEspecialSchema>
export type EstadoOcupacion = z.infer<typeof EstadoOcupacionSchema>
export type EstadoInmobiliario = z.infer<typeof EstadoInmobiliarioSchema>
export type ModoCalculoGC = z.infer<typeof ModoCalculoGCSchema>
export type SeguridadSMTP = z.infer<typeof SeguridadSMTPSchema>
export type ConfiguracionGlobal = z.infer<typeof ConfiguracionGlobalSchema>
export type EventoAuditoria = z.infer<typeof EventoAuditoriaSchema>
export type ImagenReferencia = z.infer<typeof ImagenReferenciaSchema>
export type OperacionPortal = z.infer<typeof OperacionPortalSchema>
export type PublicacionPortal = z.infer<typeof PublicacionPortalSchema>
export type LeadPortal = z.infer<typeof LeadPortalSchema>
export type Notificacion = z.infer<typeof NotificacionSchema>
export type ControlPropiedad = z.infer<typeof ControlPropiedadSchema>

// --- Utilidades de validación para el store ---

export type ResultadoValidacion<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export function formatoErrorZod(error: z.ZodError): string {
  const detalles = error.issues.map(issue => {
    const campo = issue.path.join(".")
    return campo ? `${campo}: ${issue.message}` : issue.message
  })
  return `Datos inválidos: ${detalles.slice(0, 3).join("; ")}${detalles.length > 3 ? "…" : ""}`
}

export function validarConEsquema<S extends z.ZodTypeAny>(schema: S, input: unknown): ResultadoValidacion<z.infer<S>> {
  const resultado = schema.safeParse(input)
  if (resultado.success) return { ok: true, data: resultado.data }
  return { ok: false, error: formatoErrorZod(resultado.error) }
}

export function validarMaestro(key: string, item: unknown): ResultadoValidacion<unknown> {
  const schema = MAESTRO_SCHEMAS[key as keyof typeof MAESTRO_SCHEMAS]
  if (!schema) return { ok: false, error: `Maestro "${key}" no soportado.` }
  return validarConEsquema(schema, item)
}
