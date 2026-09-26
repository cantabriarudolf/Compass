import { VinculoUnidad } from "./vinculos"

// --- INTERFACES ---

export type { VinculoUnidad } from "./vinculos";
export type { RolVinculo } from "./vinculos";

export interface ExtensionLaboral {
  id: string;
  cargo: string;
  afp: string;
  prevision: string;
  fechaIngreso: string;
}

export interface ExtensionGobernanza {
  id: string;
  cargoDirectiva: "presidente" | "tesorero" | "secretario" | "director";
  firmaDigital?: string;
  fechaAsuncion: string;
}

export interface Persona {
  id: string; // En el sistema real esto es el RUT, aquí un UUID mock
  rut: string;
  nombreCompleto: string;
  nombres: string;
  apellidos: string;
  email: string;
  telefonoMovil: string;
  telefonoFijo?: string;
  fotografiaUrl?: string;
  estadoCuenta: "activa" | "inactiva" | "bloqueada";
  
  // Vulnerabilidades (referencia a IDs de MA)
  condicionesEspecialesIds: string[]; 
  
  // Roles activos que determinan qué extensiones cargar en UI
  roles: ("propietario" | "residente" | "personal" | "directiva" | "contratista")[];

  // Tablas de Extensión (Mocking joins)
  vinculosUnidad?: VinculoUnidad[];
  datosLaborales?: ExtensionLaboral;
  datosGobernanza?: ExtensionGobernanza;
  // CV: autoriza a la persona como firmante de comunicaciones vecinales.
  // Contrato compartido con PersonaSchema (opcional), API /api/personas y
  // Prisma (Boolean?). Opcional para no obligar a todos los seeds.
  permiteCreacionManualCV?: boolean;
}

// --- MOCK DATA ---
// ~55 personas cubriendo ~55 unidades de 83 totales (realismo residencial + comercial)

