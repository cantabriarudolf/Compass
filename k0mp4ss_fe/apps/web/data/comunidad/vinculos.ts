// Módulo VU - Vinculación de Unidades
// Relación entre Personas (MP) y Unidades físicas (EF).

export type RolVinculo = "propietario" | "arrendatario" | "copropietario" | "ocupante";

export interface VinculoUnidad {
  id: string;
  personaId: string;
  unidadId: string;
  rol: RolVinculo;
  fechaInicio: string;
  fechaFin?: string;
  // Trigger Inmobiliario (PI)
  estadoOcupacionPropiedad?: "habitada" | "proxima_vacancia" | "en_arriendo" | "arrendada" | "en_venta";
  // Privacidad Delegada
  permiteVerFinanzas: boolean;
}

export const vinculos: VinculoUnidad[] = [
  { id: "v-1", personaId: "p-1", unidadId: "u-A-101", rol: "propietario", fechaInicio: "2024-01-15", estadoOcupacionPropiedad: "habitada", permiteVerFinanzas: true },
  { id: "v-2", personaId: "p-2", unidadId: "u-B-201", rol: "arrendatario", fechaInicio: "2025-01-01", permiteVerFinanzas: false },
  { id: "v-3", personaId: "p-3", unidadId: "u-B-201", rol: "propietario", fechaInicio: "2020-05-10", estadoOcupacionPropiedad: "arrendada", permiteVerFinanzas: false },
  { id: "v-4", personaId: "p-3", unidadId: "u-C-301", rol: "propietario", fechaInicio: "2023-11-20", estadoOcupacionPropiedad: "proxima_vacancia", permiteVerFinanzas: false },
  { id: "v-31", personaId: "p-3", unidadId: "u-LC-01", rol: "propietario", fechaInicio: "2021-02-14", estadoOcupacionPropiedad: "en_venta", permiteVerFinanzas: false },
  { id: "v-5", personaId: "p-4", unidadId: "u-D-401", rol: "ocupante", fechaInicio: "2022-02-01", permiteVerFinanzas: false },
  { id: "v-6", personaId: "p-6", unidadId: "u-A-102", rol: "propietario", fechaInicio: "2019-10-10", estadoOcupacionPropiedad: "habitada", permiteVerFinanzas: true },
  { id: "v-8", personaId: "p-8", unidadId: "u-C-301", rol: "arrendatario", fechaInicio: "2021-03-01", fechaFin: "2023-11-19", permiteVerFinanzas: false },
  { id: "v-10", personaId: "p-10", unidadId: "u-B-202", rol: "arrendatario", fechaInicio: "2024-08-01", permiteVerFinanzas: true },
];

export function vinculosPorPersona(personaId: string): VinculoUnidad[] {
  return vinculos.filter(v => v.personaId === personaId);
}

export function vinculosPorUnidad(unidadId: string): VinculoUnidad[] {
  return vinculos.filter(v => v.unidadId === unidadId);
}
