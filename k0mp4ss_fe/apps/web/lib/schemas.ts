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
  monto: z
    .number({ required_error: "El monto es obligatorio." })
    .min(0, "El monto no puede ser negativo."),
  fechaVigencia: FechaISOSchema,
  creadoEn: FechaISOSchema,
})

export const TipoUnidadSchema = z.object({
  id: IdEntidadSchema,
  nombre: z
    .string({ required_error: "El nombre es obligatorio." })
    .min(1, "El nombre es obligatorio."),
  categoria: z
    .string({ required_error: "La categoría es obligatoria." })
    .min(1, "La categoría es obligatoria."),
  metraje: z
    .number({ required_error: "El metraje es obligatorio." })
    .min(0, "El metraje no puede ser negativo."),
  montoBaseGc: z
    .number({ required_error: "El monto base GC es obligatorio." })
    .min(0, "El monto base GC no puede ser negativo."),
  descripcion: z.string().optional(),
  activo: z.boolean({ required_error: "El estado activo es obligatorio." }),
  historialTarifas: z.array(TarifaHistoricaSchema),
})

export const MacroSectorSchema = z.object({
  id: IdEntidadSchema,
  nombre: z
    .string({ required_error: "El nombre es obligatorio." })
    .min(1, "El nombre es obligatorio."),
  etiqueta: z
    .string({ required_error: "La etiqueta es obligatoria." })
    .min(1, "La etiqueta es obligatoria."),
  descripcion: z.string().optional(),
})

export const MicroSectorSchema = z.object({
  id: IdEntidadSchema,
  macroSectorId: IdEntidadSchema,
  nombre: z
    .string({ required_error: "El nombre es obligatorio." })
    .min(1, "El nombre es obligatorio."),
  etiqueta: z
    .string({ required_error: "La etiqueta es obligatoria." })
    .min(1, "La etiqueta es obligatoria."),
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
  numero: z
    .string({ required_error: "El número de unidad es obligatorio." })
    .min(1, "El número de unidad es obligatorio."),
  etiqueta: z
    .string({ required_error: "La categoría de la unidad es obligatoria." })
    .min(1, "La categoría de la unidad es obligatoria."),
  tipoUnidadId: IdEntidadSchema,
  metraje: z
    .number({ required_error: "El metraje es obligatorio." })
    .min(0, "El metraje no puede ser negativo."),
  prorrateo: z
    .number({ required_error: "El prorrateo es obligatorio." })
    .min(0, "El prorrateo no puede ser negativo."),
  rolSii: z.string(),
  estadoId: IdEntidadSchema,
  servicios: ServiciosUnidadSchema.default({}),
})

// --- Comunidad: Vínculos (VU) y Personas (MP) ---

export const RolesVinculo = [
  "propietario",
  "arrendatario",
  "copropietario",
  "ocupante",
] as const
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
  permiteVerFinanzas: z.boolean({
    required_error: "El flag de privacidad financiera es obligatorio.",
  }),
  // Cierre automático de tramo anterior (solo propietario/arrendatario)
  cerrarAnterior: z.boolean().optional(),
})

export const ExtensionLaboralSchema = z.object({
  id: IdEntidadSchema,
  cargo: z.string().min(1, "El cargo es obligatorio."),
  afp: z.string().min(1, "La AFP es obligatoria."),
  prevision: z.string().min(1, "La previsión es obligatoria."),
  fechaIngreso: FechaISOSchema,
  // PE (ventana 7): profundización opcional de la ficha integral. Los campos
  // mínimos de arriba se preservan para el cajón RRHH de AD; las FKs nuevas
  // apuntan por id a los maestros legales de MA (nunca texto libre).
  tipoContrato: z.enum(["indefinido", "plazo_fijo", "honorarios"]).optional(),
  afpId: IdEntidadSchema.optional(),
  saludId: IdEntidadSchema.optional(),
  asignacionFamiliarId: IdEntidadSchema.optional(),
  cargas: z.number().int().min(0).optional(),
  mutualidadId: IdEntidadSchema.optional(),
  bancoId: IdEntidadSchema.optional(),
  numeroCuenta: z.string().optional(),
  tipoCuenta: z.enum(["corriente", "vista", "ahorro"]).optional(),
  seguroComplementario: z.string().optional(),
  apv: z.boolean().optional(),
  fichaMedica: z
    .object({
      medicamentos: z.string().optional(),
      alergias: z.string().optional(),
      condiciones: z.string().optional(),
    })
    .optional(),
  contactosEmergencia: z
    .array(
      z.object({
        id: IdEntidadSchema,
        nombre: z
          .string({ required_error: "El nombre del contacto es obligatorio." })
          .min(1, "El nombre del contacto es obligatorio."),
        telefono: z
          .string({
            required_error: "El teléfono del contacto es obligatorio.",
          })
          .min(1, "El teléfono del contacto es obligatorio."),
        relacion: z.string().optional(),
      })
    )
    .optional(),
  jornadaBaseHoras: z
    .number({ invalid_type_error: "La jornada base debe ser un número." })
    .positive("La jornada base debe ser mayor a cero.")
    .max(80, "La jornada base no puede superar 80 horas.")
    .optional(),
  // PL (ventana 8): renta base contractual usada por el cálculo de liquidaciones.
  sueldoBase: z
    .number()
    .min(0, "El sueldo base no puede ser negativo.")
    .optional(),
  horasExtras: z
    .array(
      z.object({
        id: IdEntidadSchema,
        fecha: FechaISOSchema,
        horas: z
          .number({ invalid_type_error: "Las horas deben ser un número." })
          .positive("Las horas extra deben ser mayores a cero."),
        motivo: z
          .string({
            required_error: "El motivo de la hora extra es obligatorio.",
          })
          .min(1, "El motivo de la hora extra es obligatorio."),
      })
    )
    .optional(),
  evaluaciones: z
    .array(
      z.object({
        id: IdEntidadSchema,
        fecha: FechaISOSchema,
        puntaje: z
          .number()
          .min(1, "El puntaje va de 1 a 7.")
          .max(7, "El puntaje va de 1 a 7."),
        comentarios: z.string().optional(),
      })
    )
    .optional(),
})

export const ExtensionGobernanzaSchema = z
  .object({
    id: IdEntidadSchema,
    cargoDirectiva: z.enum([
      "presidente",
      "tesorero",
      "secretario",
      "director",
    ]),
    firmaDigital: z.string().optional(),
    fechaAsuncion: FechaISOSchema,
    // Período al que pertenece la ficha (GD-períodos). Ausente = legado pre-períodos (cuenta como vigente).
    periodoId: IdEntidadSchema.optional(),
    fechaTermino: FechaISOSchema.optional(),
    motivoTermino: z.enum(["renuncia", "remocion", "fin_periodo"]).optional(),
  })
  .refine(
    (e) =>
      !e.firmaDigital ||
      (!/^data:/i.test(e.firmaDigital) && !/^blob:/i.test(e.firmaDigital)),
    {
          message:
            "Media por referencia (D1): la firma debe ser una URL, no contenido embebido.",
          path: ["firmaDigital"],
        }
      )

    // GD-períodos: cada período archiva su nómina al cerrarse (libro: nunca se borra).
    export const PeriodoDirectivaSchema = z.object({
      id: IdEntidadSchema,
      fechaInicio: FechaISOSchema,
      // Lo fijado por la asamblea; art. 17 Ley 21.442: no excede 3 años.
      duracionMeses: z
        .number({ required_error: "La duración es obligatoria." })
        .int()
        .min(1, "La duración mínima es 1 mes.")
        .max(36, "El período no puede exceder 36 meses (art. 17 Ley 21.442)."),
      fechaFin: FechaISOSchema.optional(),
      fechaInscripcion: FechaISOSchema,
      referenciaInscripcion: z
        .string({ required_error: "La referencia de inscripción es obligatoria." })
        .min(1, "Indicá el acta, escritura o inscripción de respaldo.")
        .max(280, "La referencia excede el largo permitido."),
      // true = fechas estimadas pendientes de actualizar desde el libro físico.
      fechasEstimadas: z.boolean().optional(),
      estado: z.enum(["vigente", "cerrado"]),
      actaOrigenId: IdEntidadSchema.optional(),
      // Nómina congelada al cerrar (historia del libro).
      miembros: z.array(
        z.object({
          personaId: IdEntidadSchema,
          nombre: z.string().min(1),
          cargo: z.enum(["presidente", "tesorero", "secretario", "director"]),
          fechaAsuncion: FechaISOSchema,
          fechaTermino: FechaISOSchema.optional(),
          motivoTermino: z.enum(["renuncia", "remocion", "fin_periodo"]).optional(),
        })
      ),
    })

    export type PeriodoDirectiva = z.infer<typeof PeriodoDirectivaSchema>

export const ROLES_PERSONA = [
  "propietario",
  "residente",
  "personal",
  "directiva",
  "contratista",
] as const

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
      message:
        "Media por referencia: no se permiten data-URL ni Blob embebidos (D1).",
    }),
})

export const OperacionPortalSchema = z.enum(["venta", "arriendo"])

export const PublicacionPortalSchema = z.object({
  id: IdEntidadSchema,
  unidadId: IdEntidadSchema,
  operacion: OperacionPortalSchema,
  precio: z
    .number({ required_error: "El precio es obligatorio." })
    .min(0, "El precio no puede ser negativo."),
  moneda: z.enum(["CLP", "UF"]).optional(),
  dormitorios: z.number().int().min(0).optional(),
  banos: z.number().int().min(0).optional(),
  etiquetaEstado: z.string().optional(),
  descripcion: z.string().optional(),
  urlMapa: z
    .string()
    .url("La URL del mapa no es válida.")
    .or(z.literal(""))
    .optional(),
  condicionesContractuales: z.string().optional(),
  imagenes: z.array(ImagenReferenciaSchema),
  activa: z.boolean({ required_error: "El estado activo es obligatorio." }),
  fechaPublicacion: FechaISOSchema,
})

