// Seed de los fondos financieros de demostración (FI): única definición del
// maestro de fondos de demo. Lo consumen el store legacy (hidratación v21 y
// estado inicial) y el seed a la BD (`scripts/seed-fondos-fi.ts`, npm
// `db:fondos-fi`). El fondo del punto cero NO vive acá: se deriva de
// `data/finanzas/punto-cero-2324.json` (`fondo-cc-punto-cero`, con
// `saldoInicial` derivado del libro).

import type { FondoFI } from "@/lib/schemas"

export const FONDOS_FI_SEED: FondoFI[] = [
  {
    id: "fondo-gc",
    nombre: "Fondo de Gasto Común",
    tipo: "gasto_comun",
    descripcion: "Caja principal para la operación ordinaria de la comunidad.",
    activo: true,
  },
  {
    id: "fondo-reserva",
    nombre: "Fondo de Reserva",
    tipo: "reserva",
    descripcion: "Ahorro obligatorio según la Ley de Copropiedad.",
    porcentajeAporte: 5,
    activo: true,
  },
  {
    id: "fondo-amenities",
    nombre: "Fondo de Amenities",
    tipo: "amenities",
    descripcion:
      "Centro de costos de reservas, tarifas y garantías de amenities.",
    activo: true,
  },
]
