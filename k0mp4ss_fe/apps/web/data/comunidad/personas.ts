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
}

// --- MOCK DATA ---

export const personas: Persona[] = [
  // 1. Propietario, Residente y Presidente (Caso Complejo 1)
  {
    id: "p-1",
    rut: "15.123.456-7",
    nombreCompleto: "Juan Pérez González",
    nombres: "Juan",
    apellidos: "Pérez González",
    email: "juan.perez@email.com",
    telefonoMovil: "+56 9 1234 5678",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: ["propietario", "residente", "directiva"],
    datosGobernanza: { id: "g-1", cargoDirectiva: "presidente", fechaAsuncion: "2025-03-01" }
  },
  // 2. Residente Puro (Arrendatario) con Vulnerabilidad
  {
    id: "p-2",
    rut: "18.987.654-3",
    nombreCompleto: "María López Soto",
    nombres: "María",
    apellidos: "López Soto",
    email: "maria.lopez@email.com",
    telefonoMovil: "+56 9 8765 4321",
    estadoCuenta: "activa",
    condicionesEspecialesIds: ["c-2"], // Movilidad Reducida
    roles: ["residente"],
  },
  // 3. Propietario Inversionista (No vive en el edificio, múltiples propiedades)
  {
    id: "p-3",
    rut: "12.345.678-9",
    nombreCompleto: "Roberto Gómez Bolaños",
    nombres: "Roberto",
    apellidos: "Gómez Bolaños",
    email: "roberto.gomez@email.com",
    telefonoMovil: "+56 9 5555 4444",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: ["propietario"],
  },
  // 4. Personal (Conserje) que además vive en el edificio
  {
    id: "p-4",
    rut: "19.111.222-K",
    nombreCompleto: "Ana María Silva",
    nombres: "Ana María",
    apellidos: "Silva",
    email: "ana.silva@email.com",
    telefonoMovil: "+56 9 9999 1111",
    estadoCuenta: "activa",
    condicionesEspecialesIds: ["c-1", "c-3"], // Electrodependiente y Adulto Mayor Solo
    roles: ["personal", "residente"],
    datosLaborales: { id: "l-1", cargo: "Conserje Turno Día", afp: "Habitat", prevision: "FONASA", fechaIngreso: "2021-06-15" }
  },
  // 5. Administrador (Rol: Personal, No Residente)
  {
    id: "p-5",
    rut: "13.555.666-8",
    nombreCompleto: "Carlos Castillo Ruiz",
    nombres: "Carlos",
    apellidos: "Castillo Ruiz",
    email: "admin@compass.cl",
    telefonoMovil: "+56 9 3333 7777",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: ["personal"],
    datosLaborales: { id: "l-2", cargo: "Administrador General", afp: "Cuprum", prevision: "Isapre Banmédica", fechaIngreso: "2023-01-01" }
  },
  // 6. Tesorero de la Directiva (Propietario y Residente)
  {
    id: "p-6",
    rut: "14.222.333-4",
    nombreCompleto: "Laura Martínez Cárdenas",
    nombres: "Laura",
    apellidos: "Martínez Cárdenas",
    email: "laura.tesoreria@email.com",
    telefonoMovil: "+56 9 8888 2222",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: ["propietario", "residente", "directiva"],
    datosGobernanza: { id: "g-2", cargoDirectiva: "tesorero", fechaAsuncion: "2025-03-01" }
  },
  // 7. Contratista Permanente (Mantenimiento Ascensores)
  {
    id: "p-7",
    rut: "17.444.555-6",
    nombreCompleto: "Pedro Valdés Orellana",
    nombres: "Pedro",
    apellidos: "Valdés Orellana",
    email: "pvaldes@ascensores.cl",
    telefonoMovil: "+56 9 6666 5555",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: ["contratista"],
    // Omitimos datosLaborales ya que es empresa externa, se mapeará en el futuro Módulo de Proveedores
  },
  // 8. Residente Inactivo (Antiguo Arrendatario para trazabilidad)
  {
    id: "p-8",
    rut: "20.123.987-5",
    nombreCompleto: "Tomás Alarcón",
    nombres: "Tomás",
    apellidos: "Alarcón",
    email: "tomas.alarcon.antiguo@email.com",
    telefonoMovil: "+56 9 1111 2222",
    estadoCuenta: "inactiva", // Se fue del edificio
    condicionesEspecialesIds: [],
    roles: ["residente"],
  },
  // 9. Trabajador de Aseo (Personal)
  {
    id: "p-9",
    rut: "11.234.567-0",
    nombreCompleto: "Rosa Meléndez",
    nombres: "Rosa",
    apellidos: "Meléndez",
    email: "rosa.aseo@email.com",
    telefonoMovil: "+56 9 4444 3333",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: ["personal"],
    datosLaborales: { id: "l-3", cargo: "Auxiliar de Aseo", afp: "Modelo", prevision: "FONASA", fechaIngreso: "2020-05-15" }
  },
  // 10. Cuenta Bloqueada (Arrendatario Moroso Extremo / Conflictivo)
  {
    id: "p-10",
    rut: "16.777.888-9",
    nombreCompleto: "Esteban Dido",
    nombres: "Esteban",
    apellidos: "Dido",
    email: "esteban.bloqueado@email.com",
    telefonoMovil: "+56 9 0000 0000",
    estadoCuenta: "bloqueada", // No puede usar amenidades
    condicionesEspecialesIds: [],
    roles: ["residente"],
  }
];