export const LeadPortalSchema = z.object({
  id: IdEntidadSchema,
  publicacionId: IdEntidadSchema,
  nombreContacto: z.string().min(1, "El nombre de contacto es obligatorio."),
  contacto: z
    .string()
    .min(1, "El contacto (teléfono o correo) es obligatorio."),
  mensaje: z.string().optional(),
  fecha: FechaISOSchema,
  atendido: z.boolean({ required_error: "El estado atendido es obligatorio." }),
})

// D3 (notificaciones simuladas): bandeja in-app con canal email_simulado.
export const NotificacionSchema = z.object({
  id: IdEntidadSchema,
  destinatarioRol: z.enum([
    "administracion",
    "propietario",
    "residente",
    "directiva",
    "personal",
  ]),
  destinatarioPersonaId: z.string().optional(),
  asunto: z.string().min(1, "El asunto es obligatorio."),
  cuerpo: z.string().min(1, "El cuerpo es obligatorio."),
  canal: z.literal("email_simulado"),
  moduloOrigen: z.string().min(1),
  fecha: FechaISOSchema,
  leida: z.boolean(),
})

// --- Comunicación con Vecinos (CO) ---

export const CATEGORIAS_PLANTILLA_CO = [
  "comunidad",
  "urgente",
  "cobranza",
  "informacion",
  "onboarding",
] as const
export const CategoriaPlantillaCOSchema = z.enum(CATEGORIAS_PLANTILLA_CO)

// Maestro de Mensajes Prefijados: cuerpo soporta variables dinámicas
// [Nombre_Usuario], [Nombre_Torre] y [Nombre_Comunidad] (se resuelven al enviar).
export const PlantillaCOSchema = z.object({
  id: IdEntidadSchema,
  nombre: z
    .string({ required_error: "El nombre de la plantilla es obligatorio." })
    .min(1, "El nombre de la plantilla es obligatorio."),
  categoria: CategoriaPlantillaCOSchema,
  asunto: z
    .string({ required_error: "El asunto es obligatorio." })
    .min(1, "El asunto es obligatorio."),
  cuerpo: z
    .string({ required_error: "El cuerpo es obligatorio." })
    .min(1, "El cuerpo es obligatorio."),
})

export const DestinatarioEnvioSchema = z.object({
  personaId: IdEntidadSchema,
  unidadId: z.string().optional(),
})

export const EnvioCOSchema = z.object({
  id: IdEntidadSchema,
  asunto: z
    .string({ required_error: "El asunto es obligatorio." })
    .min(1, "El asunto es obligatorio."),
  cuerpo: z
    .string({ required_error: "El cuerpo es obligatorio." })
    .min(1, "El cuerpo es obligatorio."),
  plantillaId: IdEntidadSchema.optional(),
  destinatarios: z
    .array(DestinatarioEnvioSchema)
    .min(1, "El envío requiere al menos un destinatario."),
  fechaEnvio: FechaISOSchema,
  lecturas: z.array(IdEntidadSchema),
})

export const ClasificacionBuzonSchema = z.enum([
  "felicitacion",
  "sugerencia",
  "reclamo",
])
export const EstadoBuzonCOSchema = z.enum([
  "recibido",
  "en_gestion",
  "resuelto",
  "cerrado",
])

export const RespuestaBuzonCOSchema = z.object({
  id: IdEntidadSchema,
  autor: z.string().min(1, "El autor de la respuesta es obligatorio."),
  texto: z.string().min(1, "El texto de la respuesta es obligatorio."),
  compromisos: z.string().optional(),
  fecha: FechaISOSchema,
})

// Buzón de Interacción Ciudadana: ciclo ciudadano propio (Recibido → En Gestión
// → Resuelto → Cerrado). El workflow operativo vive en GE vía mensajeBuzonId.
export const MensajeBuzonCOSchema = z.object({
  id: IdEntidadSchema,
  folio: z
    .string({ required_error: "El folio de seguimiento es obligatorio." })
    .min(1, "El folio de seguimiento es obligatorio."),
  clasificacion: ClasificacionBuzonSchema,
  reportantePersonaId: IdEntidadSchema.optional(),
  reportanteNombre: z
    .string()
    .min(1, "El nombre del reportante es obligatorio."),
  unidadId: z.string().optional(),
  asunto: z.string().min(1, "El asunto es obligatorio."),
  cuerpo: z.string().min(1, "El cuerpo del mensaje es obligatorio."),
  visibilidadComite: z.boolean({
    required_error: "El flag de visibilidad para el Comité es obligatorio.",
  }),
  fechaIngreso: FechaISOSchema,
  estado: EstadoBuzonCOSchema,
  respuestas: z.array(RespuestaBuzonCOSchema),
})

// Biblioteca documental: reutiliza metadatos D1 (nombre/tipoMime/tamanoKB/url).
export const DocumentoCOSchema = ImagenReferenciaSchema.extend({
  id: IdEntidadSchema,
  categoria: z.string().min(1, "La categoría del documento es obligatoria."),
})

// --- Gestión Administrativa (AD) ---

// Controles de privacidad/comunicación del propietario sobre su unidad.
// Defaults al leer sin registro: {residenteVeMorosidad:false, residenteVeActas:false, alertasResidentesActivas:true}
export const ControlPropiedadSchema = z.object({
  id: IdEntidadSchema,
  unidadId: IdEntidadSchema,
  residenteVeMorosidad: z.boolean({
    required_error: "El flag de morosidad visible es obligatorio.",
  }),
  residenteVeActas: z.boolean({
    required_error: "El flag de actas visibles es obligatorio.",
  }),
  alertasResidentesActivas: z.boolean({
    required_error: "El flag de alertas es obligatorio.",
  }),
})

// --- Gestión de Directiva (GD) ---

export const EstadoActaSchema = z.enum(["borrador", "publicada"])

export const ActaGDSchema = z.object({
  id: IdEntidadSchema,
  fecha: FechaISOSchema,
  hora: z
    .string({ required_error: "La hora es obligatoria." })
    .regex(/^\d{2}:\d{2}$/, "La hora debe tener formato HH:MM."),
  lugar: z
    .string({ required_error: "El lugar es obligatorio." })
    .min(1, "El lugar es obligatorio."),
  tablaTemas: z.array(z.string()),
  // Miembros de la directiva (personas con datosGobernanza)
  presentes: z.array(IdEntidadSchema),
  ausentes: z.array(IdEntidadSchema),
  invitados: z.array(z.string()),
  minuta: z.string(),
  // Soporte documental por referencia (D1): acta escaneada o imágenes.
  adjuntos: z.array(ImagenReferenciaSchema),
  estado: EstadoActaSchema,
  // Firmas de aprobación de miembros de la directiva vigente.
  aprobaciones: z.array(IdEntidadSchema),
  fechaPublicacion: FechaISOSchema.optional(),
  // Referencia de publicación en el Visor de Mensajes (CV): "pendiente" hasta
  // publicar el aviso; luego el id del aviso creado (materializado por CV).
  avisoCVReferencia: z.string().optional(),
  // Período vigente al crear el acta (trazabilidad del libro).
  periodoId: IdEntidadSchema.optional(),
})

export const MensajeDocumentoInvalido =
  "RUT inválido (dígito verificador incorrecto) o pasaporte con formato no válido."

const DocumentoIdentidadSchema = z
  .string({ required_error: "El RUT o pasaporte es obligatorio." })
  .min(1, "El RUT o pasaporte es obligatorio.")
  .refine((valor) => validarDocumentoIdentidad(valor), {
    message: MensajeDocumentoInvalido,
  })

export const PersonaSchema = z.object({
  id: IdEntidadSchema,
  rut: DocumentoIdentidadSchema,
  nombreCompleto: z
    .string({ required_error: "El nombre completo es obligatorio." })
    .min(1, "El nombre completo es obligatorio."),
  nombres: z
    .string({ required_error: "Los nombres son obligatorios." })
    .min(1, "Los nombres son obligatorios."),
  apellidos: z
    .string({ required_error: "Los apellidos son obligatorios." })
    .min(1, "Los apellidos son obligatorios."),
  email: z
    .string({ required_error: "El correo electrónico es obligatorio." })
    .email("El correo electrónico no es válido."),
  telefonoMovil: z
    .string({ required_error: "El teléfono móvil es obligatorio." })
    .min(1, "El teléfono móvil es obligatorio."),
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
  // CV: habilitación especial para crear mensajes manuales en el visor.
  permiteCreacionManualCV: z.boolean().optional(),
})

// --- Gestión de Solicitudes (GE) ---

export const TIPOS_SOLICITUD_GE = ["insumos", "grabaciones", "buzon"] as const
export const TipoSolicitudGESchema = z.enum(TIPOS_SOLICITUD_GE)

// Workflow NSGC §1.4: Nuevo → En Revisión (auto al abrir) → Requiere Acción
// Vecino ↔ En Proceso → Resuelto / Cerrado.
export const ESTADOS_SOLICITUD_GE = [
  "nuevo",
  "en_revision",
  "requiere_accion_vecino",
  "en_proceso",
  "resuelto",
  "cerrado",
] as const
export const EstadoSolicitudGESchema = z.enum(ESTADOS_SOLICITUD_GE)

export const ComentarioGESchema = z.object({
  id: IdEntidadSchema,
  autorRol: z.enum(["administracion", "solicitante"]),
  texto: z.string().min(1, "El comentario no puede estar vacío."),
  // Timestamp ISO completo: alimenta el cálculo de SLA.
  fecha: z
    .string({ required_error: "La fecha del comentario es obligatoria." })
    .min(1, "La fecha del comentario es obligatoria."),
})

export const CambioEstadoGESchema = z.object({
  de: EstadoSolicitudGESchema.optional(),
  a: EstadoSolicitudGESchema,
  fecha: z.string().min(1, "La fecha del cambio es obligatoria."),
})

