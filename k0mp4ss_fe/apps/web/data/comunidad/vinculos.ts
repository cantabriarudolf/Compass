// Módulo VU - Vinculación de Unidades
// Relación entre Personas (MP) y Unidades físicas (EF).
// Mock realista: ~55 vinculos activos cubriendo ~55 unidades de 83 totales.

export type RolVinculo = "propietario" | "arrendatario" | "copropietario" | "ocupante";

export const ESTADOS_INMOBILIARIOS = [
  { id: "habitada", nombre: "Habitada", color: "bg-emerald-500 text-white" },
  { id: "proxima_vacancia", nombre: "Próxima Vacancia", color: "bg-amber-500 text-black" },
  { id: "en_arriendo", nombre: "En Arriendo", color: "bg-blue-500 text-white" },
  { id: "arrendada", nombre: "Arrendada", color: "bg-purple-500 text-white" },
  { id: "en_venta", nombre: "En Venta", color: "bg-rose-500 text-white" },
];

export interface VinculoUnidad {
  id: string;
  personaId: string;
  unidadId: string;
  rol: RolVinculo;
  fechaInicio: string;
  fechaFin?: string;
  // Trigger Inmobiliario (PI)
  estadoOcupacionPropiedad?: string;
  // Privacidad Delegada
  permiteVerFinanzas: boolean;
  // Cierre automático de tramo anterior (solo propietario/arrendatario)
  cerrarAnterior?: boolean;
}

