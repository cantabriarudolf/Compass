// Este archivo centraliza los maestros de estructura e inventario físico
// (EF: categorías estructurales, TU: tipos de unidad, ES: estacionamientos).
// Los maestros administrativos (AFP, bancos, fonasa, feriados, etc.) viven en data/admin/maestros.ts.
// Los parámetros globales de configuración (SMTP, cálculo de GC, seguridad) pertenecen al módulo CF - Configuración Global.

export type UnidadEtiqueta =
  | "Depto"
  | "Casa"
  | "Local"
  | "Oficina"
  | "Bodega"
  | "Estacionamiento";

export const CATEGORIAS_MACRO = [
  { id: "torre", nombre: "Torre" },
  { id: "manzana", nombre: "Manzana" },
  { id: "etapa", nombre: "Etapa" },
  { id: "sector", nombre: "Sector" },
  { id: "parcela", nombre: "Parcela" },
  { id: "calle", nombre: "Calle" },
  { id: "edificio", nombre: "Edificio" },
];

export const CATEGORIAS_MICRO = [
  { id: "piso", nombre: "Piso" },
  { id: "nivel", nombre: "Nivel" },
  { id: "pasaje", nombre: "Pasaje" },
  { id: "bloque", nombre: "Bloque" },
  { id: "no-aplica", nombre: "No Aplica" },
];

export const CATEGORIAS_UNIDAD = [
  { id: "depto", nombre: "Departamento" },
  { id: "casa", nombre: "Casa" },
  { id: "local", nombre: "Local" },
  { id: "oficina", nombre: "Oficina" },
  { id: "bodega", nombre: "Bodega" },
  { id: "estacionamiento", nombre: "Estacionamiento" },
];

export const ESTADOS_OCUPACION = [
  { id: "vacante", nombre: "Vacante", color: "bg-emerald-500 text-white hover:bg-emerald-600 border-none" },
  { id: "ocupado-prop", nombre: "Ocupado Propietario", color: "bg-blue-600 text-white hover:bg-blue-700 border-none" },
  { id: "arrendado", nombre: "Arrendado", color: "bg-purple-600 text-white hover:bg-purple-700 border-none" },
  { id: "juicio", nombre: "En Juicio / Legal", color: "bg-rose-600 text-white hover:bg-rose-700 border-none" },
  { id: "mantencion", nombre: "En Mantención", color: "bg-amber-500 text-black hover:bg-amber-600 border-none" },
  { id: "vacio", nombre: "Vacío", color: "bg-zinc-400 text-black hover:bg-zinc-500 border-none" },
  { id: "inactivo", nombre: "Inactivo", color: "bg-zinc-900 text-white hover:bg-black border-none" },
];

export const UBICACIONES_ESTACIONAMIENTO = [
  { id: "superficie", nombre: "Superficie" },
  { id: "subterraneo-1", nombre: "Subterráneo -1" },
  { id: "subterraneo-2", nombre: "Subterráneo -2" },
  { id: "visitas", nombre: "Sector Visitas" },
];
