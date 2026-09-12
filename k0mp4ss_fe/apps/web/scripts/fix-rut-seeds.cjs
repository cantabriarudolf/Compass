/* eslint-disable @typescript-eslint/no-require-imports, no-undef -- script CJS legacy: require es lo correcto aquí */
const fs = require("fs")

function dv(cuerpo) {
  const digitos = cuerpo.split("").reverse()
  let suma = 0
  let factor = 2
  for (const d of digitos) {
    suma += Number(d) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const r = suma % 11
  const v = 11 - r
  if (v === 11) return "0"
  if (v === 10) return "K"
  return String(v)
}

const archivos = [
  "data/comunidad/personas.ts",
  "data/admin/configuracion.ts",
]

for (const archivo of archivos) {
  let contenido = fs.readFileSync(archivo, "utf8")
  const regex = /(\d{1,2}\.\d{3}\.\d{3})-([\dkK])/g
  let cambios = 0
  contenido = contenido.replace(regex, (completo, cuerpo, dvActual) => {
    const correcto = dv(cuerpo.replace(/\./g, ""))
    if (correcto !== dvActual.toUpperCase()) {
      cambios++
      return `${cuerpo}-${correcto}`
    }
    return completo
  })
  fs.writeFileSync(archivo, contenido)
  console.log(`${archivo}: ${cambios} RUTs corregidos`)
}