export const vinculos: VinculoUnidad[] = [
  // ===== TORRE A (16 unidades) =====
  { id: "v-1",  personaId: "p-1",  unidadId: "u-A-101", rol: "propietario",  fechaInicio: "2024-01-15", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  { id: "v-11", personaId: "p-11", unidadId: "u-A-102", rol: "propietario",  fechaInicio: "2020-03-10", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  { id: "v-12", personaId: "p-12", unidadId: "u-A-103", rol: "arrendatario", fechaInicio: "2025-06-01", permiteVerFinanzas: false },
  { id: "v-13", personaId: "p-13", unidadId: "u-A-104", rol: "propietario",  fechaInicio: "2019-11-20", estadoOcupacionPropiedad: "en_venta",       permiteVerFinanzas: false },
  { id: "v-14", personaId: "p-14", unidadId: "u-A-201", rol: "propietario",  fechaInicio: "2021-05-08", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  { id: "v-15", personaId: "p-15", unidadId: "u-A-202", rol: "arrendatario", fechaInicio: "2024-09-01", permiteVerFinanzas: false },
  { id: "v-16", personaId: "p-16", unidadId: "u-A-203", rol: "propietario",  fechaInicio: "2022-07-15", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  { id: "v-17", personaId: "p-17", unidadId: "u-A-204", rol: "arrendatario", fechaInicio: "2025-02-01", permiteVerFinanzas: false },
  { id: "v-18", personaId: "p-18", unidadId: "u-A-301", rol: "propietario",  fechaInicio: "2018-04-20", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  // u-A-302: vacante
  // u-A-303: vacante
  // u-A-304: en-venta (propietario p-13 tiene u-A-104 en venta, este otro también)
  { id: "v-19", personaId: "p-13", unidadId: "u-A-304", rol: "propietario",  fechaInicio: "2023-08-10", estadoOcupacionPropiedad: "en_venta",       permiteVerFinanzas: false },
  // u-A-401: vacante
  // u-A-402: vacante
  // u-A-403: en-mantencion
  // u-A-404: vacante

  // ===== TORRE B (16 unidades) =====
  { id: "v-3",  personaId: "p-3",  unidadId: "u-B-201", rol: "propietario",  fechaInicio: "2020-05-10", estadoOcupacionPropiedad: "arrendada",      permiteVerFinanzas: false },
  { id: "v-2",  personaId: "p-2",  unidadId: "u-B-201", rol: "arrendatario", fechaInicio: "2025-01-01", permiteVerFinanzas: false },
  { id: "v-20", personaId: "p-19", unidadId: "u-B-101", rol: "propietario",  fechaInicio: "2021-03-15", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  { id: "v-21", personaId: "p-20", unidadId: "u-B-102", rol: "arrendatario", fechaInicio: "2025-04-01", permiteVerFinanzas: false },
  { id: "v-22", personaId: "p-21", unidadId: "u-B-103", rol: "propietario",  fechaInicio: "2020-09-20", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  { id: "v-23", personaId: "p-22", unidadId: "u-B-104", rol: "arrendatario", fechaInicio: "2024-11-01", permiteVerFinanzas: false },
  { id: "v-24", personaId: "p-23", unidadId: "u-B-202", rol: "propietario",  fechaInicio: "2019-06-10", estadoOcupacionPropiedad: "en_venta",       permiteVerFinanzas: false },
  { id: "v-25", personaId: "p-24", unidadId: "u-B-203", rol: "propietario",  fechaInicio: "2022-01-15", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  // u-B-204: vacante
  // u-B-301: vacante
  // u-B-302: vacante
  // u-B-303: vacante
  // u-B-304: en-venta
  { id: "v-26", personaId: "p-23", unidadId: "u-B-304", rol: "propietario",  fechaInicio: "2023-04-01", estadoOcupacionPropiedad: "en_venta",       permiteVerFinanzas: false },
  // u-B-401: vacante
  // u-B-402: vacante
  // u-B-403: vacante
  // u-B-404: vacante

  // ===== TORRE C (16 unidades) =====
  { id: "v-4",  personaId: "p-3",  unidadId: "u-C-301", rol: "propietario",  fechaInicio: "2023-11-20", estadoOcupacionPropiedad: "proxima_vacancia", permiteVerFinanzas: false },
  { id: "v-8",  personaId: "p-8",  unidadId: "u-C-301", rol: "arrendatario", fechaInicio: "2021-03-01", fechaFin: "2023-11-19", permiteVerFinanzas: false },
  { id: "v-27", personaId: "p-25", unidadId: "u-C-101", rol: "propietario",  fechaInicio: "2020-08-10", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  { id: "v-28", personaId: "p-26", unidadId: "u-C-102", rol: "propietario",  fechaInicio: "2019-12-05", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  { id: "v-29", personaId: "p-27", unidadId: "u-C-103", rol: "copropietario", fechaInicio: "2022-06-15", estadoOcupacionPropiedad: "habitada",     permiteVerFinanzas: true },
  { id: "v-30", personaId: "p-28", unidadId: "u-C-104", rol: "arrendatario", fechaInicio: "2025-03-01", permiteVerFinanzas: false },
  { id: "v-31", personaId: "p-3",  unidadId: "u-LC-01", rol: "propietario",  fechaInicio: "2021-02-14", estadoOcupacionPropiedad: "en_venta",       permiteVerFinanzas: false },
  { id: "v-32", personaId: "p-29", unidadId: "u-C-201", rol: "propietario",  fechaInicio: "2021-10-20", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  { id: "v-33", personaId: "p-30", unidadId: "u-C-202", rol: "arrendatario", fechaInicio: "2024-07-01", permiteVerFinanzas: false },
  // u-C-203: vacante
  // u-C-204: vacante
  // u-C-302: vacante
  // u-C-303: en-venta
  // u-C-304: vacante
  // u-C-401: vacante
  // u-C-402: vacante
  // u-C-403: vacante
  // u-C-404: vacante
  { id: "v-34", personaId: "p-31", unidadId: "u-C-303", rol: "propietario",  fechaInicio: "2023-02-01", estadoOcupacionPropiedad: "en_venta",       permiteVerFinanzas: false },

  // ===== TORRE D (16 unidades) =====
  { id: "v-5",  personaId: "p-4",  unidadId: "u-D-401", rol: "ocupante",    fechaInicio: "2022-02-01", permiteVerFinanzas: false },
  { id: "v-35", personaId: "p-33", unidadId: "u-D-101", rol: "propietario",  fechaInicio: "2020-11-10", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  { id: "v-36", personaId: "p-34", unidadId: "u-D-102", rol: "arrendatario", fechaInicio: "2024-10-01", permiteVerFinanzas: false },
  { id: "v-37", personaId: "p-35", unidadId: "u-D-103", rol: "propietario",  fechaInicio: "2019-08-20", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  // u-D-104: vacante
  { id: "v-38", personaId: "p-36", unidadId: "u-D-201", rol: "propietario",  fechaInicio: "2021-04-15", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  { id: "v-39", personaId: "p-37", unidadId: "u-D-202", rol: "arrendatario", fechaInicio: "2025-05-01", permiteVerFinanzas: false },
  // u-D-203: vacante
  { id: "v-40", personaId: "p-38", unidadId: "u-D-204", rol: "propietario",  fechaInicio: "2022-09-10", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  // u-D-301: vacante
  // u-D-302: en-venta
  { id: "v-41", personaId: "p-38", unidadId: "u-D-302", rol: "propietario",  fechaInicio: "2023-06-01", estadoOcupacionPropiedad: "en_venta",       permiteVerFinanzas: false },
  { id: "v-42", personaId: "p-39", unidadId: "u-D-303", rol: "propietario",  fechaInicio: "2020-07-20", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  // u-D-304: vacante
  // u-D-402: vacante
  // u-D-403: vacante
  // u-D-404: vacante

  // ===== TORRE E (16 unidades) =====
  { id: "v-43", personaId: "p-40", unidadId: "u-E-101", rol: "propietario",  fechaInicio: "2021-01-15", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  { id: "v-44", personaId: "p-41", unidadId: "u-E-102", rol: "arrendatario", fechaInicio: "2024-12-01", permiteVerFinanzas: false },
  { id: "v-45", personaId: "p-42", unidadId: "u-E-103", rol: "propietario",  fechaInicio: "2020-06-10", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  // u-E-104: vacante
  { id: "v-46", personaId: "p-43", unidadId: "u-E-201", rol: "propietario",  fechaInicio: "2019-10-20", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  { id: "v-47", personaId: "p-44", unidadId: "u-E-202", rol: "arrendatario", fechaInicio: "2025-06-01", permiteVerFinanzas: false },
  // u-E-203: vacante
  // u-E-204: vacante
  // u-E-301: vacante
  { id: "v-48", personaId: "p-45", unidadId: "u-E-302", rol: "propietario",  fechaInicio: "2022-03-15", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  // u-E-303: en-venta
  { id: "v-49", personaId: "p-45", unidadId: "u-E-303", rol: "propietario",  fechaInicio: "2023-09-01", estadoOcupacionPropiedad: "en_venta",       permiteVerFinanzas: false },
  { id: "v-50", personaId: "p-46", unidadId: "u-E-304", rol: "propietario",  fechaInicio: "2021-07-10", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  // u-E-401: vacante
  { id: "v-51", personaId: "p-47", unidadId: "u-E-402", rol: "propietario",  fechaInicio: "2020-04-20", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  // u-E-403: vacante
  // u-E-404: vacante

  // ===== LOCALES COMERCIALES (3 unidades) =====
  { id: "v-52", personaId: "p-48", unidadId: "u-LC-01", rol: "ocupante",    fechaInicio: "2023-01-15", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: false },
  { id: "v-53", personaId: "p-49", unidadId: "u-LC-02", rol: "arrendatario", fechaInicio: "2024-06-01", permiteVerFinanzas: false },
  // u-LC-03: vacante

  // ===== CASO: Propietario con múltiples unidades (p-3: Roberto) =====
  // Ya tiene: u-B-201 (arrendada), u-C-301 (próxima vacancia), u-LC-01 (local, vendido)
  // P-45 (Sebastián Muñoz) también tiene 2 unidades: u-E-302 + u-E-303

  // ===== CASO: Personal viviendo en el edificio (p-4: Ana María Silva) =====
  // Ya tiene: u-D-401 (ocupante) — conserje que vive en el edificio

  // ===== DIRECTIVA: p-51 y p-52 =====
  { id: "v-54", personaId: "p-51", unidadId: "u-A-402", rol: "propietario",  fechaInicio: "2019-03-01", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
  { id: "v-55", personaId: "p-52", unidadId: "u-E-404", rol: "propietario",  fechaInicio: "2020-01-15", estadoOcupacionPropiedad: "habitada",       permiteVerFinanzas: true },
];

export function vinculosPorPersona(personaId: string): VinculoUnidad[] {
  return vinculos.filter(v => v.personaId === personaId);
}

export function vinculosPorUnidad(unidadId: string): VinculoUnidad[] {
  return vinculos.filter(v => v.unidadId === unidadId);
}