export const DetalleGrabacionesSchema = z.object({
  fechaSuceso: FechaISOSchema,
  horaSuceso: z
    .string({ required_error: "La hora del suceso es obligatoria." })
    .regex(/^\d{2}:\d{2}$/, "La hora del suceso debe tener formato HH:MM."),
  justificacion: z
    .string({ required_error: "La justificación es obligatoria." })
    .min(
      20,
      "La justificación debe detallar motivo y contexto (mínimo 20 caracteres)."
    ),
})

export const DetalleInsumosSchema = z.object({
  areaDestino: z.string().min(1, "El área de destino es obligatoria."),
  // Referencia pendiente a IR (catálogo de materiales aún no implementado).
  materialSolicitado: z
    .string()
    .min(1, "El material solicitado es obligatorio."),
})

export const SolicitudGESchema = z.object({
  id: IdEntidadSchema,
  folio: z
    .string({ required_error: "El folio es obligatorio." })
    .min(1, "El folio es obligatorio."),
  tipo: TipoSolicitudGESchema,
  titulo: z
    .string({ required_error: "El título es obligatorio." })
    .min(1, "El título es obligatorio."),
  descripcion: z
    .string({ required_error: "La descripción es obligatoria." })
    .min(1, "La descripción es obligatoria."),
  solicitantePersonaId: IdEntidadSchema.optional(),
  unidadId: IdEntidadSchema.optional(),
  estado: EstadoSolicitudGESchema,
  fechaCreacion: FechaISOSchema,
  comentarios: z.array(ComentarioGESchema),
  detalleGrabaciones: DetalleGrabacionesSchema.optional(),
  detalleInsumos: DetalleInsumosSchema.optional(),
  mensajeBuzonId: IdEntidadSchema.optional(),
  resolucion: z.string().optional(),
  fechaCierre: FechaISOSchema.optional(),
  historialEstados: z.array(CambioEstadoGESchema),
})

// --- Inventario y Recursos (IR) ---

export const CATEGORIAS_RECURSO_IR = [
  "infraestructura",
  "mobiliario",
  "insumo",
  "epp",
  "acceso",
] as const
export const CategoriaRecursoIRSchema = z.enum(CATEGORIAS_RECURSO_IR)

export const ESTADOS_ACTIVO_IR = [
  "disponible",
  "en_uso",
  "reparacion",
  "baja",
] as const
export const EstadoActivoIRSchema = z.enum(ESTADOS_ACTIVO_IR)

// Referencia D1: ficha técnica y facturas solo por URL (jamás base64/Blob).
const UrlReferenciaIRSchema = z
  .string()
  .max(2048, "La URL excede el largo permitido.")
  .refine((valor) => !/^data:/i.test(valor) && !/^blob:/i.test(valor), {
    message:
      "Media por referencia (D1): no se permiten data-URL ni Blob embebidos.",
  })

export const RecursoIRSchema = z.object({
  id: IdEntidadSchema,
  // Código de inventario IR-A-#### (auto-generado al alta).
  codigo: z
    .string()
    .min(1, "El código de inventario es obligatorio.")
    .optional(),
  nombre: z
    .string({ required_error: "El nombre del recurso es obligatorio." })
    .min(1, "El nombre del recurso es obligatorio."),
  categoria: CategoriaRecursoIRSchema,
  marca: z.string().optional(),
  modelo: z.string().optional(),
  descripcion: z.string().optional(),
  fichaTecnicaUrl: UrlReferenciaIRSchema.optional(),
  // Ubicación EF (infraestructura exige micro sector o unidad; llave exige unidad).
  microSectorId: IdEntidadSchema.optional(),
  unidadId: IdEntidadSchema.optional(),
  responsablePersonaId: IdEntidadSchema.optional(),
  estadoActivo: EstadoActivoIRSchema,
  // Insumos (stock)
  unidadMedidaId: IdEntidadSchema.optional(),
  stock: z
    .number({ required_error: "El stock es obligatorio." })
    .min(0, "El stock no puede ser negativo."),
  esCritico: z.boolean({
    required_error: "El flag de stock crítico es obligatorio.",
  }),
  umbralCritico: z
    .number()
    .min(0, "El umbral no puede ser negativo.")
    .optional(),
  // Ingreso (compras): proveedor/garantía/factura como metadatos.
  proveedor: z.string().optional(),
  numeroFactura: z.string().optional(),
  facturaUrl: UrlReferenciaIRSchema.optional(),
  garantiaHasta: FechaISOSchema.optional(),
  // EPP
  talla: z.string().optional(),
  renovacionMeses: z
    .number()
    .int()
    .positive("La renovación debe ser al menos 1 mes.")
    .optional(),
  // Accesos: quién tiene qué (asignación vigente).
  asignacionActual: z
    .object({
      personaId: IdEntidadSchema,
      fecha: FechaISOSchema,
    })
    .optional(),
  cargoFIReferencia: z.literal("pendiente").optional(),
})

export const ESTADOS_SOLICITUD_INSUMO_IR = [
  "pendiente",
  "entregada",
  "rechazada",
] as const
export const EstadoSolicitudInsumoIRSchema = z.enum(ESTADOS_SOLICITUD_INSUMO_IR)

export const ESTADOS_COMODIN_IR = [
  "no_comodin",
  "pendiente",
  "aprobada_creada",
  "sustituida",
  "rechazada",
] as const
export const EstadoComodinIRSchema = z.enum(ESTADOS_COMODIN_IR)

// Comodín: artículo fuera de catálogo con descripción y justificación extendida.
export const ComodinIRSchema = z.object({
  descripcionArticulo: z
    .string({ required_error: "La descripción del artículo es obligatoria." })
    .min(1, "La descripción del artículo es obligatoria."),
  justificacion: z
    .string({ required_error: "La justificación es obligatoria." })
    .min(
      20,
      "La justificación debe detallar el motivo (mínimo 20 caracteres)."
    ),
})

export const SolicitudInsumoIRSchema = z.object({
  id: IdEntidadSchema,
  folio: z
    .string({ required_error: "El folio es obligatorio." })
    .min(1, "El folio es obligatorio."),
  solicitantePersonaId: IdEntidadSchema,
  recursoInsumoId: IdEntidadSchema.optional(),
  comodin: ComodinIRSchema.optional(),
  // Artículo similar asignado al resolver un comodín por sustitución.
  recursoSustitutoId: IdEntidadSchema.optional(),
  estadoComodin: EstadoComodinIRSchema,
  cantidad: z
    .number({ required_error: "La cantidad es obligatoria." })
    .positive("La cantidad debe ser mayor a cero."),
  areaDestino: z
    .string({ required_error: "El área de destino es obligatoria." })
    .min(1, "El área de destino es obligatoria."),
  estado: EstadoSolicitudInsumoIRSchema,
  fechaSolicitud: FechaISOSchema,
  entregaFecha: FechaISOSchema.optional(),
  rechazoJustificacion: z.string().optional(),
})

export const ESTADOS_EPP_IR = ["nuevo", "usado", "renovar"] as const
export const EstadoEPPIRSchema = z.enum(ESTADOS_EPP_IR)

export const EntregaEPPSchema = z.object({
  id: IdEntidadSchema,
  recursoId: IdEntidadSchema,
  personaId: IdEntidadSchema,
  fechaEntrega: FechaISOSchema,
  talla: z.string().optional(),
  estado: EstadoEPPIRSchema,
  proximaRenovacion: FechaISOSchema.optional(),
})

// --- Infracciones y Multas (IN) ---

export const CATEGORIAS_INFRACCION_IN = ["leve", "grave", "gravisima"] as const
export const CategoriaInfraccionINSchema = z.enum(CATEGORIAS_INFRACCION_IN)

export const TIPOS_SANCION_IN = ["monto_fijo", "porcentaje_gc"] as const
export const TipoSancionINSchema = z.enum(TIPOS_SANCION_IN)

// Catálogo parametrizable de faltas al Reglamento de Copropiedad.
export const TipoInfraccionINSchema = z.object({
  id: IdEntidadSchema,
  nombre: z
    .string({ required_error: "El nombre de la infracción es obligatorio." })
    .min(1, "El nombre de la infracción es obligatorio."),
  categoria: CategoriaInfraccionINSchema,
  tipoSancion: TipoSancionINSchema,
  valor: z
    .number({
      required_error: "El monto/valor asociado a la sanción es obligatorio.",
    })
    .min(0, "El valor no puede ser negativo."),
})

export const ESTADOS_INFRACCION_IN = [
  "en_revision",
  "apelada",
  "aplicada",
  "desestimada",
] as const
export const EstadoInfraccionINSchema = z.enum(ESTADOS_INFRACCION_IN)

// Cobro directo por daños (responsabilidad civil): sin tipo de catálogo.
export const DanoDirectoINSchema = z.object({
  descripcionDaño: z
    .string({ required_error: "La descripción del daño es obligatoria." })
    .min(1, "La descripción del daño es obligatoria."),
  costoReparacion: z
    .number({ required_error: "El costo de la reparación es obligatorio." })
    .positive("El costo debe ser mayor a cero."),
})

export const ComentarioInternoINSchema = z.object({
  id: IdEntidadSchema,
  autorPersonaId: IdEntidadSchema,
  texto: z.string().min(1, "El comentario no puede estar vacío."),
  fecha: z.string().min(1, "La fecha del comentario es obligatoria."),
})

export const ApelacionINSchema = z.object({
  descargos: z
    .string({ required_error: "Los descargos son obligatorios." })
    .min(
      10,
      "Los descargos deben detallar la posición del vecino (mínimo 10 caracteres)."
    ),
  fecha: FechaISOSchema,
})

