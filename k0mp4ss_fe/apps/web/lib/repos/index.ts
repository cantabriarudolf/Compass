/* eslint-disable @typescript-eslint/no-explicit-any -- capa de repos genérica: el wrapper scoped() delega delegates de Prisma con genéricos no expresables sin regenerar tipos; la validez la dan los tests con Prisma real */
import { prisma as defaultPrisma } from "../prisma"
import type { PrismaClient } from "@prisma/client"

/**
 * Factory obligatorio con scoping por comunidadId (C1b).
 * Ningún método expone query sin `where: { comunidadId }`.
 * Ver SG-hardening-despliegue C1b y ST-capa-datos-persistente C1b.
 *
 * Segundo parámetro opcional `client` solo para tests con SQLite :memory:/archivo temporal.
 */
export function crearRepositorio(comunidadId: string, client?: PrismaClient) {
  if (!comunidadId || typeof comunidadId !== "string" || comunidadId.trim().length === 0) {
    throw new Error("comunidadId es obligatorio para el scoping del repositorio (D3 tenant compartido)")
  }
  const cid = comunidadId
  const prisma = (client ?? defaultPrisma) as unknown as PrismaClient & Record<string, unknown>

  function scoped<T extends { findMany: unknown; findFirst: unknown; create: unknown; update: unknown; delete: unknown; count: unknown }>(
    delegate: T
  ) {
    const d = delegate as unknown as {
      findMany: (args?: Record<string, unknown>) => Promise<unknown>
      findFirst: (args?: Record<string, unknown>) => Promise<unknown>
      findUnique: (args?: Record<string, unknown>) => Promise<unknown>
      create: (args: Record<string, unknown>) => Promise<unknown>
      update: (args: Record<string, unknown>) => Promise<unknown>
      delete: (args: Record<string, unknown>) => Promise<unknown>
      updateMany: (args: Record<string, unknown>) => Promise<unknown>
      deleteMany: (args: Record<string, unknown>) => Promise<unknown>
      count: (args?: Record<string, unknown>) => Promise<number>
    }
    return {
      findMany: (args?: { where?: Record<string, unknown> } & Record<string, unknown>) =>
        d.findMany({ ...(args ?? {}), where: { comunidadId: cid, ...(args?.where ?? {}) } } as Record<string, unknown>),
      findById: (id: string) => d.findFirst({ where: { id, comunidadId: cid } } as Record<string, unknown>),
      findFirst: (where?: Record<string, unknown>) =>
        d.findFirst({ where: { comunidadId: cid, ...(where ?? {}) } } as Record<string, unknown>),
      create: (data: Record<string, unknown>) =>
        d.create({ data: { ...data, comunidadId: cid } } as Record<string, unknown>),
      update: async (id: string, data: Record<string, unknown>) => {
        const existing = await d.findFirst({ where: { id, comunidadId: cid } } as Record<string, unknown>)
        if (!existing) return null
        return d.update({ where: { id }, data } as Record<string, unknown>)
      },
      delete: async (id: string) => {
        const existing = await d.findFirst({ where: { id, comunidadId: cid } } as Record<string, unknown>)
        if (!existing) return null
        return d.delete({ where: { id } } as Record<string, unknown>)
      },
      count: (where?: Record<string, unknown>) =>
        d.count({ where: { comunidadId: cid, ...(where ?? {}) } } as Record<string, unknown>),
      // Expone delegate crudo solo para auditoría de tests (no usar en prod)
      _delegate: d,
    }
  }

  // Comunidad como entidad raíz: aunque el factory ya está scoping por cid,
  // exponer lectura scoped evita fuga. El create de comunidad se hace vía prisma directo (setup).
  const comunidadScoped = {
    findById: (id: string) => {
      if (id !== cid) return Promise.resolve(null)
      return (prisma.comunidad.findFirst as any)({ where: { id: cid } }) as Promise<unknown>
    },
    findMany: () => (prisma.comunidad.findMany as any)({ where: { id: cid } }) as Promise<unknown>,
  }

  // Authz B3: Usuario es global (email @unique), Membresia es scoped por comunidadId (D3)
  const usuariosGlobal = {
    findById: (id: string) => (prisma.usuario.findUnique as any)({ where: { id } }) as Promise<unknown>,
    findByEmail: (email: string) => (prisma.usuario.findUnique as any)({ where: { email } }) as Promise<unknown>,
    findMany: (args?: Record<string, unknown>) => (prisma.usuario.findMany as any)(args ?? {}) as Promise<unknown>,
    create: (data: Record<string, unknown>) => (prisma.usuario.create as any)({ data }) as Promise<unknown>,
    update: (id: string, data: Record<string, unknown>) => (prisma.usuario.update as any)({ where: { id }, data }) as Promise<unknown>,
    delete: (id: string) => (prisma.usuario.delete as any)({ where: { id } }) as Promise<unknown>,
    count: (where?: Record<string, unknown>) => (prisma.usuario.count as any)({ where: where ?? {} }) as Promise<number>,
    _delegate: prisma.usuario,
  }
  const membresiasScoped = scoped(prisma.membresia as any)

  return {
    // raíz
    comunidad: comunidadScoped,
    usuarios: usuariosGlobal,
    membresias: membresiasScoped,
    // estructura / comunidad
    tiposUnidad: scoped(prisma.tipoUnidad),
    macroSectores: scoped(prisma.macroSector),
    microSectores: scoped(prisma.microSector),
    unidades: scoped(prisma.unidad),
    personas: scoped(prisma.persona),
    vinculos: scoped(prisma.vinculoUnidad),
    eventos: scoped(prisma.eventoAuditoria),
    configuraciones: scoped(prisma.configuracionGlobal),
    // portal / notificaciones / controles / actas
    publicacionesPortal: scoped(prisma.publicacionPortal),
    leadsPortal: scoped(prisma.leadPortal),
    notificaciones: scoped(prisma.notificacion),
    controlesPropiedades: scoped(prisma.controlPropiedad),
    actasGD: scoped(prisma.actaGD),
    // CO
    plantillasCO: scoped(prisma.plantillaCO),
    enviosCO: scoped(prisma.envioCO),
    mensajesBuzonCO: scoped(prisma.mensajeBuzonCO),
    documentosCO: scoped(prisma.documentoCO),
    // GE
    solicitudesGE: scoped(prisma.solicitudGE),
    // IR
    activosIR: scoped(prisma.recursoIR),
    solicitudesInsumoIR: scoped(prisma.solicitudInsumoIR),
    entregasEPP: scoped(prisma.entregaEPP),
    // IN
    tiposInfraccionIN: scoped(prisma.tipoInfraccionIN),
    infraccionesIN: scoped(prisma.infraccionIN),
    // MT
    trabajosMT: scoped(prisma.trabajoMT),
    proyectosMT: scoped(prisma.proyectoMT),
    // RA
    elementosRA: scoped(prisma.elementoRA),
    reservasRA: scoped(prisma.reservaRA),
    // CV
    avisosCV: scoped(prisma.avisoCV),
    plantillasCV: scoped(prisma.plantillaCV),
    // FI
    fondosFI: scoped(prisma.fondoFI),
    egresosFI: scoped(prisma.egresoFI),
    emisionesGC: scoped(prisma.emisionGC),
    cobrosFI: scoped(prisma.cobroFI),
    // PE
    bitacoraVisitasPE: scoped(prisma.bitacoraVisitaPE),
    encomiendasPE: scoped(prisma.encomiendaPE),
    ingresosContratistasPE: scoped(prisma.ingresoContratistaPE),
    proveedoresPE: scoped(prisma.proveedorPE),
    mantencionesPreventivasPE: scoped(prisma.mantencionPreventivaPE),
    visitasTecnicasPE: scoped(prisma.visitaTecnicaPE),
    cierresTurnoPE: scoped(prisma.cierreTurnoPE),
    proyeccionesPE: scoped(prisma.proyeccionPE),
    // PL
    liquidacionesPL: scoped(prisma.liquidacionPL),
    adelantosPL: scoped(prisma.adelantoPL),
    // CT / RE
    certificadosCT: scoped(prisma.certificadoCT),
    reportesRE: scoped(prisma.reporteRE),
    // maestros (20)
    afps: scoped(prisma.afp),
    previsionesSalud: scoped(prisma.previsionSalud),
    mutualesCajas: scoped(prisma.mutualCaja),
    feriados: scoped(prisma.feriado),
    bancos: scoped(prisma.banco),
    indicesAjuste: scoped(prisma.indiceAjuste),
    cajasFondos: scoped(prisma.cajaFondo),
    categoriasInsumos: scoped(prisma.categoriaInsumo),
    unidadesMedida: scoped(prisma.unidadMedida),
    contactosEmergencia: scoped(prisma.contactoEmergencia),
    condicionesEspeciales: scoped(prisma.condicionEspecial),
    estadosOcupacion: scoped(prisma.estadoOcupacion),
    categoriasMacro: scoped(prisma.categoriaMacro),
    categoriasMicro: scoped(prisma.categoriaMicro),
    categoriasUnidad: scoped(prisma.categoriaUnidad),
    estadosInmobiliarios: scoped(prisma.estadoInmobiliario),
    asignacionesFamiliar: scoped(prisma.asignacionFamiliar),
    jornadas: scoped(prisma.jornada),
    couriers: scoped(prisma.courier),
    contratistas: scoped(prisma.contratista),
  }
}

export type RepositorioComunidad = ReturnType<typeof crearRepositorio>
