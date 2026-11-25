// @vitest-environment node
/**
 * Contrato del proxy: qué rutas pasan SIN sesión.
 *
 * Esto existe por un defecto real: `GET /api/co/cola` nació con su compuerta de
 * `CRON_SECRET` y sus tests verdes, pero el proxy de Auth.js exige sesión para
 * todo `/api/*` que no esté en la lista blanca. En producción el cron de Vercel
 * manda el bearer y ninguna cookie, así que recibía 401 «No autenticado.» antes
 * de llegar al handler: el cron nunca drenó. Los tests de la ruta no podían
 * verlo porque importan el handler directamente y saltean el proxy.
 */
import { describe, expect, it } from "vitest"
import { RUTAS_PUBLICAS, esRutaPublica } from "@/lib/rutas-publicas"

describe("rutas públicas del proxy", () => {
  it("los dos crons de Vercel pasan sin sesión: se autentican con CRON_SECRET dentro de la ruta", () => {
    expect(esRutaPublica("/api/co/cola")).toBe(true)
    expect(esRutaPublica("/api/vigencia-registro/avisos")).toBe(true)
  })

  it("una ruta de datos cualquiera sigue exigiendo sesión", () => {
    // Control: si esto pasara a `true`, la lista blanca se comió una API real.
    expect(esRutaPublica("/api/cobros-fi")).toBe(false)
    expect(esRutaPublica("/api/importar/pagos-historicos/plantilla")).toBe(false)
    expect(esRutaPublica("/api/co/envios")).toBe(false)
  })

  it("el prefijo cubre a sus hijos y no a un vecino con el mismo comienzo", () => {
    expect(esRutaPublica("/api/auth/invitacion")).toBe(true)
    expect(esRutaPublica("/api/authx")).toBe(false)
    expect(esRutaPublica("/api/co/colaboradores")).toBe(false)
  })

  it("no hay entradas repetidas ni con barra final", () => {
    expect(new Set(RUTAS_PUBLICAS).size).toBe(RUTAS_PUBLICAS.length)
    for (const ruta of RUTAS_PUBLICAS) expect(ruta.endsWith("/")).toBe(false)
  })
})
