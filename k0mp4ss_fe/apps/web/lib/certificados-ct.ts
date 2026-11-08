/**
 * certificados-ct — la ÚNICA definición de qué clave de permiso gobierna la
 * emisión de cada tipología de certificado (F34, serie «Permisos por objeto»).
 *
 * Vive acá y no en la ruta porque la usan los dos lados del mostrador: el
 * `POST /api/certificados-ct` para decidir si emite, y la pantalla
 * `/comunidad/certificados` para no ofrecer una tipología que va a responder 403.
 * Una lista copiada en cada archivo es una segunda verdad: la pantalla ofrecería
 * lo que la ruta niega, y nadie se enteraría hasta que un residente clickeara.
 *
 * Base legal de qué puede emitir el residente por sí mismo (skill
 * `experto-admin-comunidades`, Ley 21.442 verificada en LeyChile 2026-11-07):
 *   · `residencia` — NO hay norma que lo regule ni que lo reserve al
 *     administrador (el boletín 17737-14, en trámite, busca *facultar* a los
 *     administradores para emitirlo: si hay que facultarlos, hoy no lo están).
 *   · `al_dia` y `estado_cuenta` — art. 20 N° 4 (emitir certificados sobre el
 *     estado de deudas es función del administrador) y art. 15 (la calidad de
 *     copropietario hábil se acredita con certificado expedido por el
 *     administrador). El art. 21 les da ACCESO a la documentación: consultar no
 *     es certificar.
 *   · `liquidacion_sueldo` — documento del empleador (PL).
 *
 * Ojo: `estado_cuenta` y `liquidacion_sueldo` comparten la clave `ct` porque no
 * tienen clave propia. Si algún día otro rol llegara a tener `ct` crear, podría
 * emitirlas; hoy sólo el administrador, por wildcard.
 */
import { puede } from "@/lib/authz"
import { TIPOS_CERTIFICADO_CT, type TipoCertificadoCT } from "@/lib/schemas"

/**
 * Mensajes del anclaje del certificado de residencia (F34). Viven acá, junto al
 * mapa de tipologías, porque los usa la ruta y los va a usar la pantalla: una
 * frase copiada en dos archivos es una segunda verdad que se desincroniza.
 * Los dos son fijos, sin interpolación: no hay dato de fila que pueda viajar.
 */
/** El rol está acotado y no tiene ningún vínculo vigente: no hay residencia que certificar. */
export const MENSAJE_SIN_VINCULO =
  "No registrás un vínculo vigente en esta comunidad: no hay residencia que certificar."

/** El rol tiene más de un vínculo: el servidor no elige entre dos viviendas. */
export const MENSAJE_ELEGIR_VINCULO =
  "Tenés más de un vínculo vigente: elegí la unidad del certificado."

export const RECURSO_DE_EMISION_POR_TIPO: Record<TipoCertificadoCT, string> = {
  residencia: "ct:residencia",
  al_dia: "ct:al_dia",
  estado_cuenta: "ct",
  liquidacion_sueldo: "ct",
}

/** Clave de emisión de una tipología, o `undefined` si no es una conocida. */
export function recursoDeEmision(tipo: string): string | undefined {
  // Mismo idioma que `puede()`: la clave tiene que existir EXACTA en el mapa, sin
  // heredar nada del prototipo.
  return Object.prototype.hasOwnProperty.call(RECURSO_DE_EMISION_POR_TIPO, tipo)
    ? RECURSO_DE_EMISION_POR_TIPO[tipo as TipoCertificadoCT]
    : undefined
}

/**
 * Etiqueta visible de cada tipología.
 *
 * Vive acá y no en la pantalla porque la usan los dos lados del mostrador: el
 * formulario (`TIPO_LABEL` de `certificados-emision.tsx`, que sólo la reexporta)
 * y el papel que sirve `GET /api/certificados-ct/[id]/pdf`, que se arma en el
 * SERVIDOR —donde un módulo `"use client"` no se puede importar—. Una copia por
 * lado es una segunda verdad: el PDF titularía el documento distinto de como lo
 * nombra la pantalla y nadie se enteraría hasta imprimirlo.
 */
export const ETIQUETA_POR_TIPO_CERTIFICADO: Record<TipoCertificadoCT, string> = {
  residencia: "Certificado de Residencia",
  estado_cuenta: "Estado de Cuenta / Fondos",
  liquidacion_sueldo: "Certificado Liquidación de Sueldo",
  al_dia: "Certificado Al Día (Informativo)",
}

/**
 * Etiqueta de una tipología leída de la fila (`tipo` es `String` en Prisma).
 *
 * La fila ya validó con `CertificadoCTSchema` al crearse, así que el valor es
 * del enum; el fallback existe para que un valor histórico desconocido se
 * imprima tal cual en vez de sacar al residente el documento con una etiqueta
 * vacía.
 */
export function etiquetaDeTipoCertificado(tipo: string): string {
  return Object.prototype.hasOwnProperty.call(ETIQUETA_POR_TIPO_CERTIFICADO, tipo)
    ? ETIQUETA_POR_TIPO_CERTIFICADO[tipo as TipoCertificadoCT]
    : tipo
}

/**
 * Tipologías que los roles de la sesión pueden emitir, en el orden canónico del
 * esquema. Puro: la pantalla filtra en el servidor con esto y el arnés lo compara
 * contra lo que la API acepta.
 */
export function tiposEmisibles(roles: readonly string[]): TipoCertificadoCT[] {
  return TIPOS_CERTIFICADO_CT.filter((tipo) =>
    roles.some((rol) => puede(rol, "crear", RECURSO_DE_EMISION_POR_TIPO[tipo]))
  )
}
