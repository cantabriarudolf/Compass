import { unidades } from "./estructura";

export interface AsignacionHistorica {
  id: string;
  unidadId: string;
  fechaInicio: string;
  fechaFin?: string;
  asignadoA: string; 
}

export interface Estacionamiento {
  id: string;
  numero: string;
  ubicacion: string;
  metraje: number;
  prorrateo: number;
  unidadId?: string;
  macroSectorId?: string;
  asignadoA?: string;
  estadoId: string; // Vínculo dinámico al Maestro de Estados
  historial: AsignacionHistorica[]; 
}

export const estacionamientos: Estacionamiento[] = Array.from({ length: 100 }).map((_, i) => {
  const num = i + 1;
  const id = `es-${num}`;
  const numero = `P-${num.toString().padStart(3, '0')}`;
  const nivel = num <= 50 ? "Subterráneo -1" : "Subterráneo -2";
  
  let unidadId: string | undefined = undefined;
  let asignadoA = "Disponible";
  let macroSectorId = "torre-a";
  let historial: AsignacionHistorica[] = [];

  // MOCK DE HISTORIAL PARA ALGUNAS PLAZAS (Simulando rotación)
  if (num === 1) { // Caso con mucha rotación
    historial = [
      { id: `h-${id}-prev1`, unidadId: "old-1", asignadoA: "Constructora (Entrega)", fechaInicio: "2023-01-01", fechaFin: "2023-06-30" },
      { id: `h-${id}-prev2`, unidadId: "old-2", asignadoA: "Depto 204 (Ex-Dueño)", fechaInicio: "2023-07-01", fechaFin: "2023-12-31" },
      { id: `h-${id}-actual`, unidadId: "u-LC-01", asignadoA: "Local Comercial L-01 (Ancla)", fechaInicio: "2024-01-01" }
    ];
    unidadId = "u-LC-01";
    asignadoA = "Local Comercial L-01 (Ancla)";
    macroSectorId = "comercial";
  } else if (num === 15 || num === 30) { // Caso con un dueño anterior
    const u = unidades[num-1];
    historial = [
      { id: `h-${id}-prev`, unidadId: "old-x", asignadoA: "Residente Temporal", fechaInicio: "2023-10-01", fechaFin: "2024-01-15" },
      { id: `h-${id}-actual`, unidadId: u?.id || "", asignadoA: `Depto ${u?.numero} (Torre ${u?.id.split("-")[1]})`, fechaInicio: "2024-01-16" }
    ];
    unidadId = u?.id;
    asignadoA = `Depto ${u?.numero} (Torre ${u?.id.split("-")[1]})`;
    macroSectorId = `torre-${(u?.id.split("-")[1] ?? "").toLowerCase()}`;
  } else if (num <= 8) {
    const lId = num <= 4 ? "u-LC-01" : (num <= 6 ? "u-LC-02" : "u-LC-03");
    unidadId = lId;
    asignadoA = `Local Comercial ${lId.split("-")[2]}`;
    macroSectorId = "comercial";
    historial = [{ id: `h-${id}-1`, unidadId: lId, asignadoA: asignadoA, fechaInicio: "2024-01-01" }];
  } else if (num <= 88) {
    const uIdx = num - 9;
    const unidad = unidades[uIdx];
    if (unidad) {
      unidadId = unidad.id;
      const torreId = unidad.id.split("-")[1] ?? "";
      asignadoA = `Depto ${unidad.numero} (Torre ${torreId})`;
      macroSectorId = `torre-${torreId.toLowerCase()}`;
      historial = [{ id: `h-${id}-1`, unidadId: unidad.id, asignadoA: asignadoA, fechaInicio: "2024-02-15" }];
    }
  }

  return {
    id,
    numero,
    ubicacion: `${nivel}, Sector ${num % 2 === 0 ? 'Alfa' : 'Beta'}, Plaza ${numero}`,
    metraje: 12.5,
    prorrateo: 0.005,
    unidadId,
    macroSectorId,
    asignadoA,
    estadoId: unidadId ? "en-uso" : "vacante",
    historial
  };
});
