const PARTICULAS_NOMBRE = new Set([
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "y",
  "e",
  "da",
  "das",
  "do",
  "dos",
  "van",
  "von",
])

export function aTituloCaso(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((palabra, i) =>
      palabra === "" || (i > 0 && PARTICULAS_NOMBRE.has(palabra))
        ? palabra
        : palabra.charAt(0).toUpperCase() + palabra.slice(1)
    )
    .join(" ")
}

export function aOracion(valor: string): string {
  const texto = valor.trim()
  return texto === "" ? texto : texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function emailNormalizado(valor: string): string {
  return valor.trim().toLowerCase()
}

export function telefonoNormalizado(valor: string): string {
  const texto = valor.trim()
  const digitos = texto.replace(/\D/g, "")
  const movil = /^569\d{8}$/.test(digitos) ? digitos.slice(2) : digitos
  if (/^9\d{8}$/.test(movil)) {
    return `+56 9 ${movil.slice(1, 5)} ${movil.slice(5)}`
  }
  return texto
}

export function sitioNormalizado(valor: string): string {
  return valor.trim().toLowerCase()
}

export function identificadorNormalizado(valor: string): string {
  return valor.trim().toUpperCase()
}
