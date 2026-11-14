#!/usr/bin/env -S npx tsx
/**
 * scripts/check-unidades-sin-propietario — quién responde por cada unidad.
 *
 * Una unidad sin propietario vigente no se puede cobrar: la morosidad, el
 * convenio de pago y la emisión de gasto común necesitan una persona a quién
 * cobrarle. Hasta el 2026-11-14 la comunidad de demo tenía 132 de 166 unidades
 * así y ningún comando lo decía.
 *
 * Qué informa, por comunidad:
 *   - `nunca declarado`: la unidad nunca tuvo titular. Falta darlo de alta.
 *   - `vínculo cerrado sin reemplazo`: hubo dueño y su tramo se cerró sin uno
 *     nuevo. Es el caso caro: parece una unidad vendida y sigue sin cobrador.
 *   - el total de unidades sin propietario vigente, con la lista corta por
 *     número de unidad.
 *
 * Nunca imprime datos personales: unidad, número y causa. La definición del
 * hecho es UNA sola (`app/admin/metricas/_titularidad.ts`), la misma que usa el
 * panel de administración y la que exige cero sobre la semilla de demo.
 *
 * Modo estricto: `--strict` sale con código 1 si alguna unidad no tiene
 * propietario vigente. Sin `--strict` informa y sale 0, porque la comunidad de
 * demo puede contener a propósito el fixture roto
 * (`scripts/fixture-integridad-titularidad.ts`).
 *
 * Uso (desde k0mp4ss_fe/apps/web):
 *   npm run check:titularidad                    # todas las comunidades, informa
 *   npm run check:titularidad -- --strict        # falla si hay unidades sin dueño
 *   npm run check:titularidad -- --comunidad-id=comunidad-a
 */
/* global process, console */
import { PrismaClient } from "@prisma/client"
import { cargarUrlBase } from "../lib/database-url"
import { leerTitularidad } from "../app/admin/metricas/_titularidad"

/** Cuántos números de unidad se listan por causa antes de recortar con «+N». */
const LIMITE_POR_CAUSA = 10

/** Comunidad declarada por flag o env; `null` = revisar todas. */
function comunidadDeclarada(): string | null {
  const flag = process.argv
    .find((a) => a.startsWith("--comunidad-id="))
    ?.slice("--comunidad-id=".length)
    ?.trim()
  if (flag) return flag
  const env = process.env.COMUNIDAD_ID?.trim()
  return env ? env : null
}

function enModoEstricto(): boolean {
  return process.argv.includes("--strict")
}

/** Lista corta de números para una causa, recortada sin mentir por omisión. */
function numerosDe(
  filas: ReadonlyArray<{ numero: string }>
): string {
  if (filas.length === 0) return "ninguna"
  const mostrados = filas.slice(0, LIMITE_POR_CAUSA).map((f) => f.numero)
  const restantes = filas.length - mostrados.length
  return restantes > 0 ? `${mostrados.join(", ")} (+${restantes} más)` : mostrados.join(", ")
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: cargarUrlBase() })
  let totalSinTitular = 0
  try {
    const declarada = comunidadDeclarada()
    const comunidades = declarada
      ? await prisma.comunidad.findMany({ where: { id: declarada } })
      : await prisma.comunidad.findMany({
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })

    if (comunidades.length === 0) {
      console.error(
        declarada
          ? `[integridad] la comunidad ${declarada} no existe en esta base`
          : "[integridad] la base no tiene comunidades: corré la semilla primero"
      )
      process.exitCode = 2
      return
    }

    for (const comunidad of comunidades) {
      const titularidad = await leerTitularidad(comunidad.id, prisma)
      totalSinTitular += titularidad.total

      console.log(
        `[integridad] comunidad=${comunidad.id} («${comunidad.nombre}») ` +
          `evaluadas=${titularidad.evaluadas} bienes_comunes=${titularidad.bienesComunes}`
      )
      const nunca = titularidad.sinTitular.filter((u) => u.causa === "nunca_declarado")
      const cerradas = titularidad.sinTitular.filter(
        (u) => u.causa === "vinculo_cerrado_sin_reemplazo"
      )
      console.log(`[integridad]   nunca declarado: ${nunca.length} → ${numerosDe(nunca)}`)
      console.log(
        `[integridad]   vínculo cerrado sin reemplazo: ${cerradas.length} → ${numerosDe(cerradas)}`
      )
      console.log(`[integridad]   sin propietario vigente: ${titularidad.total}`)
    }

    if (enModoEstricto()) {
      if (totalSinTitular > 0) {
        console.error(
          `[integridad] modo estricto: falla (${totalSinTitular} unidad(es) sin propietario vigente)`
        )
        process.exitCode = 1
      } else {
        console.log("[integridad] modo estricto: ok (ninguna unidad sin propietario vigente)")
      }
    } else if (totalSinTitular > 0) {
      // El aviso no cambia el código de salida: informar no es fallar.
      console.log(
        "[integridad] informativo: agregá --strict para que este conteo haga fallar el comando"
      )
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e: unknown) => {
  console.error("[integridad] error:", e instanceof Error ? e.message : e)
  process.exit(1)
})
