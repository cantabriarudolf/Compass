import type { CompassData } from "@/lib/store";

export interface CollectionDiff {
  label: string;
  seedCount: number;
  currentCount: number;
  added: { id: string; name: string }[];
  removed: { id: string; name: string }[];
  modified: { id: string; name: string }[];
}

export interface CompassDataDiff {
  main: CollectionDiff[];
  maestros: CollectionDiff[];
}

function getName(item: unknown): string {
  if (!item || typeof item !== "object") return "(sin nombre)";
  const obj = item as Record<string, unknown>;
  if (typeof obj["nombre"] === "string") return obj["nombre"];
  if (typeof obj["name"] === "string") return obj["name"];
  if (typeof obj["id"] === "string") return obj["id"];
  return "(sin nombre)";
}

function itemsById(items: unknown[]): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const item of items) {
    if (item && typeof item === "object") {
      const id = (item as Record<string, unknown>)["id"];
      if (typeof id === "string") map.set(id, item);
    }
  }
  return map;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffArray(
  label: string,
  current: unknown[],
  seed: unknown[]
): CollectionDiff {
  const currentMap = itemsById(current);
  const seedMap = itemsById(seed);

  const added: { id: string; name: string }[] = [];
  const removed: { id: string; name: string }[] = [];
  const modified: { id: string; name: string }[] = [];

  for (const [id, item] of currentMap) {
    if (!seedMap.has(id)) {
      added.push({ id, name: getName(item) });
    } else if (!deepEqual(item, seedMap.get(id))) {
      modified.push({ id, name: getName(item) });
    }
  }

  for (const [id, item] of seedMap) {
    if (!currentMap.has(id)) {
      removed.push({ id, name: getName(item) });
    }
  }

  return {
    label,
    seedCount: seed.length,
    currentCount: current.length,
    added,
    removed,
    modified,
  };
}

export function diffCompassData(current: CompassData, seed: CompassData): CompassDataDiff {
  return {
    main: [
      diffArray("Tipos de Unidad", current.tiposUnidad, seed.tiposUnidad),
      diffArray("Macro Sectores", current.macroSectores, seed.macroSectores),
      diffArray("Micro Sectores", current.microSectores, seed.microSectores),
      diffArray("Unidades", current.unidades, seed.unidades),
      diffArray("Estacionamientos", current.estacionamientos, seed.estacionamientos),
      diffArray("Personas", current.personas, seed.personas),
      diffArray("Vínculos", current.vinculos, seed.vinculos),
    ],
    maestros: [
      diffArray("AFP", current.maestros.afps, seed.maestros.afps),
      diffArray("Previsión Salud", current.maestros.previsionesSalud, seed.maestros.previsionesSalud),
      diffArray("Mutuales/Cajas", current.maestros.mutualesCajas, seed.maestros.mutualesCajas),
      diffArray("Feriados", current.maestros.feriados, seed.maestros.feriados),
      diffArray("Bancos", current.maestros.bancos, seed.maestros.bancos),
      diffArray("Índices Ajuste", current.maestros.indicesAjuste, seed.maestros.indicesAjuste),
      diffArray("Cajas Fondos", current.maestros.cajasFondos, seed.maestros.cajasFondos),
      diffArray("Categorías Insumos", current.maestros.categoriasInsumos, seed.maestros.categoriasInsumos),
      diffArray("Unidades Medida", current.maestros.unidadesMedida, seed.maestros.unidadesMedida),
      diffArray("Contactos Emergencia", current.maestros.contactosEmergencia, seed.maestros.contactosEmergencia),
      diffArray("Condiciones Especiales", current.maestros.condicionesEspeciales, seed.maestros.condicionesEspeciales),
      diffArray("Estados Ocupación", current.maestros.estadosOcupacion, seed.maestros.estadosOcupacion),
      diffArray("Categorías Macro", current.maestros.categoriasMacro, seed.maestros.categoriasMacro),
      diffArray("Categorías Micro", current.maestros.categoriasMicro, seed.maestros.categoriasMicro),
      diffArray("Categorías Unidad", current.maestros.categoriasUnidad, seed.maestros.categoriasUnidad),
      diffArray("Ubicaciones Estacionamiento", current.maestros.ubicacionesEstacionamiento, seed.maestros.ubicacionesEstacionamiento),
      diffArray("Estados Inmobiliarios", current.maestros.estadosInmobiliarios, seed.maestros.estadosInmobiliarios),
    ],
  };
}
