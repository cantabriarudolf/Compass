// Este archivo centraliza los maestros de estructura e inventario físico
// (EF: categorías estructurales, TU: tipos de unidad).
// Los maestros administrativos (AFP, bancos, fonasa, feriados, etc.) viven en data/admin/maestros.ts.
// Los parámetros globales de configuración (SMTP, cálculo de GC, seguridad) pertenecen al módulo CF - Configuración Global.

export const CATEGORIAS_MACRO = [
  { id: "torre", nombre: "Torre" },
  { id: "manzana", nombre: "Manzana" },
  { id: "etapa", nombre: "Etapa" },
  { id: "sector", nombre: "Sector" },
  { id: "parcela", nombre: "Parcela" },
  { id: "calle", nombre: "Calle" },
  { id: "edificio", nombre: "Edificio" },
  { id: "estacionamientos", nombre: "Estacionamientos" },
];

export const CATEGORIAS_MICRO = [
  { id: "piso", nombre: "Piso" },
  { id: "nivel", nombre: "Nivel" },
  { id: "pasaje", nombre: "Pasaje" },
  { id: "bloque", nombre: "Bloque" },
  { id: "no-aplica", nombre: "No Aplica" },
];

export const CATEGORIAS_UNIDAD = [
  { id: "depto", nombre: "Depto" },
  { id: "casa", nombre: "Casa" },
  { id: "local", nombre: "Local" },
  { id: "oficina", nombre: "Oficina" },
  { id: "bodega", nombre: "Bodega" },
  { id: "estacionamiento", nombre: "Estacionamiento" },
];

// Estados de ocupación/disponibilidad de unidades físicas (EF - Estructura Física).
// Alineados a la spec EF: (En Uso, En Arriendo, En Venta, En Mantención) + Vacante.
export const ESTADOS_OCUPACION = [
  { id: "vacante", nombre: "Vacante", color: "bg-emerald-500 text-white", hex: "#10b981" },
  { id: "en-uso", nombre: "En Uso", color: "bg-blue-500 text-white", hex: "#2563eb" },
  { id: "en-arriendo", nombre: "En Arriendo", color: "bg-purple-500 text-white", hex: "#a855f7" },
  { id: "en-venta", nombre: "En Venta", color: "bg-cyan-500 text-white", hex: "#0891b2" },
  { id: "en-mantencion", nombre: "En Mantención", color: "bg-amber-500 text-black", hex: "#f59e0b" },
];
