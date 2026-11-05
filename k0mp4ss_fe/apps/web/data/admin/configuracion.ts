// CF - Configuración Global de la Aplicación

export type ModoCalculoGC = "fijo" | "variable"
export type SeguridadSMTP = "ssl" | "tls" | "none"

export interface ConfiguracionGlobal {
  // 1. Identidad y Representación Legal
  nombreComunidad: string
  logoUrl?: string
  faviconUrl?: string
  rutComunidad: string
  direccionOficial: string
  administradorResponsable: string
  rutAdministrador: string
  telefonoAdmin: string
  firmaDigitalizadaUrl?: string

  // 2. Parametrización del Gasto Común
  modoCalculoGC: ModoCalculoGC
  diaCortePago: number
  limiteMesesAvisoCorte: number

  // 3. Configuración de Correo Electrónico (SMTP) — C2-final: smtpPassword solo env servidor (SMTP_PASSWORD)
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpSecurity: SeguridadSMTP
  smtpFrom: string
  smtpFromName: string
  smtpBcc?: string
  smtpRecepcion?: string

  // 4. Reglas y Opt-in de Módulos
  notificarEmisionGC: boolean
  notificarRegistroVisitas: boolean
  notificarEncomiendas: boolean
  notificarReservas: boolean
  notificarAvisosSistema: boolean
  notificarSugerenciasReclamos: boolean

  // 5. Parámetros Operativos y Seguridad — C2-final: claveEliminacionMaestro solo env servidor (CLAVE_ELIMINACION_MAESTRO)
  diasMesComercial: number
  diasVacacionesMes: number
  jornadaSemanalEstandar: number
}

export const configuracionDefault: ConfiguracionGlobal = {
  nombreComunidad: "Edificio Plaza Central",
  rutComunidad: "77.123.456-9",
  direccionOficial: "Av. Libertador 1234, Santiago",
  administradorResponsable: "Carlos Castillo Ruiz",
  rutAdministrador: "13.555.666-1",
  telefonoAdmin: "+56 9 3333 7777",

  modoCalculoGC: "variable",
  diaCortePago: 5,
  limiteMesesAvisoCorte: 3,

  // Correos: `smtpUser` y `smtpFrom` son obligatorios y no vacíos en
  // ConfiguracionGlobalSchema, así que llevan un buzón de dominio reservado
  // (`.test`, RFC 2606) que no puede pertenecer a ninguna comunidad real.
  // `smtpBcc` y `smtpRecepcion` son nullable: una comunidad nueva no hereda
  // buzones ajenos y el seed escribe NULL (sin BCC ni Reply-To) hasta que el
  // administrador los configure.
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  smtpUser: "correo@comunidad.test",
  smtpSecurity: "tls",
  smtpFrom: "correo@comunidad.test",
  smtpFromName: "Administración Edificio Plaza Central",
  smtpBcc: undefined,
  smtpRecepcion: undefined,

  notificarEmisionGC: true,
  notificarRegistroVisitas: true,
  notificarEncomiendas: true,
  notificarReservas: true,
  notificarAvisosSistema: true,
  notificarSugerenciasReclamos: true,

  diasMesComercial: 30,
  diasVacacionesMes: 1.25,
  jornadaSemanalEstandar: 45,
}
