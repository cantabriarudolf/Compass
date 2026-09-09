/**
 * Validación de política de contraseñas.
 * SERIE-PRODUCCION-FASE2 P2
 *
 * Requisitos:
 * - Mínimo 8 caracteres
 * - Al menos 1 mayúscula
 * - Al menos 1 minúscula
 * - Al menos 1 número
 */

export interface PasswordValidationResult {
  valido: boolean
  errores: string[]
}

export function validarPassword(password: string): PasswordValidationResult {
  const errores: string[] = []

  if (password.length < 8) {
    errores.push("La contraseña debe tener al menos 8 caracteres.")
  }
  if (!/[A-Z]/.test(password)) {
    errores.push("La contraseña debe contener al menos una mayúscula.")
  }
  if (!/[a-z]/.test(password)) {
    errores.push("La contraseña debe contener al menos una minúscula.")
  }
  if (!/[0-9]/.test(password)) {
    errores.push("La contraseña debe contener al menos un número.")
  }

  return {
    valido: errores.length === 0,
    errores,
  }
}

/** Mensaje genérico para no revelar qué regla falló específicamente. */
export const MENSAJE_PASSWORD_INVALIDA =
  "La contraseña no cumple con los requisitos de seguridad."