export const InfraccionINSchema = z.object({
  id: IdEntidadSchema,
  folio: z
    .string({ required_error: "El folio es obligatorio." })
    .min(1, "El folio es obligatorio."),
  // Excluyentes: tipo del catálogo O cobro directo por daños.
  tipoInfraccionId: IdEntidadSchema.optional(),
  danoDirecto: DanoDirectoINSchema.optional(),
  unidadId: IdEntidadSchema,
  reportantePersonaId: IdEntidadSchema.optional(),
  // Nacimiento desde reclamo verídico del buzón CO (arrastra contexto).
  mensajeBuzonId: IdEntidadSchema.optional(),
  fechaSuceso: FechaISOSchema,
  horaSuceso: z
    .string({ required_error: "La hora del suceso es obligatoria." })
    .regex(/^\d{2}:\d{2}$/, "La hora del suceso debe tener formato HH:MM."),
  antecedentes: z
    .string({ required_error: "Los antecedentes son obligatorios." })
    .min(
      20,
      "Los antecedentes deben detallar los hechos (mínimo 20 caracteres)."
    ),
  evidencias: z.array(ImagenReferenciaSchema),
  estado: EstadoInfraccionINSchema,
  fechaRegistro: FechaISOSchema,
  montoAplicado: z
    .number()
    .min(0, "El monto no puede ser negativo.")
    .optional(),
  comentariosDirectiva: z.array(ComentarioInternoINSchema),
  respaldosDirectiva: z.array(IdEntidadSchema),
  apelacion: ApelacionINSchema.optional(),
  desestimacionJustificacion: z.string().optional(),
  // Cargo al Gasto Común: id del cobro FI una vez aplicada la multa
  // ("pendiente" solo en registros históricos previos a la conexión FI).
  cargoFIReferencia: z.string().optional(),
})

// --- Mantenimiento y Proyectos (MT) ---

export const PRIORIDADES_MT = ["baja", "media", "alta", "emergencia"] as const
export const PrioridadMTSchema = z.enum(PRIORIDADES_MT)

export const ESTADOS_TRABAJO_MT = [
  "planificado",
  "en_curso",
  "finalizado",
  "cancelado",
] as const
export const EstadoTrabajoMTSchema = z.enum(ESTADOS_TRABAJO_MT)

export const ORIGENES_FONDOS_MT = [
  "gasto_comun",
  "fondo_reserva",
  "fondo_especial",
  "pendiente_definir",
] as const
export const OrigenFondosMTSchema = z.enum(ORIGENES_FONDOS_MT)

export const ESTADOS_PAGO_MT = ["pendiente", "parcial", "pagado"] as const
export const EstadoPagoMTSchema = z.enum(ESTADOS_PAGO_MT)

export const ProveedorMTSchema = z.object({
  nombre: z
    .string({ required_error: "El nombre del proveedor es obligatorio." })
    .min(1, "El nombre del proveedor es obligatorio."),
  contacto: z.string().optional(),
})

// Evidencia tipada por referencia (D1): fotos antes/después, presupuestos y facturas.
export const EvidenciaMTSchema = ImagenReferenciaSchema.extend({
  tipo: z.enum(["foto_antes", "foto_despues", "presupuesto", "factura"]),
})

// Configuración de mantención preventiva (ej. Hidropack mensual, CCTV semestral).
export const PreventivoConfigSchema = z.object({
  periodicidadMeses: z
    .number({ required_error: "La periodicidad es obligatoria." })
    .int()
    .min(1, "La periodicidad debe ser al menos 1 mes."),
})

export const TrabajoMTSchema = z.object({
  id: IdEntidadSchema,
  folio: z
    .string({ required_error: "El folio es obligatorio." })
    .min(1, "El folio es obligatorio."),
  titulo: z
    .string({ required_error: "El título del trabajo es obligatorio." })
    .min(1, "El título del trabajo es obligatorio."),
  descripcion: z
    .string({ required_error: "La descripción técnica es obligatoria." })
    .min(
      20,
      "La descripción técnica debe detallar el trabajo (mínimo 20 caracteres)."
    ),
  // Ubicación EF (al menos una) + equipo crítico IR opcional.
  unidadId: IdEntidadSchema.optional(),
  microSectorId: IdEntidadSchema.optional(),
  activoIRId: IdEntidadSchema.optional(),
  // Responsable interno (MP) o empresa externa.
  responsablePersonaId: IdEntidadSchema.optional(),
  proveedor: ProveedorMTSchema.optional(),
  prioridad: PrioridadMTSchema,
  estado: EstadoTrabajoMTSchema,
  fechaProgramada: FechaISOSchema.optional(),
  fechaInicio: FechaISOSchema.optional(),
  fechaTermino: FechaISOSchema.optional(),
  costoTotal: z
    .number({ required_error: "El costo es obligatorio." })
    .min(0, "El costo no puede ser negativo."),
  origenFondos: OrigenFondosMTSchema,
  estadoPago: EstadoPagoMTSchema,
  garantiaInicio: FechaISOSchema.optional(),
  garantiaFin: FechaISOSchema.optional(),
  alertaGarantiaEnviada: z.boolean({
    required_error: "El flag de alerta de garantía es obligatorio.",
  }),
  evidencias: z.array(EvidenciaMTSchema),
  preventivo: PreventivoConfigSchema.optional(),
  cargoFIReferencia: z.string().optional(),
})

export const ESTADOS_PROYECTO_MT = [
  "planificado",
  "en_ejecucion",
  "completado",
  "descartado",
] as const
export const EstadoProyectoMTSchema = z.enum(ESTADOS_PROYECTO_MT)

// Proyecto a largo plazo: cuota sugerida derivable = presupuesto / plazo.
export const ProyectoMTSchema = z.object({
  id: IdEntidadSchema,
  nombre: z
    .string({ required_error: "El nombre del proyecto es obligatorio." })
    .min(1, "El nombre del proyecto es obligatorio."),
  descripcion: z.string().optional(),
  presupuestoEstimado: z
    .number({ required_error: "El presupuesto estimado es obligatorio." })
    .positive("El presupuesto debe ser mayor a cero."),
  plazoMeses: z
    .number({ required_error: "El plazo es obligatorio." })
    .int()
    .positive("El plazo debe ser mayor a cero."),
  fechaObjetivo: FechaISOSchema.optional(),
  estado: EstadoProyectoMTSchema,
  fondoFinanciamientoId: IdEntidadSchema.optional(),
})

// --- Reservas y Amenities (RA) ---

export const TIPOS_ELEMENTO_RA = [
  "espacio_fisico",
  "activo_mobiliario",
] as const
export const TipoElementoRASchema = z.enum(TIPOS_ELEMENTO_RA)

export const FRANJAS_RA = ["bloques_horas", "dia_completo"] as const
export const FranjaRASchema = z.enum(FRANJAS_RA)

// Elemento reservable: centro de costos del Fondo de Amenities (FI, ventana 6).
export const ElementoRASchema = z
  .object({
    id: IdEntidadSchema,
    nombre: z
      .string({ required_error: "El nombre del elemento es obligatorio." })
      .min(1, "El nombre del elemento es obligatorio."),
    tipo: TipoElementoRASchema,
    // Ubicación por referencia: micro sector EF o activo del catálogo IR.
    microSectorId: IdEntidadSchema.optional(),
    activoIRId: IdEntidadSchema.optional(),
    franja: FranjaRASchema,
    duracionBloqueHoras: z
      .number()
      .int()
      .min(1, "El bloque debe durar al menos 1 hora.")
      .max(24, "El bloque no puede superar 24 horas.")
      .optional(),
    tarifaUso: z
      .number({ required_error: "La tarifa de uso es obligatoria." })
      .min(0, "La tarifa no puede ser negativa."),
    garantiaRequerida: z
      .number({ required_error: "La garantía requerida es obligatoria." })
      .min(0, "La garantía no puede ser negativa."),
    aforo: z
      .number()
      .int()
      .positive("El aforo debe ser mayor a cero.")
      .optional(),
    stock: z
      .number()
      .int()
      .min(1, "El stock debe ser de al menos 1 unidad.")
      .optional(),
    anticipacionMinimaDias: z.number().int().min(0).optional(),
    cancelacionTardiaDias: z.number().int().min(0).optional(),
    penalizacionTardiaMonto: z
      .number()
      .positive("La penalización debe ser mayor a cero.")
      .optional(),
    activo: z.boolean({ required_error: "El estado activo es obligatorio." }),
  })
  .refine(
    (e) => e.franja === "dia_completo" || (e.duracionBloqueHoras ?? 0) >= 1,
    {
      message: "Los bloques horarios exigen una duración de bloque en horas.",
    }
  )

export const ESTADOS_RESERVA_RA = ["confirmada", "cancelada"] as const
export const EstadoReservaRASchema = z.enum(ESTADOS_RESERVA_RA)

export const CancelacionRASchema = z.object({
  fecha: FechaISOSchema,
  tardia: z.boolean({
    required_error: "El flag de cancelación tardía es obligatorio.",
  }),
  penalizacion: z
    .number()
    .min(0, "La penalización no puede ser negativa.")
    .optional(),
})

export const RetencionGarantiaRASchema = z.object({
  monto: z
    .number({ required_error: "El monto retenido es obligatorio." })
    .positive("El monto retenido debe ser mayor a cero."),
  motivo: z
    .string({ required_error: "El motivo de la retención es obligatorio." })
    .min(1, "El motivo de la retención es obligatorio."),
})

const HoraRASchema = z
  .string({ required_error: "La hora es obligatoria." })
  .regex(/^\d{2}:\d{2}$/, "La hora debe tener formato HH:MM.")

export const ReservaRASchema = z.object({
  id: IdEntidadSchema,
  folio: z
    .string({ required_error: "El folio es obligatorio." })
    .min(1, "El folio es obligatorio."),
  elementoId: IdEntidadSchema,
  solicitantePersonaId: IdEntidadSchema,
  unidadId: IdEntidadSchema.optional(),
  fecha: FechaISOSchema,
  // Tramo [inicio, fin); día completo usa 00:00–23:59.
  horaInicio: HoraRASchema,
  horaFin: HoraRASchema,
  estado: EstadoReservaRASchema,
  // Snapshots tarifarios vigentes al confirmar la reserva.
  montoTarifa: z
    .number({ required_error: "El monto de tarifa es obligatorio." })
    .min(0, "La tarifa no puede ser negativa."),
  montoGarantia: z
    .number({ required_error: "El monto de garantía es obligatorio." })
    .min(0, "La garantía no puede ser negativa."),
  cancelacion: CancelacionRASchema.optional(),
  garantiaRetenida: RetencionGarantiaRASchema.optional(),
  // Cobros al Fondo de Amenities: id del cobro FI materializado
  // ("pendiente" solo en registros históricos previos a la conexión FI).
  cargoFIReferencia: z.string().optional(),
})

