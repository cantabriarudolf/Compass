#!/usr/bin/env -S npx tsx
/**
 * seed-db-from-mocks — puebla la BD de desarrollo con los datos de los mocks
 * de `data/` (serie UI-MIGRACION-BD): las páginas migradas a API REST leen de
 * la BD y estaban vacías.
 *
 * Inserta con upsert idempotente por id (correr 2× no duplica). No borra
 * datos existentes: solo crea filas con ids de mock o reactualiza esas mismas
 * filas. Ids de mock son deterministas (p-1, u-A-101, v-1, afp-habitat, etc.),
 * alineados con la convención de `migrate-punto-cero-a-db.ts`.
 *
 * Uso (desde k0mp4ss_fe/apps/web):
 *   npx tsx scripts/seed-db-from-mocks.ts [--comunidad-id=xxx]
 *
 * Comunidad destino: flag `--comunidad-id`, o env `COMUNIDAD_ID`, o la
 * primera Comunidad de la BD (orden de creación). Sin comunidad → crea
 * "Edificio Plaza Central" (la comunidad del mock).
 *
 * Qué puebla:
 *   - EF: 5 tiposUnidad, 7 macroSectores, 25 microSectores, 166 unidades
 *   - MP: 54 personas, 51 vinculos
 *   - CF: configuración global (configuracionDefault)
 *   - MA: maestros admin (AFP, salud, bancos, feriados, etc.) + @@maestros.ts
 *     (categorías EF, estados de ocupación) + estados inmobiliarios (VU)
 *   - IN: 5 tipos de infracción
 *
 * El punto cero financiero (182 egresos + 44 ingresos) NO vive aquí: tiene su
 * propio script `scripts/migrate-punto-cero-a-db.ts` (misma comunidad destino
 * por defecto). Este script no lo toca para no duplicar lógica.
 */
/* global process */
import { config } from "dotenv"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(scriptDir, "..", ".env") })

import { PrismaClient, Prisma } from "@prisma/client"
import { personas } from "../data/comunidad/personas"
import {
  vinculos,
  ESTADOS_INMOBILIARIOS,
} from "../data/comunidad/vinculos"
import {
  tiposUnidad,
  macroSectores,
  microSectores,
  unidades,
} from "../data/inventario/estructura"
import {
  AFPS,
  PREVISIONES_SALUD,
  MUTUALES_CAJAS,
  ASIGNACION_FAMILIAR,
  JORNADAS,
  COURIERS,
  CONTRATISTAS,
  FERIADOS,
  BANCOS,
  INDICES_AJUSTE,
  CAJAS_FONDOS,
  CATEGORIAS_INSUMOS,
  UNIDADES_MEDIDA,
  CONTACTOS_EMERGENCIA,
  CONDICIONES_ESPECIALES,
} from "../data/admin/maestros"
import { configuracionDefault } from "../data/admin/configuracion"
import {
  CATEGORIAS_MACRO,
  CATEGORIAS_MICRO,
  CATEGORIAS_UNIDAD,
  ESTADOS_OCUPACION,
} from "../data/maestros"
import { tiposInfraccionSeed } from "../data/finanzas/tipos-infraccion"

function resolverComunidadId(): string | null {
  const flag = process.argv
    .find((a) => a.startsWith("--comunidad-id="))
    ?.slice("--comunidad-id=".length)
    ?.trim()
  if (flag) return flag
  const env = process.env.COMUNIDAD_ID?.trim()
  if (env) return env
  return null
}

