// Seed del Catálogo de Tipos de Infracciones (IN): faltas de ejemplo al
// Reglamento de Copropiedad con sanción base monto fijo o % del Gasto Común
// (IN - Infracciones y Multas.md §1). Solo seed: el store puede crear/editar/
// eliminar tipos vía saveTipoInfraccionIN/removeTipoInfraccionIN.

import type { TipoInfraccionIN } from "@/lib/schemas"

export const tiposInfraccionSeed: TipoInfraccionIN[] = [
  {
    id: "tipo-in-ruidos",
    nombre: "Ruidos Molestos",
    categoria: "grave",
    tipoSancion: "porcentaje_gc",
    valor: 50,
  },
  {
    id: "tipo-in-mascotas",
    nombre: "Mascota sin correa en áreas comunes",
    categoria: "leve",
    tipoSancion: "monto_fijo",
    valor: 15000,
  },
  {
    id: "tipo-in-basura",
    nombre: "Basura fuera de horario",
    categoria: "leve",
    tipoSancion: "monto_fijo",
    valor: 10000,
  },
  {
    id: "tipo-in-areas-comunes",
    nombre: "Uso indebido de áreas comunes",
    categoria: "grave",
    tipoSancion: "monto_fijo",
    valor: 50000,
  },
  {
    id: "tipo-in-obras",
    nombre: "Obras sin autorización",
    categoria: "gravisima",
    tipoSancion: "porcentaje_gc",
    valor: 100,
  },
]