// --- Finanzas y Morosidad (FI) ---

export const ModoCalculoGCSchema = z.enum(["fijo", "variable"])

export const TIPOS_FONDO_FI = [
  "gasto_comun",
  "reserva",
  "especial",
  "amenities",
] as const
export const TipoFondoFISchema = z.enum(TIPOS_FONDO_FI)

export const FondoFISchema = z.object({
  id: IdEntidadSchema,
  nombre: z
    .string({ required_error: "El nombre del fondo es obligatorio." })
    .min(1, "El nombre del fondo es obligatorio."),
  tipo: TipoFondoFISchema,
  descripcion: z.string().optional(),
  // Solo relevante para fondos de reserva: % aplicado sobre el total emitido.
  porcentajeAporte: z
    .number()
    .min(0, "El porcentaje no puede ser negativo.")
    .max(100, "El porcentaje no puede superar 100.")
    .optional(),
  activo: z.boolean({ required_error: "El estado activo es obligatorio." }),
  // Saldo de apertura versátil (P1): 0 = fiel al flujo, ajustado = cuadra con el libro.
  saldoInicial: z
    .number()
    .min(0, "El saldo inicial no puede ser negativo.")
    .optional(),
})

export const IngresoFISchema = z.object({
  id: IdEntidadSchema,
  fecha: FechaISOSchema,
  monto: z
    .number({ required_error: "El monto es obligatorio." })
    .positive("El monto debe ser mayor a cero."),
  concepto: z
    .string({ required_error: "El concepto es obligatorio." })
    .min(1, "El concepto es obligatorio."),
  fondoId: IdEntidadSchema,
  familia: z.string().optional(),
})

export const CATEGORIAS_EGRESO_FI = [
  "sueldos",
  "mantencion",
  "servicios",
  "administracion",
  "uso_de_fondo",
  "otro",
] as const
export const CategoriaEgresoFISchema = z.enum(CATEGORIAS_EGRESO_FI)

export const EgresoFISchema = z.object({
  id: IdEntidadSchema,
  // Folio FE-#### (auto-generado al alta).
  folio: z.string().min(1, "El folio es obligatorio.").optional(),
  fecha: FechaISOSchema,
  categoria: CategoriaEgresoFISchema,
  descripcion: z
    .string({ required_error: "La descripción del gasto es obligatoria." })
    .min(1, "La descripción del gasto es obligatoria."),
  monto: z
    .number({ required_error: "El monto es obligatorio." })
    .positive("El monto debe ser mayor a cero."),
  // Imputación obligatoria al fondo de origen del dinero.
  fondoId: IdEntidadSchema,
  esRecurrente: z.boolean({
    required_error: "El flag recurrente/fijo es obligatorio.",
  }),
  comprobante: ImagenReferenciaSchema.optional(),
  microSectoresIds: z.array(IdEntidadSchema).optional(),
  proveedor: z.string().optional(),
  unidadId: IdEntidadSchema.optional(),
  aprobacionActaGDId: IdEntidadSchema.optional(),
})

export const LineaEmisionGCSchema = z.object({
  unidadId: IdEntidadSchema,
  responsablePersonaId: IdEntidadSchema,
  monto: z.number().min(0),
  cobroId: IdEntidadSchema,
})

export const AporteFondoReservaSchema = z.object({
  fondoId: IdEntidadSchema,
  monto: z.number().positive("El aporte debe ser mayor a cero."),
})

export const EmisionGCSchema = z.object({
  id: IdEntidadSchema,
  periodo: z
    .string({ required_error: "El periodo es obligatorio." })
    .regex(/^\d{4}-\d{2}$/, "El periodo debe tener formato AAAA-MM."),
  modo: ModoCalculoGCSchema,
  gastoTotal: z.number().min(0),
  lineas: z
    .array(LineaEmisionGCSchema)
    .min(1, "La emisión exige al menos una unidad."),
  fondoReservaAporte: AporteFondoReservaSchema.optional(),
  fechaEmision: FechaISOSchema,
})

export const CONCEPTOS_COBRO_FI = [
  "gasto_comun",
  "cuota_extraordinaria",
  "multa_in",
  "consumo",
  "reserva_ra",
  "penalizacion_ra",
  "garantia_ra",
] as const
export const ConceptoCobroFISchema = z.enum(CONCEPTOS_COBRO_FI)

export const OrigenModuloCobroFISchema = z.enum(["FI", "IN", "RA"])

export const MoraCobroFISchema = z.object({
  id: IdEntidadSchema,
  monto: z.number().positive("La mora debe ser mayor a cero."),
  diasAtraso: z.number().int().min(0),
  tasaMensualPct: z.number().positive("La tasa debe ser mayor a cero."),
  fecha: FechaISOSchema,
})

export const PagoCobroFISchema = z.object({
  id: IdEntidadSchema,
  monto: z.number().positive("El pago debe ser mayor a cero."),
  fecha: FechaISOSchema,
  medio: z
    .string({ required_error: "El medio de pago es obligatorio." })
    .min(1, "El medio de pago es obligatorio."),
})

export const DiferenciaPagoFISchema = z.object({
  id: IdEntidadSchema,
  tipo: z.enum(["descuento", "recargo"]),
  esperado: z.number().min(0),
  recibido: z.number().min(0),
  diferencia: z.number().positive("La diferencia debe ser mayor a cero."),
  justificacion: z
    .string({ required_error: "La justificación del ajuste es obligatoria." })
    .min(
      10,
      "La justificación debe explicar el motivo del ajuste (mínimo 10 caracteres)."
    ),
  fecha: FechaISOSchema,
})

export const CobroFISchema = z.object({
  id: IdEntidadSchema,
  unidadId: IdEntidadSchema,
  periodo: z
    .string({ required_error: "El periodo es obligatorio." })
    .regex(/^\d{4}-\d{2}$/, "El periodo debe tener formato AAAA-MM."),
  concepto: ConceptoCobroFISchema,
  origenModulo: OrigenModuloCobroFISchema,
  origenRef: IdEntidadSchema.optional(),
  fondoId: IdEntidadSchema,
  descripcion: z
    .string({ required_error: "La descripción del cobro es obligatoria." })
    .min(1, "La descripción del cobro es obligatoria."),
  montoBase: z
    .number({ required_error: "El monto base es obligatorio." })
    .positive("El monto base debe ser mayor a cero."),
  fechaCargo: FechaISOSchema,
  fechaVencimiento: FechaISOSchema.optional(),
  moras: z.array(MoraCobroFISchema),
  pagos: z.array(PagoCobroFISchema),
  diferencias: z.array(DiferenciaPagoFISchema),
})

// --- Personal y Servicios (PE) ---

const HoraPESchema = z
  .string({ required_error: "La hora es obligatoria." })
  .regex(/^\d{2}:\d{2}$/, "La hora debe tener formato HH:MM.")

// Bitácora: control de visitas con pre-agendamiento o llegada sin aviso.
export const BitacoraVisitaPESchema = z.object({
  id: IdEntidadSchema,
  fecha: FechaISOSchema,
  nombre: z
    .string({ required_error: "El nombre de la visita es obligatorio." })
    .min(1, "El nombre de la visita es obligatorio."),
  dni: z
    .string({ required_error: "El DNI de la visita es obligatorio." })
    .min(1, "El DNI de la visita es obligatorio."),
  patente: z.string().optional(),
  unidadId: IdEntidadSchema.optional(),
  destinoPersonaId: IdEntidadSchema.optional(),
  jornadaId: IdEntidadSchema,
  origenAgenda: z.enum(["pre_agendada", "sin_aviso"]),
  agendadaPorPersonaId: IdEntidadSchema.optional(),
  estado: z.enum(["agendada", "ingresada", "cancelada"]),
  horaIngreso: HoraPESchema.optional(),
  notas: z.string().optional(),
})

// Encomiendas: courier normalizado por maestro + evidencia D1.
export const EncomiendaPESchema = z.object({
  id: IdEntidadSchema,
  courierId: IdEntidadSchema,
  destinatarioPersonaId: IdEntidadSchema.optional(),
  unidadId: IdEntidadSchema.optional(),
  descripcionPaquete: z.string().optional(),
  evidencia: ImagenReferenciaSchema.optional(),
  fechaRecepcion: FechaISOSchema,
  estado: z.enum(["recibida", "retirada"]),
  retiro: z
    .object({
      retiradoPor: z
        .string({ required_error: "El nombre de quien retira es obligatorio." })
        .min(1, "El nombre de quien retira es obligatorio."),
      fechaRetiro: FechaISOSchema,
      relacion: z.string().optional(),
    })
    .optional(),
})

// Contratistas: ingreso con motivo específico obligatorio.
export const IngresoContratistaPESchema = z.object({
  id: IdEntidadSchema,
  contratistaId: IdEntidadSchema,
  motivo: z
    .string({ required_error: "El motivo del ingreso es obligatorio." })
    .min(
      5,
      "Debe detallar el motivo específico del ingreso (mínimo 5 caracteres)."
    ),
  unidadId: IdEntidadSchema.optional(),
  fecha: FechaISOSchema,
  jornadaId: IdEntidadSchema,
  agendadoPor: z.enum(["residente", "administracion"]),
  personaAgendaId: IdEntidadSchema.optional(),
  estado: z.enum(["agendado", "ingresado", "cancelado"]),
  horaIngreso: HoraPESchema.optional(),
  notas: z.string().optional(),
})