/* SAFETY: helper genérico de seed — tipar el delegate de cada modelo choca
 * con la contravarianza del genérico upsert de Prisma y `Record<string,
 * unknown>` excluye interfaces sin index signature. Uso acotado a este
 * script; el runtime de Prisma valida el modelo. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type FilaMock = { id: string }

async function sembrarFila<T extends FilaMock>(
  modelo: any,
  fila: T,
  comunidadId: string,
): Promise<void> {
  // SAFETY: mock tipado → filas Prisma unchecked; el runtime valida el modelo.
  const datos = fila as unknown as Record<string, unknown>
  await modelo.upsert({
    where: { id: fila.id },
    update: { ...datos, comunidadId },
    create: { ...datos, comunidadId },
  })
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  })
  try {
    // --- Comunidad destino ---
    const flagId = resolverComunidadId()
    let comunidad = flagId
      ? await prisma.comunidad.findUnique({ where: { id: flagId } })
      : await prisma.comunidad.findFirst({
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })
    if (!comunidad) {
      comunidad = await prisma.comunidad.create({
        data: {
          id: "comunidad-mocks",
          nombre: "Edificio Plaza Central",
          slug: "edificio-plaza-central",
        },
      })
      console.log(`[seed-mocks] comunidad creada: ${comunidad.id}`)
    }
    const comunidadId = comunidad.id
    console.log(`[seed-mocks] comunidad destino: ${comunidadId}`)

    // --- CF: Configuración Global (1 fila por comunidad) ---
    const configRow = {
      nombreComunidad: configuracionDefault.nombreComunidad,
      rutComunidad: configuracionDefault.rutComunidad,
      direccionOficial: configuracionDefault.direccionOficial,
      administradorResponsable: configuracionDefault.administradorResponsable,
      rutAdministrador: configuracionDefault.rutAdministrador,
      telefonoAdmin: configuracionDefault.telefonoAdmin,
      modoCalculoGC: configuracionDefault.modoCalculoGC,
      diaCortePago: configuracionDefault.diaCortePago,
      limiteMesesAvisoCorte: configuracionDefault.limiteMesesAvisoCorte,
      smtpHost: configuracionDefault.smtpHost,
      smtpPort: configuracionDefault.smtpPort,
      smtpUser: configuracionDefault.smtpUser,
      smtpSecurity: configuracionDefault.smtpSecurity,
      smtpFrom: configuracionDefault.smtpFrom,
      smtpFromName: configuracionDefault.smtpFromName,
      smtpBcc: configuracionDefault.smtpBcc ?? null,
      smtpRecepcion: configuracionDefault.smtpRecepcion ?? null,
      notificarEmisionGC: configuracionDefault.notificarEmisionGC,
      notificarRegistroVisitas:
        configuracionDefault.notificarRegistroVisitas,
      notificarEncomiendas: configuracionDefault.notificarEncomiendas,
      notificarReservas: configuracionDefault.notificarReservas,
      notificarAvisosSistema: configuracionDefault.notificarAvisosSistema,
      notificarSugerenciasReclamos:
        configuracionDefault.notificarSugerenciasReclamos,
      diasMesComercial: configuracionDefault.diasMesComercial,
      diasVacacionesMes: configuracionDefault.diasVacacionesMes,
      jornadaSemanalEstandar: configuracionDefault.jornadaSemanalEstandar,
    }
    // Id determinista por comunidad: el id fijo "cfg-mocks" colisionaba (P2002)
    // cuando otra comunidad ya tenía su fila (misma PK global). Así el seed es
    // re-ejecutable por comunidad sin pisarse entre comunidades.
    await prisma.configuracionGlobal.upsert({
      where: { comunidadId },
      update: configRow,
      create: { id: `cfg-mocks-${comunidadId}`, ...configRow, comunidadId },
    })

    // --- EF: estructura física (orden: tipos → macro → micro → unidades) ---
    for (const t of tiposUnidad) {
      await sembrarFila(prisma.tipoUnidad, t, comunidadId)
    }
    for (const m of macroSectores) {
      await sembrarFila(prisma.macroSector, m, comunidadId)
    }
    for (const m of microSectores) {
      await sembrarFila(prisma.microSector, m, comunidadId)
    }
    for (const u of unidades) {
      await sembrarFila(prisma.unidad, u, comunidadId)
    }

    // --- MA: maestros de estructura/inventario + estados ocupación (EF) ---
    for (const m of CATEGORIAS_MACRO) {
      await sembrarFila(prisma.categoriaMacro, m, comunidadId)
    }
    for (const m of CATEGORIAS_MICRO) {
      await sembrarFila(prisma.categoriaMicro, m, comunidadId)
    }
    for (const m of CATEGORIAS_UNIDAD) {
      await sembrarFila(prisma.categoriaUnidad, m, comunidadId)
    }
    for (const e of ESTADOS_OCUPACION) {
      await sembrarFila(prisma.estadoOcupacion, e, comunidadId)
    }

    // --- MA: maestros administrativos (afp, salud, bancos, etc.) ---
    for (const m of AFPS) await sembrarFila(prisma.afp, m, comunidadId)
    for (const m of PREVISIONES_SALUD) {
      await sembrarFila(prisma.previsionSalud, m, comunidadId)
    }
    for (const m of MUTUALES_CAJAS) {
      await sembrarFila(prisma.mutualCaja, m, comunidadId)
    }
    for (const m of ASIGNACION_FAMILIAR) {
      await sembrarFila(prisma.asignacionFamiliar, m, comunidadId)
    }
    for (const m of JORNADAS) {
      await sembrarFila(prisma.jornada, m, comunidadId)
    }
    for (const m of COURIERS) {
      await sembrarFila(prisma.courier, m, comunidadId)
    }
    for (const m of CONTRATISTAS) {
      await sembrarFila(prisma.contratista, m, comunidadId)
    }
    for (const m of FERIADOS) {
      await sembrarFila(prisma.feriado, m, comunidadId)
    }
    for (const m of BANCOS) {
      await sembrarFila(prisma.banco, m, comunidadId)
    }
    for (const m of INDICES_AJUSTE) {
      await sembrarFila(prisma.indiceAjuste, m, comunidadId)
    }
    for (const m of CAJAS_FONDOS) {
      await sembrarFila(prisma.cajaFondo, m, comunidadId)
    }
    for (const m of CATEGORIAS_INSUMOS) {
      await sembrarFila(prisma.categoriaInsumo, m, comunidadId)
    }
    for (const m of UNIDADES_MEDIDA) {
      await sembrarFila(prisma.unidadMedida, m, comunidadId)
    }
    for (const m of CONTACTOS_EMERGENCIA) {
      await sembrarFila(prisma.contactoEmergencia, m, comunidadId)
    }
    for (const m of CONDICIONES_ESPECIALES) {
      await sembrarFila(prisma.condicionEspecial, m, comunidadId)
    }
    for (const m of ESTADOS_INMOBILIARIOS) {
      await sembrarFila(prisma.estadoInmobiliario, m, comunidadId)
    }

    // --- MP/VU: personas y vínculos (personas antes de vínculos) ---
        for (const p of personas) {
          // JSON nullable: Prisma exige DbNull para "vaciar" una columna Json.
          // SAFETY: el mock tipa ExtensionLaboral/Gobernanza como interfaces;
          // Prisma.InputJsonValue es el input JSON equivalente que tsc no puede
          // inferir estructuralmente (soporta valores Json arbitrarios).
          const datosLaborales = p.datosLaborales
            ? (p.datosLaborales as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull
          // SAFETY: idem datosLaborales — ExtensionGobernanza es un objeto JSON
          // arbitrario en la columna Json `datosGobernanza`.
          const datosGobernanza = p.datosGobernanza
            ? (p.datosGobernanza as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull
          const fila = {
        rut: p.rut,
        nombreCompleto: p.nombreCompleto,
        nombres: p.nombres,
        apellidos: p.apellidos,
        email: p.email,
        telefonoMovil: p.telefonoMovil,
        telefonoFijo: p.telefonoFijo ?? null,
        fotografiaUrl: p.fotografiaUrl ?? null,
        estadoCuenta: p.estadoCuenta,
        condicionesEspecialesIds: p.condicionesEspecialesIds,
        roles: p.roles,
        datosLaborales,
        datosGobernanza,
        permiteCreacionManualCV: p.permiteCreacionManualCV ?? null,
      }
      await prisma.persona.upsert({
        where: { id: p.id },
        update: { ...fila, comunidadId },
        create: { id: p.id, ...fila, comunidadId },
      })
    }
    for (const v of vinculos) {
      const fila = {
        personaId: v.personaId,
        unidadId: v.unidadId,
        rol: v.rol,
        fechaInicio: v.fechaInicio,
        fechaFin: v.fechaFin ?? null,
        estadoOcupacionPropiedad: v.estadoOcupacionPropiedad ?? null,
        permiteVerFinanzas: v.permiteVerFinanzas,
        cerrarAnterior: v.cerrarAnterior ?? null,
      }
      await prisma.vinculoUnidad.upsert({
        where: { id: v.id },
        update: { ...fila, comunidadId },
        create: { id: v.id, ...fila, comunidadId },
      })
    }

    // --- IN: catálogo de tipos de infracción ---
    for (const t of tiposInfraccionSeed) {
      const fila = {
        nombre: t.nombre,
        categoria: t.categoria,
        tipoSancion: t.tipoSancion,
        valor: t.valor,
      }
      await prisma.tipoInfraccionIN.upsert({
        where: { id: t.id },
        update: { ...fila, comunidadId },
        create: { id: t.id, ...fila, comunidadId },
      })
    }

    // --- Verificación de conteos (reporte final) ---
    const conteos = {
      configuracion: await prisma.configuracionGlobal.count({
        where: { comunidadId },
      }),
      tiposUnidad: await prisma.tipoUnidad.count({ where: { comunidadId } }),
      macroSectores: await prisma.macroSector.count({
        where: { comunidadId },
      }),
      microSectores: await prisma.microSector.count({
        where: { comunidadId },
      }),
      unidades: await prisma.unidad.count({ where: { comunidadId } }),
      personas: await prisma.persona.count({ where: { comunidadId } }),
      vinculos: await prisma.vinculoUnidad.count({
        where: { comunidadId },
      }),
      afps: await prisma.afp.count({ where: { comunidadId } }),
      feriados: await prisma.feriado.count({ where: { comunidadId } }),
      tiposInfraccion: await prisma.tipoInfraccionIN.count({
        where: { comunidadId },
      }),
    }
    console.log(`[seed-mocks] ok comunidad=${comunidadId}`, conteos)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e: unknown) => {
  console.error("[seed-mocks] error:", e instanceof Error ? e.message : e)
  process.exit(1)
})
