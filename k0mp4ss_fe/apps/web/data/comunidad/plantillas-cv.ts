// CV - Maestro de Mensajes Rápidos: plantillas operativas de activación
// instantánea por personal de servicio (categorías NSGC §2).
// Multimedia por URL remota (D1); imagen y video son excluyentes.

import type { PlantillaCV } from "@/lib/schemas"

export const plantillasCVSeed: PlantillaCV[] = [
  {
    id: "plant-cv-hidropack",
    titulo: "Falla de servicios — Hidropack",
    cuerpo: "Problemas con sistema Hidropack - Técnicos en camino.",
    tipologia: "peligro",
    duracionSegundosSugerida: 15,
    pantallaCompleta: false,
    tags: ["servicios", "urgente"],
    activa: true,
  },
  {
    id: "plant-cv-porton",
    titulo: "Control de acceso — Portón",
    cuerpo: "Portón principal en mantención - Acceso restringido.",
    tipologia: "advertencia",
    duracionSegundosSugerida: 10,
    pantallaCompleta: false,
    tags: ["acceso", "conserjeria"],
    activa: true,
  },
  {
    id: "plant-cv-corte",
    titulo: "Corte programado",
    cuerpo: "Corte de luz programado para este [FECHA] de [HORA_INICIO] a [HORA_FIN].",
    tipologia: "peligro",
    duracionSegundosSugerida: 20,
    pantallaCompleta: true,
    tags: ["cortes", "directiva"],
    activa: true,
  },
  {
    id: "plant-cv-piscina",
    titulo: "Habilitación de áreas — Piscina",
    cuerpo: "Mantenimiento de piscinas finalizado. Habilitada para uso.",
    tipologia: "exito",
    duracionSegundosSugerida: 10,
    pantallaCompleta: false,
    tags: ["areas-comunes", "mantencion"],
    activa: true,
  },
]