// Proveedores externos (ascensores, bombas, CCTV, etc.).
export const ProveedorPESchema = z.object({
  id: IdEntidadSchema,
  rut: DocumentoIdentidadSchema,
  nombre: z
    .string({ required_error: "El nombre del proveedor es obligatorio." })
    .min(1, "El nombre del proveedor es obligatorio."),
  rubro: z
    .string({ required_error: "El rubro del servicio es obligatorio." })
    .min(1, "El rubro del servicio es obligatorio."),
  contacto: z.string().optional(),
  telefono: z.string().optional(),
  email: z
    .string()
    .email("El correo electrónico no es válido.")
    .or(z.literal(""))
    .optional(),
  sitioWeb: z
    .string()
    .url("La URL del sitio no es válida.")
    .or(z.literal(""))
    .optional(),
  activo: z.boolean({ required_error: "El estado activo es obligatorio." }),
})

// Mantención preventiva con ciclo periódico y próxima fecha programada.
export const MantencionPreventivaPESchema = z.object({
  id: IdEntidadSchema,
  proveedorId: IdEntidadSchema,
  descripcion: z
    .string({ required_error: "La descripción del servicio es obligatoria." })
    .min(1, "La descripción del servicio es obligatoria."),
  periodicidadMeses: z
    .number({ required_error: "La periodicidad es obligatoria." })
    .int()
    .min(1, "La periodicidad debe ser al menos 1 mes."),
  proximaFecha: FechaISOSchema,
  alertaDiasAntes: z
    .number({ required_error: "El horizonte de alerta es obligatorio." })
    .int()
    .min(0),
  activo: z.boolean({ required_error: "El estado activo es obligatorio." }),
})

// Libro de visitas técnicas: qué hizo el técnico y quién lo supervisó.
export const VisitaTecnicaPESchema = z.object({
  id: IdEntidadSchema,
  proveedorId: IdEntidadSchema,
  mantencionId: IdEntidadSchema.optional(),
  tecnicoNombre: z
    .string({ required_error: "El nombre del técnico es obligatorio." })
    .min(1, "El nombre del técnico es obligatorio."),
  fecha: FechaISOSchema,
  trabajoRealizado: z
    .string({ required_error: "El trabajo realizado es obligatorio." })
    .min(5, "Debe describir el trabajo realizado (mínimo 5 caracteres)."),
  supervisorPersonaId: IdEntidadSchema.optional(),
  unidadId: IdEntidadSchema.optional(),
})

const ChecklistItemTurnoSchema = z.object({
  item: z.string().min(1, "El ítem del checklist es obligatorio."),
  ok: z.boolean({ required_error: "El estado del ítem es obligatorio." }),
  observacion: z.string().optional(),
})

// Cierre de turno: reporte obligatorio con checklist snapshot e historial de cambios inmutable.
export const CierreTurnoPESchema = z.object({
  id: IdEntidadSchema,
  fecha: FechaISOSchema,
  hora: HoraPESchema,
  // Jornada reportada (editable para reemplazos), ligada al maestro jornadas.
  jornadaReportadaId: IdEntidadSchema,
  trabajadorPersonaId: IdEntidadSchema,
  novedadesGenerales: z.string().optional(),
  incidencias: z.object({
    hubo: z.boolean({
      required_error: "El flag de incidencias es obligatorio.",
    }),
    descripcion: z.string().max(2000).optional(),
    evidencias: z.array(ImagenReferenciaSchema).optional(),
  }),
  checklistInstalaciones: z.array(ChecklistItemTurnoSchema),
  checklistEquipamiento: z.array(ChecklistItemTurnoSchema),
  historialCambios: z.array(
    z.object({
      fecha: FechaISOSchema,
      resumen: z
        .string({ required_error: "El resumen del cambio es obligatorio." })
        .min(
          5,
          "El resumen del cambio debe detallar la modificación (mínimo 5 caracteres)."
        ),
    })
  ),
  notificadoAAdmin: z.boolean({
    required_error: "El flag de notificación es obligatorio.",
  }),
})

// Proyección operativa de feriados enviada a Finanzas; PL materializa la
// liquidación en la ventana 8 (liquidacionPLReferencia queda "pendiente").
export const ProyeccionPESchema = z.object({
  id: IdEntidadSchema,
  mesAnio: z
    .string({ required_error: "El mes de proyección es obligatorio." })
    .regex(/^\d{4}-\d{2}$/, "El mes debe tener formato AAAA-MM."),
  feriados: z.array(
    z.object({
      id: IdEntidadSchema,
      fecha: FechaISOSchema,
      nombre: z.string().min(1),
      irrenunciable: z.boolean(),
    })
  ),
  diasFeriados: z.number().int().min(0),
  reemplazosNecesarios: z.number().int().min(0),
  costoEstimado: z.number().min(0),
  detalleCosto: z.object({
    personalPlanta: z.number().int().min(0),
    costoParche: z.number().min(0),
    costoDiaExtra: z.number().min(0),
  }),
  enviadoAFI: z.boolean({
    required_error: "El flag de envío a FI es obligatorio.",
  }),
  liquidacionPLReferencia: z.string().optional(),
})

// --- Visor de Mensajes (CV) ---

export const TIPOLOGIAS_CV = [
  "info",
  "exito",
  "advertencia",
  "peligro",
] as const
export const TipologiaCVSchema = z.enum(TIPOLOGIAS_CV)

export const ESTADOS_AVISO_CV = ["borrador", "publicado", "archivado"] as const
export const EstadoAvisoCVSchema = z.enum(ESTADOS_AVISO_CV)

export const ORIGENES_AVISO_CV = ["manual", "plantilla", "acta_gd"] as const
export const OrigenAvisoCVSchema = z.enum(ORIGENES_AVISO_CV)

// D1: imagen solo por URL remota (jamás data:/blob:).
const ImagenUrlCVSchema = z
  .string()
  .max(2048, "La URL excede el largo permitido.")
  .refine((valor) => !/^data:/i.test(valor) && !/^blob:/i.test(valor), {
    message:
      "Media por referencia (D1): la imagen debe ser una URL remota, no contenido embebido.",
  })

// Video: solo enlaces YouTube (watch, Shorts o youtu.be).
const VideoUrlCVSchema = z
  .string()
  .max(2048, "La URL excede el largo permitido.")
  .regex(
    /^https:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)\S+$/,
    "El video debe ser un enlace de YouTube (watch, Shorts o youtu.be)."
  )

export const AvisoCVSchema = z
  .object({
    id: IdEntidadSchema,
    titulo: z
      .string({ required_error: "El título del aviso es obligatorio." })
      .min(1, "El título del aviso es obligatorio."),
    cuerpo: z
      .string({ required_error: "El cuerpo del aviso es obligatorio." })
      .min(1, "El cuerpo del aviso es obligatorio."),
    tipologia: TipologiaCVSchema,
    duracionSegundos: z
      .number({ required_error: "La duración en pantalla es obligatoria." })
      .int()
      .min(3, "La duración debe ser de al menos 3 segundos."),
    imagenUrl: ImagenUrlCVSchema.optional(),
    videoUrl: VideoUrlCVSchema.optional(),
    pantallaCompleta: z.boolean({
      required_error: "El flag de pantalla completa es obligatorio.",
    }),
    expiresAt: FechaISOSchema.optional(),
    tags: z.array(z.string()),
    estado: EstadoAvisoCVSchema,
    requiereVistoBueno: z.boolean({
      required_error: "El flag de visto bueno es obligatorio.",
    }),
    creadoPorPersonaId: IdEntidadSchema.optional(),
    origen: OrigenAvisoCVSchema,
    plantillaId: IdEntidadSchema.optional(),
    actaId: IdEntidadSchema.optional(),
    fechaCreacion: FechaISOSchema,
    fechaPublicacion: FechaISOSchema.optional(),
    fechaArchivado: FechaISOSchema.optional(),
  })
  .refine((a) => !(a.imagenUrl && a.videoUrl), {
    message: "Multimedia excluyente: el aviso admite imagen o video, no ambos.",
  })
  .refine((a) => !a.imagenUrl || !/^data:/i.test(a.imagenUrl), {
    message: "Media por referencia (D1): sin base64.",
  })

export const PlantillaCVSchema = z
  .object({
    id: IdEntidadSchema,
    titulo: z
      .string({ required_error: "El título de la plantilla es obligatorio." })
      .min(1, "El título de la plantilla es obligatorio."),
    cuerpo: z
      .string({ required_error: "El cuerpo de la plantilla es obligatorio." })
      .min(1, "El cuerpo de la plantilla es obligatorio."),
    tipologia: TipologiaCVSchema,
    duracionSegundosSugerida: z
      .number({ required_error: "La duración sugerida es obligatoria." })
      .int()
      .min(3, "La duración sugerida debe ser de al menos 3 segundos."),
    imagenUrl: ImagenUrlCVSchema.optional(),
    videoUrl: VideoUrlCVSchema.optional(),
    pantallaCompleta: z.boolean({
      required_error: "El flag de pantalla completa es obligatorio.",
    }),
    tags: z.array(z.string()),
    activa: z.boolean({ required_error: "El estado activo es obligatorio." }),
  })
  .refine((p) => !(p.imagenUrl && p.videoUrl), {
    message:
      "Multimedia excluyente: la plantilla admite imagen o video, no ambos.",
  })

// --- Administración: Maestros (MA) ---