export const personas: Persona[] = [
  // ===== TORRE A =====
  {
    id: "p-1", rut: "15.123.456-9", nombreCompleto: "Juan Pérez González", nombres: "Juan", apellidos: "Pérez González",
    email: "juan.perez@email.com", telefonoMovil: "+56 9 1234 5678", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario", "residente", "directiva"],
    datosGobernanza: { id: "g-1", cargoDirectiva: "presidente", fechaAsuncion: "2025-03-01" }
  },
  {
    id: "p-11", rut: "17.234.567-0", nombreCompleto: "Carolina Espinoza Rojas", nombres: "Carolina", apellidos: "Espinoza Rojas",
    email: "c.espinoza@email.com", telefonoMovil: "+56 9 2345 6789", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario", "residente"]
  },
  {
    id: "p-12", rut: "18.345.678-4", nombreCompleto: "Rodrigo Fuentes Salas", nombres: "Rodrigo", apellidos: "Fuentes Salas",
    email: "r.fuentes@email.com", telefonoMovil: "+56 9 3456 7890", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["residente"]
  },
  {
    id: "p-13", rut: "19.456.789-8", nombreCompleto: "Valentina Reyes López", nombres: "Valentina", apellidos: "Reyes López",
    email: "v.reyes@email.com", telefonoMovil: "+56 9 4567 8901", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario"]
  },
  {
    id: "p-14", rut: "20.567.890-5", nombreCompleto: "Felipe Morales Díaz", nombres: "Felipe", apellidos: "Morales Díaz",
    email: "f.morales@email.com", telefonoMovil: "+56 9 5678 9012", estadoCuenta: "activa",
    condicionesEspecialesIds: ["c-2"], roles: ["propietario", "residente"]
  },
  {
    id: "p-15", rut: "14.678.901-3", nombreCompleto: "Isidora Catalán Vargas", nombres: "Isidora", apellidos: "Catalán Vargas",
    email: "i.catalan@email.com", telefonoMovil: "+56 9 6789 0123", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["residente"]
  },
  {
    id: "p-16", rut: "16.789.012-1", nombreCompleto: "Martín Sepúlveda Castro", nombres: "Martín", apellidos: "Sepúlveda Castro",
    email: "m.sepulveda@email.com", telefonoMovil: "+56 9 7890 1234", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario", "residente"]
  },
  {
    id: "p-17", rut: "18.890.123-9", nombreCompleto: "Constanza Bravo Muñoz", nombres: "Constanza", apellidos: "Bravo Muñoz",
    email: "c.bravo@email.com", telefonoMovil: "+56 9 8901 2345", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["residente"]
  },
  {
    id: "p-18", rut: "19.901.234-7", nombreCompleto: "Andrés Villanueva Soto", nombres: "Andrés", apellidos: "Villanueva Soto",
    email: "a.villanueva@email.com", telefonoMovil: "+56 9 9012 3456", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario"]
  },

  // ===== TORRE B =====
  {
    id: "p-2", rut: "18.987.654-8", nombreCompleto: "María López Soto", nombres: "María", apellidos: "López Soto",
    email: "maria.lopez@email.com", telefonoMovil: "+56 9 8765 4321", estadoCuenta: "activa",
    condicionesEspecialesIds: ["c-2"], roles: ["residente"]
  },
  {
    id: "p-3", rut: "12.345.678-5", nombreCompleto: "Roberto Gómez Bolaños", nombres: "Roberto", apellidos: "Gómez Bolaños",
    email: "roberto.gomez@email.com", telefonoMovil: "+56 9 5555 4444", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario"]
  },
  {
    id: "p-19", rut: "15.111.222-6", nombreCompleto: "Fernanda Toro Gutiérrez", nombres: "Fernanda", apellidos: "Toro Gutiérrez",
    email: "f.toro@email.com", telefonoMovil: "+56 9 1111 2233", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario", "residente"]
  },
  {
    id: "p-20", rut: "16.222.333-K", nombreCompleto: "Sebastián Contreras Vega", nombres: "Sebastián", apellidos: "Contreras Vega",
    email: "s.contreras@email.com", telefonoMovil: "+56 9 2222 3344", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["residente"]
  },
  {
    id: "p-21", rut: "17.333.444-3", nombreCompleto: "Javiera Navarro Ríos", nombres: "Javiera", apellidos: "Navarro Ríos",
    email: "j.navarro@email.com", telefonoMovil: "+56 9 3333 4455", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario", "residente"]
  },
  {
    id: "p-22", rut: "18.444.555-7", nombreCompleto: "Diego Arriagada Peña", nombres: "Diego", apellidos: "Arriagada Peña",
    email: "d.arriagada@email.com", telefonoMovil: "+56 9 4444 5566", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["residente"]
  },
  {
    id: "p-23", rut: "19.555.666-0", nombreCompleto: "Camila Herrera Soto", nombres: "Camila", apellidos: "Herrera Soto",
    email: "c.herrera@email.com", telefonoMovil: "+56 9 5555 6677", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario"]
  },
  {
    id: "p-24", rut: "20.666.777-K", nombreCompleto: "Gabriel Mardones Lizana", nombres: "Gabriel", apellidos: "Mardones Lizana",
    email: "g.mardones@email.com", telefonoMovil: "+56 9 6666 7788", estadoCuenta: "activa",
    condicionesEspecialesIds: ["c-1"], roles: ["propietario", "residente"]
  },

  // ===== TORRE C =====
  {
    id: "p-25", rut: "14.777.888-0", nombreCompleto: "Paula Quiroz Espinoza", nombres: "Paula", apellidos: "Quiroz Espinoza",
    email: "p.quiroz@email.com", telefonoMovil: "+56 9 7777 8899", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario", "residente"]
  },
  {
    id: "p-26", rut: "15.888.999-4", nombreCompleto: "Cristóbal Flores Aguirre", nombres: "Cristóbal", apellidos: "Flores Aguirre",
    email: "c.flores@email.com", telefonoMovil: "+56 9 8888 9900", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario"]
  },
  {
    id: "p-27", rut: "16.999.000-K", nombreCompleto: "Florencia Riquelme Díaz", nombres: "Florencia", apellidos: "Riquelme Díaz",
    email: "f.riquelme@email.com", telefonoMovil: "+56 9 9999 0011", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["residente"]
  },
  {
    id: "p-28", rut: "17.000.111-7", nombreCompleto: "Tomás Pinto Vergara", nombres: "Tomás", apellidos: "Pinto Vergara",
    email: "t.pinto@email.com", telefonoMovil: "+56 9 0000 1122", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["residente"]
  },
  {
    id: "p-29", rut: "18.111.222-0", nombreCompleto: "Javiera Solís Muñoz", nombres: "Javiera", apellidos: "Solís Muñoz",
    email: "j.solis@email.com", telefonoMovil: "+56 9 1111 2244", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario", "residente"]
  },
  {
    id: "p-30", rut: "19.222.333-4", nombreCompleto: "Alejandro Guzmán Rojas", nombres: "Alejandro", apellidos: "Guzmán Rojas",
    email: "a.guzman@email.com", telefonoMovil: "+56 9 2222 3355", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["residente"]
  },
  {
    id: "p-31", rut: "20.333.444-3", nombreCompleto: "Macarena Silva Fuentes", nombres: "Macarena", apellidos: "Silva Fuentes",
    email: "m.silva@email.com", telefonoMovil: "+56 9 3333 4466", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario"]
  },
  {
    id: "p-32", rut: "14.444.555-4", nombreCompleto: "Nicolás Vega Soto", nombres: "Nicolás", apellidos: "Vega Soto",
    email: "n.vega@email.com", telefonoMovil: "+56 9 4444 5577", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario", "residente"]
  },

  // ===== TORRE D =====
  {
    id: "p-4", rut: "19.111.222-9", nombreCompleto: "Ana María Silva", nombres: "Ana María", apellidos: "Silva",
    email: "ana.silva@email.com", telefonoMovil: "+56 9 9999 1111", estadoCuenta: "activa",
    condicionesEspecialesIds: ["c-1", "c-3"], roles: ["personal", "residente"],
    datosLaborales: { id: "l-1", cargo: "Conserje Turno Día", afp: "Habitat", prevision: "FONASA", fechaIngreso: "2021-06-15" }
  },
  {
    id: "p-33", rut: "15.555.666-8", nombreCompleto: "Francisca León Contreras", nombres: "Francisca", apellidos: "León Contreras",
    email: "f.leon@email.com", telefonoMovil: "+56 9 5555 6688", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario", "residente"]
  },
  {
    id: "p-34", rut: "16.666.777-1", nombreCompleto: "Ignacio Aguilera Pizarro", nombres: "Ignacio", apellidos: "Aguilera Pizarro",
    email: "i.aguilera@email.com", telefonoMovil: "+56 9 6666 7799", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["residente"]
  },
  {
    id: "p-35", rut: "17.777.888-5", nombreCompleto: "Daniela Muñoz Rojas", nombres: "Daniela", apellidos: "Muñoz Rojas",
    email: "d.munoz@email.com", telefonoMovil: "+56 9 7777 8800", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario"]
  },
  {
    id: "p-36", rut: "18.888.999-9", nombreCompleto: "Mateo Castillo Vera", nombres: "Mateo", apellidos: "Castillo Vera",
    email: "m.castillo@email.com", telefonoMovil: "+56 9 8888 9911", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario", "residente"]
  },
  {
    id: "p-37", rut: "19.999.000-4", nombreCompleto: "Agustina Reyes Soto", nombres: "Agustina", apellidos: "Reyes Soto",
    email: "a.reyes@email.com", telefonoMovil: "+56 9 9999 0022", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["residente"]
  },
  {
    id: "p-38", rut: "20.000.111-7", nombreCompleto: "Lucas Espinoza Figueroa", nombres: "Lucas", apellidos: "Espinoza Figueroa",
    email: "l.espinoza@email.com", telefonoMovil: "+56 9 0000 1133", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario"]
  },
  {
    id: "p-39", rut: "14.111.222-8", nombreCompleto: "Isabella Vergara Muñoz", nombres: "Isabella", apellidos: "Vergara Muñoz",
    email: "i.vergara@email.com", telefonoMovil: "+56 9 1111 2255", estadoCuenta: "activa",
    condicionesEspecialesIds: ["c-2"], roles: ["propietario", "residente"]
  },

  // ===== TORRE E =====
  {
    id: "p-40", rut: "15.222.333-1", nombreCompleto: "Catalina Díaz Peña", nombres: "Catalina", apellidos: "Díaz Peña",
    email: "c.diaz@email.com", telefonoMovil: "+56 9 2222 3366", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario", "residente"]
  },
  {
    id: "p-41", rut: "16.333.444-5", nombreCompleto: "Benjamín Vargas Rojas", nombres: "Benjamín", apellidos: "Vargas Rojas",
    email: "b.vargas@email.com", telefonoMovil: "+56 9 3333 4477", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["residente"]
  },
  {
    id: "p-42", rut: "17.444.555-9", nombreCompleto: "Fernanda Soto Espinoza", nombres: "Fernanda", apellidos: "Soto Espinoza",
    email: "f.soto@email.com", telefonoMovil: "+56 9 4444 5588", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario", "residente"]
  },
  {
    id: "p-43", rut: "18.555.666-2", nombreCompleto: "Vicente Lara Contreras", nombres: "Vicente", apellidos: "Lara Contreras",
    email: "v.lara@email.com", telefonoMovil: "+56 9 5555 6699", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario"]
  },
  {
    id: "p-44", rut: "19.666.777-6", nombreCompleto: "Antonia Ríos Fuentes", nombres: "Antonia", apellidos: "Ríos Fuentes",
    email: "a.rios@email.com", telefonoMovil: "+56 9 6666 7700", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["residente"]
  },
  {
    id: "p-45", rut: "20.777.888-5", nombreCompleto: "Sebastián Muñoz Soto", nombres: "Sebastián", apellidos: "Muñoz Soto",
    email: "s.munoz@email.com", telefonoMovil: "+56 9 7777 8811", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario", "residente"]
  },
  {
    id: "p-46", rut: "14.888.999-6", nombreCompleto: "Amanda Carvajal Reyes", nombres: "Amanda", apellidos: "Carvajal Reyes",
    email: "a.carvajal@email.com", telefonoMovil: "+56 9 8888 9922", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario"]
  },
  {
    id: "p-47", rut: "15.999.000-1", nombreCompleto: "Joaquín Figueroa Silva", nombres: "Joaquín", apellidos: "Figueroa Silva",
    email: "j.figueroa@email.com", telefonoMovil: "+56 9 9999 0033", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario", "residente"]
  },

  // ===== LOCALES COMERCIALES =====
  {
    id: "p-48", rut: "11.222.333-9", nombreCompleto: "Restaurant El Buen Sabor SpA", nombres: "Restaurant El Buen Sabor", apellidos: "SpA",
    email: "contacto@buensabor.cl", telefonoMovil: "+56 9 1234 5001", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["contratista"]
  },
  {
    id: "p-49", rut: "12.333.444-2", nombreCompleto: "Farmacia Salud Total SpA", nombres: "Farmacia Salud Total", apellidos: "SpA",
    email: "info@saludtotal.cl", telefonoMovil: "+56 9 1234 5002", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["contratista"]
  },

  // ===== PERSONAL / ADMIN =====
  {
    id: "p-5", rut: "13.555.666-1", nombreCompleto: "Carlos Castillo Ruiz", nombres: "Carlos", apellidos: "Castillo Ruiz",
    email: "admin@compass.cl", telefonoMovil: "+56 9 3333 7777", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["personal"],
    datosLaborales: { id: "l-2", cargo: "Administrador General", afp: "Cuprum", prevision: "Isapre Banmédica", fechaIngreso: "2023-01-01" }
  },
  {
    id: "p-6", rut: "14.222.333-3", nombreCompleto: "Laura Martínez Cárdenas", nombres: "Laura", apellidos: "Martínez Cárdenas",
    email: "laura.tesoreria@email.com", telefonoMovil: "+56 9 8888 2222", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario", "residente", "directiva"],
    datosGobernanza: { id: "g-2", cargoDirectiva: "tesorero", fechaAsuncion: "2025-03-01" }
  },
  {
    id: "p-7", rut: "17.444.555-9", nombreCompleto: "Pedro Valdés Orellana", nombres: "Pedro", apellidos: "Valdés Orellana",
    email: "pvaldes@ascensores.cl", telefonoMovil: "+56 9 6666 5555", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["contratista"]
  },
  {
    id: "p-9", rut: "11.234.567-1", nombreCompleto: "Rosa Meléndez", nombres: "Rosa", apellidos: "Meléndez",
    email: "rosa.aseo@email.com", telefonoMovil: "+56 9 4444 3333", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["personal"],
    datosLaborales: { id: "l-3", cargo: "Auxiliar de Aseo", afp: "Modelo", prevision: "FONASA", fechaIngreso: "2020-05-15" }
  },

  // ===== CASOS ESPECIALES =====
  {
    id: "p-8", rut: "20.123.987-7", nombreCompleto: "Tomás Alarcón", nombres: "Tomás", apellidos: "Alarcón",
    email: "tomas.alarcon.antiguo@email.com", telefonoMovil: "+56 9 1111 2222", estadoCuenta: "inactiva",
    condicionesEspecialesIds: [], roles: ["residente"]
  },
  {
    id: "p-10", rut: "16.777.888-7", nombreCompleto: "Esteban Dido", nombres: "Esteban", apellidos: "Dido",
    email: "esteban.bloqueado@email.com", telefonoMovil: "+56 9 0000 0000", estadoCuenta: "bloqueada",
    condicionesEspecialesIds: [], roles: ["residente"]
  },
  {
    id: "p-50", rut: "18.000.111-5", nombreCompleto: "Rodrigo Paredes Flores", nombres: "Rodrigo", apellidos: "Paredes Flores",
    email: "r.paredes@email.com", telefonoMovil: "+56 9 0000 1144", estadoCuenta: "inactiva",
    condicionesEspecialesIds: [], roles: ["residente"]
  },

  // ===== DIRECTIVA ADICIONAL =====
  {
    id: "p-51", rut: "19.111.222-9", nombreCompleto: "Marcela Toro Espinoza", nombres: "Marcela", apellidos: "Toro Espinoza",
    email: "m.toro@email.com", telefonoMovil: "+56 9 1111 2266", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario", "residente", "directiva"],
    datosGobernanza: { id: "g-3", cargoDirectiva: "secretario", fechaAsuncion: "2025-03-01" }
  },
  {
    id: "p-52", rut: "20.222.333-8", nombreCompleto: "Alejandro Fuentes Riquelme", nombres: "Alejandro", apellidos: "Fuentes Riquelme",
    email: "a.fuentes@email.com", telefonoMovil: "+56 9 2222 3377", estadoCuenta: "activa",
    condicionesEspecialesIds: [], roles: ["propietario", "residente", "directiva"],
    datosGobernanza: { id: "g-4", cargoDirectiva: "director", fechaAsuncion: "2025-03-01" }
  },

  // ===== VACÍOS (Cuenta inactiva/bloqueada sin vínculos) =====
  {
    id: "p-53", rut: "15.333.444-7", nombreCompleto: "Claudia Soto Vargas", nombres: "Claudia", apellidos: "Soto Vargas",
    email: "c.soto@email.com", telefonoMovil: "+56 9 3333 4488", estadoCuenta: "inactiva",
    condicionesEspecialesIds: [], roles: ["residente"]
  },
  {
    id: "p-54", rut: "16.444.555-0", nombreCompleto: "Patricio Lagos Muñoz", nombres: "Patricio", apellidos: "Lagos Muñoz",
    email: "p.lagos@email.com", telefonoMovil: "+56 9 4444 5599", estadoCuenta: "bloqueada",
    condicionesEspecialesIds: [], roles: ["residente"]
  },
];
