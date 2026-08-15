// CF - Configuración Global de la Aplicación

export type ModoCalculoGC = "fijo" | "variable";
export type SeguridadSMTP = "ssl" | "tls" | "none";

export interface ConfiguracionGlobal {
  // 1. Identidad y Representación Legal
  nombreComunidad: string;
  logoUrl?: string;
  faviconUrl?: string;
  rutCondominio: string;
  direccionOficial: string;
  administradorResponsable: string;
  rutAdministrador: string;
  telefonoAdmin: string;
  firmaDigitalizadaUrl?: string;

  // 2. Parametrización del Gasto Común
  modoCalculoGC: ModoCalculoGC;
  diaCortePago: number;
  limiteMesesAvisoCorte: number;

  // 3. Configuración de Correo Electrónico (SMTP)
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string; // en producción encriptado
  smtpSecurity: SeguridadSMTP;
  smtpFrom: string;
  smtpFromName: string;
  smtpBcc?: string;
  smtpRecepcion?: string;

  // 4. Reglas y Opt-in de Módulos
  notificarEmisionGC: boolean;
  notificarRegistroVisitas: boolean;
  notificarEncomiendas: boolean;
  notificarReservas: boolean;
  notificarAvisosSistema: boolean;
  notificarSugerenciasReclamos: boolean;

  // 5. Parámetros Operativos y Seguridad
  diasMesComercial: number;
  diasVacacionesMes: number;
  jornadaSemanalEstandar: number;
  claveEliminacionMaestro: string;
}

export const configuracionDefault: ConfiguracionGlobal = {
  nombreComunidad: "Edificio Plaza Central",
  rutCondominio: "77.123.456-7",
  direccionOficial: "Av. Libertador 1234, Santiago",
  administradorResponsable: "Carlos Castillo Ruiz",
  rutAdministrador: "13.555.666-8",
  telefonoAdmin: "+56 9 3333 7777",

  modoCalculoGC: "variable",
  diaCortePago: 5,
  limiteMesesAvisoCorte: 3,

  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  smtpUser: "gdcuentas@sgc.cl",
  smtpPassword: "",
  smtpSecurity: "tls",
  smtpFrom: "gdcuentas@sgc.cl",
  smtpFromName: "Administración Edificio Plaza Central",
  smtpBcc: "auditoria@sgc.cl",
  smtpRecepcion: "conserjeria@sgc.cl",

  notificarEmisionGC: true,
  notificarRegistroVisitas: true,
  notificarEncomiendas: true,
  notificarReservas: true,
  notificarAvisosSistema: true,
  notificarSugerenciasReclamos: true,

  diasMesComercial: 30,
  diasVacacionesMes: 1.25,
  jornadaSemanalEstandar: 45,
  claveEliminacionMaestro: "",
};
