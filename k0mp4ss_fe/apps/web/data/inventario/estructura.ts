import { UnidadEtiqueta } from "../maestros";

export interface TarifaHistorica {
  id: string;
  monto: number;
  fechaVigencia: string;
  creadoEn: string;
}

export interface TipoUnidad {
  id: string;
  nombre: string;
  categoria: UnidadEtiqueta;
  metraje: number;
  montoBaseGc: number;
  descripcion?: string;
  activo: boolean;
  historialTarifas: TarifaHistorica[]; // <--- Trazabilidad Financiera Requerida por NSGC
}

export interface MacroSector {
  id: string;
  nombre: string;
  etiqueta: string;
  descripcion?: string;
}

export interface MicroSector {
  id: string;
  macroSectorId: string;
  nombre: string;
  etiqueta: string;
}

export interface Unidad {
  id: string;
  microSectorId: string;
  numero: string;
  etiqueta: UnidadEtiqueta;
  tipoUnidadId: string;
  metraje: number;
  prorrateo: number;
  rolSii: string;
  estadoId: string;
  servicios: {
    agua?: { cliente: string; medidor: string };
    luz?: { cliente: string; medidor: string };
    gas?: { cliente: string; medidor: string };
  };
}

export const tiposUnidad: TipoUnidad[] = [
  { 
    id: "tipo-a", 
    nombre: "Depto Tipo A", 
    categoria: "Depto", 
    metraje: 55.5, 
    montoBaseGc: 45000, 
    activo: true, 
    descripcion: "2D + 2B",
    historialTarifas: [
      { id: "t-a-1", monto: 42000, fechaVigencia: "2023-01-01", creadoEn: "2022-12-01" },
      { id: "t-a-2", monto: 45000, fechaVigencia: "2024-01-01", creadoEn: "2023-11-15" }
    ]
  },
  { 
    id: "tipo-b", 
    nombre: "Depto Tipo B", 
    categoria: "Depto", 
    metraje: 42.0, 
    montoBaseGc: 35000, 
    activo: true, 
    descripcion: "1D + 1B",
    historialTarifas: [
      { id: "t-b-1", monto: 35000, fechaVigencia: "2024-01-01", creadoEn: "2023-11-15" }
    ]
  },
  { 
    id: "local-a", 
    nombre: "Local Comercial A (Grande)", 
    categoria: "Local", 
    metraje: 120.0, 
    montoBaseGc: 95000, 
    activo: true, 
    descripcion: "Local Ancla",
    historialTarifas: [{ id: "t-la-1", monto: 95000, fechaVigencia: "2024-01-01", creadoEn: "2023-12-01" }]
  },
  { 
    id: "local-b", 
    nombre: "Local Comercial B (Estándar)", 
    categoria: "Local", 
    metraje: 60.0, 
    montoBaseGc: 50000, 
    activo: true, 
    descripcion: "Tienda Retail",
    historialTarifas: [{ id: "t-lb-1", monto: 50000, fechaVigencia: "2024-01-01", creadoEn: "2023-12-01" }]
  },
  { 
    id: "tipo-es-1", 
    nombre: "Estacionamiento Estándar", 
    categoria: "Estacionamiento", 
    metraje: 12.5, 
    montoBaseGc: 5000, 
    activo: true,
    historialTarifas: [{ id: "t-e-1", monto: 5000, fechaVigencia: "2024-01-01", creadoEn: "2023-12-01" }]
  },
];

export const macroSectores: MacroSector[] = [
  { id: "torre-a", nombre: "A", etiqueta: "Torre" },
  { id: "torre-b", nombre: "B", etiqueta: "Torre" },
  { id: "torre-c", nombre: "C", etiqueta: "Torre" },
  { id: "torre-d", nombre: "D", etiqueta: "Torre" },
  { id: "torre-e", nombre: "E", etiqueta: "Torre" },
  { id: "comercial", nombre: "Centro Comercial", etiqueta: "Sector", descripcion: "Locales de Servicios" },
];

export const microSectores: MicroSector[] = [
  ...macroSectores.filter(m => m.id.startsWith("torre")).flatMap(m => 
    [1, 2, 3, 4].map(p => ({
      id: `piso-${m.id}-${p}`,
      macroSectorId: m.id,
      nombre: `Piso ${p}`,
      etiqueta: "Piso"
    }))
  ),
  { id: "piso-comercial-1", macroSectorId: "comercial", nombre: "Calle", etiqueta: "Nivel" }
];

const estados = ["vacante", "en-uso", "en-arriendo", "en-venta", "en-mantencion"];

export const unidades: Unidad[] = [
  ...microSectores.filter(p => p.macroSectorId.startsWith("torre")).flatMap((p, pIdx) => 
    [1, 2, 3, 4].map(u => {
      const torreLetra = (p.macroSectorId.split("-")[1] ?? "").toUpperCase();
      const pisoNum = p.nombre.split(" ")[1] ?? "";
      const tipo = u <= 2 ? "tipo-a" : "tipo-b";
      return {
        id: `u-${torreLetra}-${pisoNum}0${u}`,
        microSectorId: p.id,
        numero: `${pisoNum}0${u}`,
        etiqueta: "Depto" as const,
        tipoUnidadId: tipo,
        metraje: tipo === "tipo-a" ? 55.5 : 42.0,
        prorrateo: 0.0125,
        rolSii: `123-${torreLetra}${pisoNum}${u}`,
        estadoId: estados[(pIdx + u) % estados.length] ?? "vacante",
        servicios: {
          agua: { cliente: `C-AG-${torreLetra}-${pisoNum}0${u}`, medidor: `M-1234` },
          luz: { cliente: `C-LZ-${torreLetra}-${pisoNum}0${u}`, medidor: `M-5678` }
        }
      };
    })
  ),
  { id: "u-LC-01", microSectorId: "piso-comercial-1", numero: "L-01", etiqueta: "Local" as const, tipoUnidadId: "local-a", metraje: 120.0, prorrateo: 0.05, rolSii: "999-01", estadoId: "en-uso", servicios: { agua: { cliente: "C-LC-01", medidor: "ML-01" } } },
  { id: "u-LC-02", microSectorId: "piso-comercial-1", numero: "L-02", etiqueta: "Local" as const, tipoUnidadId: "local-b", metraje: 60.0, prorrateo: 0.025, rolSii: "999-02", estadoId: "en-arriendo", servicios: { agua: { cliente: "C-LC-02", medidor: "ML-02" } } },
  { id: "u-LC-03", microSectorId: "piso-comercial-1", numero: "L-03", etiqueta: "Local" as const, tipoUnidadId: "local-b", metraje: 60.0, prorrateo: 0.025, rolSii: "999-03", estadoId: "vacante", servicios: { agua: { cliente: "C-LC-03", medidor: "ML-03" } } },
];
