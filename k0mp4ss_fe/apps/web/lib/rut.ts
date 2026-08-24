const RUT_FORMATO = /^(\d{7,8})-([\dkK])$/
const PASAPORTE = /^[A-Z0-9]{6,15}$/

export function normalizarDocumento(valor: string): string {
  return valor.trim().toUpperCase().replace(/\s+/g, "")
}

export function calcularDigitoVerificador(cuerpo: string): string {
  const digitos = cuerpo.split("").reverse()
  let suma = 0
  let factor = 2
  for (const digito of digitos) {
    suma += Number(digito) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const resto = suma % 11
  const dv = 11 - resto
  if (dv === 11) return "0"
  if (dv === 10) return "K"
  return String(dv)
}

export function validarRut(valor: string): boolean {
  const normalizado = normalizarDocumento(valor).replace(/\./g, "")
  const match = RUT_FORMATO.exec(normalizado)
  if (!match || !match[1] || !match[2]) return false
  return calcularDigitoVerificador(match[1]) === match[2].toUpperCase()
}

export function esPasaporte(valor: string): boolean {
  const normalizado = normalizarDocumento(valor)
  return PASAPORTE.test(normalizado) && /[A-Z]/.test(normalizado)
}

export function validarDocumentoIdentidad(valor: string): boolean {
  const normalizado = normalizarDocumento(valor)
  if (!normalizado) return false
  return validarRut(normalizado) || esPasaporte(normalizado)
}
