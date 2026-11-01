#!/usr/bin/env node
/**
 * Guarda contra la inflación de Vercel Functions Storage.
 *
 * Cada `route.ts` / `page.tsx` bajo `app/` se empaqueta como su propia Vercel
 * Function y arrastra el `node_modules` que Next traza para ella (el `.nft.json`
 * de al lado). Vercel mide el peso de esos bundles como "Functions Storage" y
 * el plan Hobby lo limita a 10 GB: un bundle gordo se multiplica por cada ruta
 * y por cada deployment retenido.
 *
 * Historia: sin `outputFileTracingExcludes` cada función pesaba ~80,6 MB, de los
 * cuales ~57 MB eran motores Prisma WASM de bases que el proyecto no usa. Con
 * 156 rutas eso daba ~12,5 GB por deployment y excedía el tope. Este script
 * falla si una función vuelve a pasar el presupuesto, así una dependencia que
 * reintroduzca esos blobs no llega a producción en silencio.
 *
 * Uso:
 *   npm run build && npm run check:trazado
 *   npm run check:trazado -- --verbose
 */
import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

/** Tope por función. El peso esperado es ~24 MB; un motor WASM de más suma ~54. */
const PRESUPUESTO_MB = 30
const MB = 1024 * 1024

const raiz = path.resolve(import.meta.dirname, "..")
const serverDir = path.join(raiz, ".next", "server")
const verbose = process.argv.includes("--verbose")

/** Devuelve todos los `.nft.json` bajo `dir`. */
async function buscarTraces(dir) {
  const encontrados = []
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name)
    if (entrada.isDirectory()) encontrados.push(...(await buscarTraces(completo)))
    else if (entrada.name.endsWith(".nft.json")) encontrados.push(completo)
  }
  return encontrados
}

/** Suma el tamaño de los archivos trazados por un `.nft.json`. */
async function pesarTrace(tracePath) {
  const { files = [] } = JSON.parse(await readFile(tracePath, "utf8"))
  const base = path.dirname(tracePath)
  let total = 0
  for (const relativo of files) {
    try {
      total += (await stat(path.resolve(base, relativo))).size
    } catch {
      // Un archivo trazado que ya no existe no suma; no es motivo de falla.
    }
  }
  return { bytes: total, archivos: files.length }
}

let traces
try {
  traces = await buscarTraces(serverDir)
} catch {
  console.error("❌ No existe .next/server. Corré `npm run build` antes.")
  process.exit(1)
}

if (traces.length === 0) {
  console.error("❌ No se encontró ningún .nft.json. Corré `npm run build` antes.")
  process.exit(1)
}

const pesos = []
for (const tracePath of traces) {
  const { bytes, archivos } = await pesarTrace(tracePath)
  pesos.push({ ruta: path.relative(serverDir, tracePath), bytes, archivos })
}
pesos.sort((a, b) => b.bytes - a.bytes)

const maximo = pesos[0]
const suma = pesos.reduce((acc, p) => acc + p.bytes, 0)
const excedidas = pesos.filter((p) => p.bytes > PRESUPUESTO_MB * MB)

console.log(`Funciones medidas: ${pesos.length}`)
console.log(`Más pesada:        ${(maximo.bytes / MB).toFixed(1)} MB (${maximo.archivos} archivos) — ${maximo.ruta}`)
console.log(`Promedio:          ${(suma / pesos.length / MB).toFixed(1)} MB`)
console.log(`Suma de funciones: ${(suma / MB).toFixed(0)} MB ≈ ${(suma / 1024 / MB).toFixed(1)} GB por deployment`)
console.log(`Presupuesto:       ${PRESUPUESTO_MB} MB por función`)

if (verbose) {
  console.log("\nLas 10 más pesadas:")
  for (const p of pesos.slice(0, 10)) {
    console.log(`  ${(p.bytes / MB).toFixed(1).padStart(6)} MB  ${p.ruta}`)
  }
}

if (excedidas.length > 0) {
  console.error(`\n❌ ${excedidas.length} función(es) superan el presupuesto de ${PRESUPUESTO_MB} MB:`)
  for (const p of excedidas.slice(0, 10)) {
    console.error(`   ${(p.bytes / MB).toFixed(1)} MB  ${p.ruta}`)
  }
  console.error(
    "\nRevisá qué se coló al bundle: los motores Prisma WASM (`*.wasm-base64.*`)\n" +
      "y los binarios de otras plataformas son los sospechosos habituales.\n" +
      "Ver `outputFileTracingExcludes` en next.config.mjs.",
  )
  process.exit(1)
}

console.log("\n✅ Ninguna función supera el presupuesto.")
