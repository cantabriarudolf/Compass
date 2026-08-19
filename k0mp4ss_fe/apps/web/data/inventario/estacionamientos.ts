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
  estadoId: string;
  historial: AsignacionHistorica[]; 
}

const ESTADOS = ["vacante", "en-uso", "en-arriendo", "en-venta", "en-mantencion"];
const UBICACIONES = ["Superficie", "Subterráneo -1", "Subterráneo -2", "Sector Visitas"];
const MACROS = ["torre-a", "torre-b", "torre-c", "torre-d", "torre-e", "comercial"];

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length] as T;
}

export const estacionamientos: Estacionamiento[] = Array.from({ length: 100 }).map((_, i) => {
  const num = i + 1;
  const id = `es-${num}`;
  const numero = `P-${num.toString().padStart(3, '0')}`;

  const ubicacion = pick(UBICACIONES, num);
  const macroSectorId = pick(MACROS, num * 3 + 7);

  const estadoIdx = num % 10;
  let estadoId: string;
  if (estadoIdx < 2) estadoId = "vacante";
  else if (estadoIdx < 6) estadoId = "en-uso";
  else if (estadoIdx < 7) estadoId = "en-arriendo";
  else if (estadoIdx < 8) estadoId = "en-venta";
  else estadoId = "en-mantencion";

  let unidadId: string | undefined = undefined;
  let asignadoA = "Disponible";
  const historial: AsignacionHistorica[] = [];

  if (estadoId === "vacante") {
    asignadoA = "Disponible";
  } else if (estadoId === "en-uso") {
    const u = unidades[num % unidades.length];
    if (u) {
      unidadId = u.id;
      const torreId = u.id.split("-")[1] ?? "";
      asignadoA = `Depto ${u.numero} (Torre ${torreId})`;
      historial.push({ id: `h-${id}-1`, unidadId: u.id, asignadoA, fechaInicio: "2024-01-15" });
    }
  } else if (estadoId === "en-arriendo") {
    const inquilinos = ["Inquilino Pérez", "Inquilino Gómez", "Inquilino López", "Inquilino Rojas", "Inquilino Muñoz"];
    asignadoA = pick(inquilinos, num);
    const u = unidades[num % unidades.length];
    if (u) unidadId = u.id;
    historial.push({ id: `h-${id}-1`, unidadId: unidadId || "", asignadoA, fechaInicio: "2024-03-01" });
  } else if (estadoId === "en-venta") {
    asignadoA = "Disponible (Venta)";
    historial.push({ id: `h-${id}-1`, unidadId: "", asignadoA: "En proceso de venta", fechaInicio: "2024-06-01" });
  } else {
    asignadoA = "En mantención preventiva";
    historial.push({ id: `h-${id}-1`, unidadId: "", asignadoA, fechaInicio: "2024-07-15" });
  }

  return {
    id,
    numero,
    ubicacion: `${ubicacion}, Plaza ${numero}`,
    metraje: 12.5,
    prorrateo: 0.005,
    unidadId,
    macroSectorId,
    asignadoA,
    estadoId,
    historial,
  };
});
