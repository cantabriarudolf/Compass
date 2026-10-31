/**
 * Guarda estática compartida por los tests de componentes que fijaron su
 * migración al API (visor de mensajes, certificados, multas).
 *
 * La propiedad que esos tests cuidaban —"el componente no lee el store
 * legacy"— ya no se puede observar con espías: F22a retiró el store del
 * navegador y no queda sujeto sobre el que espiar. Ahora se verifica sobre el
 * fuente con la misma regla del candado `npm run audit:store` (allowlist vacía:
 * cualquier archivo de `app/` o `components/` que nombre el store es un
 * hallazgo).
 *
 * La regla se lee de `scripts/audit-store.mjs` en vez de importar el módulo:
 * ese script resuelve `import.meta.url` como URL `file:` al cargarse y estos
 * tests corren en jsdom. Si el candado cambia de forma, esto falla en vez de
 * quedarse con una copia silenciosa.
 */
import { readFileSync } from "node:fs"
import path from "node:path"

const RAIZ = path.resolve(__dirname, "../..")
const SCRIPT_CANDADO = path.join(RAIZ, "scripts/audit-store.mjs")
const PREFIJO = "const RE_STORE = /"

function patronDelCandado(): RegExp {
  const linea = readFileSync(SCRIPT_CANDADO, "utf8")
    .split("\n")
    .find((l) => l.trimStart().startsWith(PREFIJO))
  if (!linea) {
    throw new Error(`scripts/audit-store.mjs cambió: no se encontró la línea "${PREFIJO}..."`)
  }
  return new RegExp(linea.trimStart().slice(PREFIJO.length).replace(/\/\s*$/, ""))
}

/** Devuelve, entre las rutas dadas, las que todavía usan el store legacy. */
export function archivosQueUsanElStore(...rutasRelativas: string[]): string[] {
  const patron = patronDelCandado()
  return rutasRelativas.filter((ruta) =>
    patron.test(readFileSync(path.join(RAIZ, ruta), "utf8"))
  )
}