export const AfpSchema = z.object({
  id: IdEntidadSchema,
  nombre: z.string().min(1, "El nombre es obligatorio."),
  tasaCotizacion: z
    .number()
    .min(0, "La tasa de cotización no puede ser negativa."),
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

// Maestros legales/operativos de PE (ventana 7).
export const AsignacionFamiliarSchema = z.object({
  id: IdEntidadSchema,
  nombre: z.string().min(1, "El nombre es obligatorio."),
  monto: z.number().min(0, "El monto del tramo no puede ser negativo."),
  rangoRentas: z.string().optional(),
})

export const ContratistaSchema = z.object({
  id: IdEntidadSchema,
  nombre: z.string().min(1, "El nombre es obligatorio."),
  rubro: z.string().optional(),
  telefono: z.string().optional(),
})

export const JornadaSchema = NombreSimpleSchema
export const CourierSchema = NombreSimpleSchema

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
  asignacionFamiliar: AsignacionFamiliarSchema,
  jornadas: JornadaSchema,
  couriers: CourierSchema,
  contratistas: ContratistaSchema,
} as const

// --- Administración: Configuración Global (CF) ---

export const SeguridadSMTPSchema = z.enum(["ssl", "tls", "none"])

export const ConfiguracionGlobalSchema = z.object({
  // 1. Identidad y Representación Legal
  nombreComunidad: z
    .string()
    .min(1, "El nombre de la comunidad es obligatorio."),
  logoUrl: z.string().optional(),
  faviconUrl: z.string().optional(),
  rutComunidad: DocumentoIdentidadSchema,
  direccionOficial: z.string().min(1, "La dirección oficial es obligatoria."),
  administradorResponsable: z
    .string()
    .min(1, "El administrador responsable es obligatorio."),
  rutAdministrador: DocumentoIdentidadSchema,
  telefonoAdmin: z
    .string()
    .min(1, "El teléfono del administrador es obligatorio."),
  firmaDigitalizadaUrl: z.string().optional(),

  // 2. Parametrización del Gasto Común
  modoCalculoGC: ModoCalculoGCSchema,
  diaCortePago: z
    .number()
    .int()
    .min(1, "El día de corte debe estar entre 1 y 31.")
    .max(31, "El día de corte debe estar entre 1 y 31."),
  limiteMesesAvisoCorte: z
    .number()
    .int()
    .min(1, "El límite de meses debe ser mayor a 0."),

  // 3. Configuración de Correo Electrónico (SMTP) — C2-final: smtpPassword vive solo en env servidor (SMTP_PASSWORD), no en schema cliente
  smtpHost: z.string().min(1, "El servidor SMTP es obligatorio."),
  smtpPort: z
    .number()
    .int()
    .min(1, "El puerto SMTP es inválido.")
    .max(65535, "El puerto SMTP es inválido."),
  smtpUser: z.string().min(1, "El usuario SMTP es obligatorio."),
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

  // 5. Parámetros Operativos y Seguridad — C2-final: claveEliminacionMaestro vive solo en env servidor (CLAVE_ELIMINACION_MAESTRO), no en schema cliente
  diasMesComercial: z
    .number()
    .int()
    .min(1, "Los días mes comercial deben estar entre 1 y 31.")
    .max(31, "Los días mes comercial deben estar entre 1 y 31."),
  diasVacacionesMes: z
    .number()
    .positive("Los días de vacaciones deben ser mayores a 0."),
  jornadaSemanalEstandar: z
    .number()
    .int()
    .min(1, "La jornada semanal debe ser mayor a 0.")
    .max(80, "La jornada semanal no puede superar 80 horas."),

  // 6. Portal Inmobiliario (PI): opcional para compatibilidad con stores previos.
  // Ausente = modo "residentes" (por defecto, según spec PI).
  visibilidadPortalInmobiliario: z.enum(["residentes", "publica"]).optional(),

  // 7. Visor de Mensajes (CV): visto bueno obligatorio de administración para
  // mensajes creados por terceros habilitados. Ausente = true (por defecto).
  cvRequiereVistoBueno: z.boolean().optional(),

  // 8. Parámetros Legales Chile para Remuneraciones (PL): opcionales para
  // compatibilidad; su ausencia bloquea la generación de liquidaciones.
  ufMensual: z
    .number()
    .positive("El valor UF debe ser mayor a cero.")
    .optional(),
  ingresoMinimoMensual: z
    .number()
    .positive("El ingreso mínimo debe ser mayor a cero.")
    .optional(),
  topeGratificacionLegal: z
    .number()
    .positive("El tope de gratificación debe ser mayor a cero.")
    .optional(),
  tasaSIS: z
    .number()
    .min(0, "La tasa SIS no puede ser negativa.")
    .max(100, "La tasa SIS no puede superar 100.")
    .optional(),
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
export type EstadoActa = z.infer<typeof EstadoActaSchema>
export type ActaGD = z.infer<typeof ActaGDSchema>
export type PlantillaCO = z.infer<typeof PlantillaCOSchema>
export type DestinatarioEnvio = z.infer<typeof DestinatarioEnvioSchema>
export type EnvioCO = z.infer<typeof EnvioCOSchema>
export type ClasificacionBuzon = z.infer<typeof ClasificacionBuzonSchema>
export type EstadoBuzonCO = z.infer<typeof EstadoBuzonCOSchema>
export type RespuestaBuzonCO = z.infer<typeof RespuestaBuzonCOSchema>
export type MensajeBuzonCO = z.infer<typeof MensajeBuzonCOSchema>
export type DocumentoCO = z.infer<typeof DocumentoCOSchema>
export type TipoSolicitudGE = z.infer<typeof TipoSolicitudGESchema>
export type EstadoSolicitudGE = z.infer<typeof EstadoSolicitudGESchema>
export type ComentarioGE = z.infer<typeof ComentarioGESchema>
export type CambioEstadoGE = z.infer<typeof CambioEstadoGESchema>
export type DetalleGrabaciones = z.infer<typeof DetalleGrabacionesSchema>
export type DetalleInsumos = z.infer<typeof DetalleInsumosSchema>
export type SolicitudGE = z.infer<typeof SolicitudGESchema>
export type RecursoIR = z.infer<typeof RecursoIRSchema>
export type SolicitudInsumoIR = z.infer<typeof SolicitudInsumoIRSchema>
export type ComodinIR = z.infer<typeof ComodinIRSchema>
export type EntregaEPP = z.infer<typeof EntregaEPPSchema>
export type CategoriaRecursoIR = z.infer<typeof CategoriaRecursoIRSchema>
export type EstadoActivoIR = z.infer<typeof EstadoActivoIRSchema>
export type EstadoSolicitudInsumoIR = z.infer<
  typeof EstadoSolicitudInsumoIRSchema
>
export type EstadoComodinIR = z.infer<typeof EstadoComodinIRSchema>
export type EstadoEPPIR = z.infer<typeof EstadoEPPIRSchema>
export type TipoInfraccionIN = z.infer<typeof TipoInfraccionINSchema>
export type DanoDirectoIN = z.infer<typeof DanoDirectoINSchema>
export type ComentarioInternoIN = z.infer<typeof ComentarioInternoINSchema>
export type ApelacionIN = z.infer<typeof ApelacionINSchema>
export type InfraccionIN = z.infer<typeof InfraccionINSchema>
export type CategoriaInfraccionIN = z.infer<typeof CategoriaInfraccionINSchema>
export type EstadoInfraccionIN = z.infer<typeof EstadoInfraccionINSchema>
export type TrabajoMT = z.infer<typeof TrabajoMTSchema>
export type EvidenciaMT = z.infer<typeof EvidenciaMTSchema>
export type ProyectoMT = z.infer<typeof ProyectoMTSchema>
export type EstadoPagoMT = z.infer<typeof EstadoPagoMTSchema>
export type EstadoTrabajoMT = z.infer<typeof EstadoTrabajoMTSchema>
export type PrioridadMT = z.infer<typeof PrioridadMTSchema>
export type TipoElementoRA = z.infer<typeof TipoElementoRASchema>
export type FranjaRA = z.infer<typeof FranjaRASchema>
export type ElementoRA = z.infer<typeof ElementoRASchema>
export type EstadoReservaRA = z.infer<typeof EstadoReservaRASchema>
export type CancelacionRA = z.infer<typeof CancelacionRASchema>
export type RetencionGarantiaRA = z.infer<typeof RetencionGarantiaRASchema>
export type ReservaRA = z.infer<typeof ReservaRASchema>
export type TipologiaCV = z.infer<typeof TipologiaCVSchema>
export type EstadoAvisoCV = z.infer<typeof EstadoAvisoCVSchema>
export type OrigenAvisoCV = z.infer<typeof OrigenAvisoCVSchema>
export type AvisoCV = z.infer<typeof AvisoCVSchema>
export type PlantillaCV = z.infer<typeof PlantillaCVSchema>
export type FondoFI = z.infer<typeof FondoFISchema>
export type TipoFondoFI = z.infer<typeof TipoFondoFISchema>
export type CategoriaEgresoFI = z.infer<typeof CategoriaEgresoFISchema>
export type EgresoFI = z.infer<typeof EgresoFISchema>
export type IngresoFI = z.infer<typeof IngresoFISchema>
export type LineaEmisionGC = z.infer<typeof LineaEmisionGCSchema>
export type AporteFondoReserva = z.infer<typeof AporteFondoReservaSchema>
export type EmisionGC = z.infer<typeof EmisionGCSchema>
export type ConceptoCobroFI = z.infer<typeof ConceptoCobroFISchema>
export type MoraCobroFI = z.infer<typeof MoraCobroFISchema>
export type PagoCobroFI = z.infer<typeof PagoCobroFISchema>
export type DiferenciaPagoFI = z.infer<typeof DiferenciaPagoFISchema>
export type CobroFI = z.infer<typeof CobroFISchema>
export type BitacoraVisitaPE = z.infer<typeof BitacoraVisitaPESchema>
export type EncomiendaPE = z.infer<typeof EncomiendaPESchema>
export type IngresoContratistaPE = z.infer<typeof IngresoContratistaPESchema>
export type ProveedorPE = z.infer<typeof ProveedorPESchema>
export type MantencionPreventivaPE = z.infer<
  typeof MantencionPreventivaPESchema
>
export type VisitaTecnicaPE = z.infer<typeof VisitaTecnicaPESchema>
export type ChecklistItemTurno = z.infer<typeof ChecklistItemTurnoSchema>
export type CierreTurnoPE = z.infer<typeof CierreTurnoPESchema>
export type ProyeccionPE = z.infer<typeof ProyeccionPESchema>
export type AsignacionFamiliar = z.infer<typeof AsignacionFamiliarSchema>
export type ContratistaMA = z.infer<typeof ContratistaSchema>
export type Jornada = z.infer<typeof JornadaSchema>
export type Courier = z.infer<typeof CourierSchema>
export type BonoLiquidacion = z.infer<typeof BonoLiquidacionSchema>
export type AdelantoPL = z.infer<typeof AdelantoPLSchema>
export type EstadoAdelantoPL = z.infer<typeof EstadoAdelantoPLSchema>
export type LiquidacionPL = z.infer<typeof LiquidacionPLSchema>
export type TipoCertificadoCT = z.infer<typeof TipoCertificadoCTSchema>
export type CertificadoCT = z.infer<typeof CertificadoCTSchema>
export type BloqueReporteRE = z.infer<typeof BloqueReporteRESchema>
export type ReporteRE = z.infer<typeof ReporteRESchema>

// --- Liquidaciones y Remuneraciones (PL) ---

export const ESTADOS_ADELANTO_PL = ["pendiente", "descontado"] as const
export const EstadoAdelantoPLSchema = z.enum(ESTADOS_ADELANTO_PL)

// Adelanto de sueldo: glosa explicativa obligatoria y folio ADE auto-generado
// como comprobante de entrega. Ciclo: pendiente → descontado en liquidación.
export const AdelantoPLSchema = z.object({
  id: IdEntidadSchema,
  folio: z.string().min(1, "El folio del adelanto es obligatorio."),
  trabajadorPersonaId: IdEntidadSchema,
  fecha: FechaISOSchema,
  monto: z
    .number({ required_error: "El monto es obligatorio." })
    .positive("El monto del adelanto debe ser mayor a cero."),
  glosa: z
    .string({ required_error: "La glosa explicativa es obligatoria." })
    .min(5, "Debe describir el motivo del adelanto (mínimo 5 caracteres)."),
  estado: EstadoAdelantoPLSchema,
  liquidacionId: IdEntidadSchema.optional(),
})

const BonoLiquidacionSchema = z.object({
  id: IdEntidadSchema,
  glosa: z
    .string({ required_error: "La glosa del bono es obligatoria." })
    .min(1, "La glosa del bono es obligatoria."),
  monto: z.number().min(0, "El monto no puede ser negativo."),
  imponible: z.boolean({ required_error: "El flag imponible es obligatorio." }),
})

// Liquidación de sueldo: snapshot inmutable de las líneas calculadas al
// generar. La edición posterior no reescribe históricos (auditoría documental).
export const LiquidacionPLSchema = z.object({
  id: IdEntidadSchema,
  folio: z.string().min(1, "El folio es obligatorio."),
  trabajadorPersonaId: IdEntidadSchema,
  periodo: z
    .string({ required_error: "El periodo es obligatorio." })
    .regex(/^\d{4}-\d{2}$/, "El periodo debe tener formato AAAA-MM."),
  fechaGeneracion: FechaISOSchema,
  diasTrabajados: z
    .number()
    .int()
    .min(0, "Los días trabajados no pueden ser negativos.")
    .max(31, "Los días trabajados no pueden superar 31."),
  // Snapshot contractual y paramétrico usado en el cálculo.
  sueldoBaseContrato: z.number().min(0),
  diasMesComercial: z.number().int().min(28).max(31),
  jornadaSemanal: z.number().positive(),
  // Haberes imponibles.
  sueldoBaseProporcional: z.number().min(0),
  horasExtrasHoras: z.number().min(0),
  valorHoraOrdinaria: z.number().min(0),
  montoHorasExtras: z.number().min(0),
  bonos: z.array(BonoLiquidacionSchema),
  gratificacionLegal: z.number().min(0),
  totalImponible: z.number().min(0),
  // Haberes no imponibles.
  asignacionMovilizacion: z.number().min(0),
  asignacionColacion: z.number().min(0),
  asignacionFamiliarTramoId: IdEntidadSchema.optional(),
  cargas: z.number().int().min(0),
  montoAsignacionFamiliar: z.number().min(0),
  totalHaberes: z.number().min(0),
  // Descuentos legales y voluntarios.
  afpId: IdEntidadSchema.optional(),
  nombreAfp: z.string(),
  tasaAFP: z.number().min(0),
  montoAFP: z.number().min(0),
  saludId: IdEntidadSchema.optional(),
  nombreSalud: z.string(),
  saludTipo: z.enum(["fonasa", "isapre"]),
  saludPorcentaje: z.number().min(0).optional(),
  saludValorUF: z.number().min(0).optional(),
  ufAplicada: z.number().min(0).optional(),
  montoSalud: z.number().min(0),
  tasaSIS: z.number().min(0),
  montoSIS: z.number().min(0),
  montoSeguroCesantia: z.number().min(0),
  montoAPV: z.number().min(0),
  totalDescuentos: z.number().min(0),
  // Totales de control.
  descuentoAnticipos: z.number().min(0),
  adelantosIds: z.array(IdEntidadSchema),
  alcanceLiquido: z.number().min(0),
  liquidoAPagar: z.number().min(0),
  estado: z.enum(["borrador", "confirmada"]),
  // Referencia contable FI ("pendiente" hasta confirmar).
  egresoFIReferencia: z.string().optional(),
  proyeccionPEReferencia: z.string().optional(),
})

// --- Certificados (CT) ---

export const TIPOS_CERTIFICADO_CT = [
  "residencia",
  "estado_cuenta",
  "liquidacion_sueldo",
  "al_dia",
] as const
export const TipoCertificadoCTSchema = z.enum(TIPOS_CERTIFICADO_CT)

// Certificado oficial emitido: snapshot inmutable del contenido usado al
// generar el PDF + referencias D1 (la firma vive solo dentro del documento).
export const CertificadoCTSchema = z.object({
  id: IdEntidadSchema,
  folio: z.string().min(1, "El folio es obligatorio."),
  codigoVerificacion: z
    .string({ required_error: "El código de verificación es obligatorio." })
    .min(6, "El código de verificación debe tener al menos 6 caracteres."),
  tipo: TipoCertificadoCTSchema,
  unidadId: IdEntidadSchema.optional(),
  personaId: IdEntidadSchema.optional(),
  // Fuente del dato según tipología (vínculo VU, libro FI o liquidación PL).
  origenRef: IdEntidadSchema.optional(),
  solicitanteNombre: z
    .string({ required_error: "El solicitante es obligatorio." })
    .min(1, "Debe identificar al solicitante."),
  resumen: z
    .string({ required_error: "El resumen del certificado es obligatorio." })
    .min(1, "El resumen del certificado es obligatorio."),
  detalle: z.array(
    z.object({
      clave: z.string().min(1, "La clave del detalle es obligatoria."),
      valor: z.string().min(1, "El valor del detalle es obligatorio."),
    })
  ),
      // Firma digitalizada usada: SOLO referencia (D1), jamás binario embebido.
      firmaUrl: z
        .string()
        .max(2048, "La URL excede el largo permitido.")
        .refine((valor) => !/^data:/i.test(valor) && !/^blob:/i.test(valor), {
          message:
            "Media por referencia (D1): la firma debe ser una URL, no contenido embebido.",
        })
        .optional(),
      // Snapshot de la directiva vigente al emitir (trazabilidad histórica, no bloqueante).
      directivaRef: z
        .object({
          periodoId: IdEntidadSchema,
          firmantes: z.array(
            z.object({
              personaId: IdEntidadSchema,
              nombre: z.string().min(1),
              cargo: z.string().min(1),
            })
          ),
        })
        .optional(),
      fechaEmision: FechaISOSchema,
    })

// --- Reportería y Dashboards (RE) ---

export const BLOQUES_REPORTE_RE = [
  "gastos_mes",
  "bitacora_seguridad",
  "morosidad",
  "consumo_insumos",
] as const
export const BloqueReporteRESchema = z.enum(BLOQUES_REPORTE_RE)

// Reporte personalizado: bloques snapshot inmutables al generar + segmento
// declarado (EF+MP+tenencia). Los destinatarios se resuelven al distribuir.
export const ReporteRESchema = z.object({
  id: IdEntidadSchema,
  titulo: z
    .string({ required_error: "El título del reporte es obligatorio." })
    .min(3, "El título debe tener al menos 3 caracteres."),
  bloques: z
    .array(BloqueReporteRESchema)
    .min(1, "Selecciona al menos un bloque de información."),
  segmento: z.object({
    macroSectorIds: z.array(IdEntidadSchema),
    microSectorIds: z.array(IdEntidadSchema),
    unidadIds: z.array(IdEntidadSchema),
    perfiles: z.array(
      z.enum(["administracion", "personal", "propietario", "residente"])
    ),
    tenencias: z.array(z.enum(["propietarios", "arrendatarios"])),
  }),
  payloadSnapshot: z.array(
    z.object({
      bloque: BloqueReporteRESchema,
      lineas: z.array(
        z.object({
          etiqueta: z.string().min(1),
          valor: z.string().min(1),
        })
      ),
    })
  ),
  fechaGeneracion: FechaISOSchema,
  destinatariosPersonaId: z.array(IdEntidadSchema),
  distribuidoA: z.number().int().min(0),
  fechaDistribucion: FechaISOSchema.optional(),
})

// --- Utilidades de validación para el store ---

export type ResultadoValidacion<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export function formatoErrorZod(error: z.ZodError): string {
  const detalles = error.issues.map((issue) => {
    const campo = issue.path.join(".")
    return campo ? `${campo}: ${issue.message}` : issue.message
  })
  return `Datos inválidos: ${detalles.slice(0, 3).join("; ")}${detalles.length > 3 ? "…" : ""}`
}

export function validarConEsquema<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown
): ResultadoValidacion<z.infer<S>> {
  const resultado = schema.safeParse(input)
  if (resultado.success) return { ok: true, data: resultado.data }
  return { ok: false, error: formatoErrorZod(resultado.error) }
}

export function validarMaestro(
  key: string,
  item: unknown
): ResultadoValidacion<unknown> {
  const schema = MAESTRO_SCHEMAS[key as keyof typeof MAESTRO_SCHEMAS]
  if (!schema) return { ok: false, error: `Maestro "${key}" no soportado.` }
  return validarConEsquema(schema, item)
}
