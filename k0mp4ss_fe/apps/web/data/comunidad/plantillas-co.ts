// Seed del Maestro de Mensajes Prefijados (CO): las 5 plantillas de ejemplo
// definidas en el NSGC (CO - Comunicacion Vecinos.md §2). Solo seed: el store
// puede crear/editar/eliminar plantillas vía savePlantillaCO/removePlantillaCO.

import type { PlantillaCO } from "@/lib/schemas"

export const plantillasComunicacion: PlantillaCO[] = [
  {
    id: "plant-co-asamblea-ordinaria",
    nombre: "Citación a Asamblea Ordinaria",
    categoria: "comunidad",
    asunto: "Primera Asamblea General",
    cuerpo:
      "Se cita a todos los copropietarios a la asamblea que se realizará en el salón de eventos el próximo sábado.",
  },
  {
    id: "plant-co-corte-agua",
    nombre: "Suspensión de Agua Potable",
    categoria: "urgente",
    asunto: "CORTE DE AGUA EMERGENCIA",
    cuerpo:
      "Atención: Debido a una rotura de matriz externa, el servicio de agua potable será suspendido por 4 horas.",
  },
  {
    id: "plant-co-recordatorio-gc",
    nombre: "Recordatorio Pago Gastos Comunes",
    categoria: "cobranza",
    asunto: "Vencimiento Gasto Común",
    cuerpo:
      "Estimado/a [Nombre_Usuario], le recordamos que el plazo para el pago del gasto común vence el día 5 de este mes.",
  },
  {
    id: "plant-co-mantencion-ascensores",
    nombre: "Aviso de Mantención de Ascensores",
    categoria: "informacion",
    asunto: "Mantención Programada: Ascensores",
    cuerpo:
      "Estimados residentes, informamos que mañana se realizará la mantención de los ascensores de la [Nombre_Torre].",
  },
  {
    id: "plant-co-bienvenida",
    nombre: "Mensaje de Bienvenida y Activación de Cuenta",
    categoria: "onboarding",
    asunto: "Bienvenido a [Nombre_Comunidad] - Instrucciones de Acceso",
    cuerpo:
      "Estimado/a [Nombre_Usuario], su cuenta de acceso al sistema de gestión ha sido activada. Su usuario es este correo electrónico y su contraseña inicial es su RUT (sin puntos ni guiones). Le recomendamos cambiar su clave al ingresar por primera vez.",
  },
]
