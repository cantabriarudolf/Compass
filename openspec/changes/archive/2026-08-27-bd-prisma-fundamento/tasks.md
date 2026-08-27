## 1. Tooling e infra Prisma
- [ ] 1.1 Instalar `prisma` (dev) + `@prisma/client` en `k0mp4ss_fe/apps/web`; verificar `package.json` refleja `^5.x`/`^6.x` y `prisma --version` ok.
- [ ] 1.2 Inicializar `k0mp4ss_fe/apps/web/prisma/schema.prisma` con `generator client` + `datasource db provider sqlite url env("DATABASE_URL")`; crear `lib/prisma.ts` singleton con `globalThis` guard para HMR.
- [ ] 1.3 Configurar `DATABASE_URL` en `k0mp4ss_fe/apps/web/.env.local` (gitignored, `file:./dev.db`) y documentar en `.env.example`; asegurar `.gitignore` ignora `*.db` + `prisma/dev.db*` y que `.env.local` está gitignored (root `!.env.example`); `migrations/` commiteadas.

## 2. Schema Prisma C1 (inventario completo)
- [ ] 2.1 Crear modelo `Comunidad` (id, nombre, slug @unique, createdAt, updatedAt).
- [ ] 2.2 Crear modelos de estructura/comunidad: `TipoUnidad`, `MacroSector`, `MicroSector`, `Unidad`, `Persona`, `VinculoUnidad`, `EventoAuditoria`, `ConfiguracionGlobal` con `comunidadId String + @@index([comunidadId])` y relación a `Comunidad`.
- [ ] 2.3 Crear modelos portal/notificaciones/controles/actas: `PublicacionPortal`, `LeadPortal`, `Notificacion`, `ControlPropiedad`, `ActaGD`.
- [ ] 2.4 Crear modelos de módulos NSGC: `PlantillaCO`, `EnvioCO`, `MensajeBuzonCO`, `DocumentoCO`, `SolicitudGE`, `RecursoIR`, `SolicitudInsumoIR`, `EntregaEPP`, `TipoInfraccionIN`, `InfraccionIN`, `TrabajoMT`, `ProyectoMT`, `ElementoRA`, `ReservaRA`, `AvisoCV`, `PlantillaCV`, `FondoFI`, `EgresoFI`, `EmisionGC`, `CobroFI`, `BitacoraVisitaPE`, `EncomiendaPE`, `IngresoContratistaPE`, `ProveedorPE`, `MantencionPreventivaPE`, `VisitaTecnicaPE`, `CierreTurnoPE`, `ProyeccionPE`, `LiquidacionPL`, `AdelantoPL`, `CertificadoCT`, `ReporteRE`.
- [ ] 2.5 Crear modelos de maestros MA (20): `Afp`, `PrevisionSalud`, `MutualCaja`, `Feriado`, `Banco`, `IndiceAjuste`, `CajaFondo`, `CategoriaInsumo`, `UnidadMedida`, `ContactoEmergencia`, `CondicionEspecial`, `EstadoOcupacion`, `CategoriaMacro`, `CategoriaMicro`, `CategoriaUnidad`, `EstadoInmobiliario`, `AsignacionFamiliar`, `Jornada`, `Courier`, `Contratista`.
- [ ] 2.6 Para cada modelo mapear campos según `lib/schemas.ts` (tipos escalares + `Json` para arrays/objetos anidados); añadir `comunidadId` indexado y `@@map` opcional; verificar que `prisma validate` y `prisma migrate dev --name init` corren limpio y que `prisma generate` crea cliente.

## 3. Constraints C3b
- [ ] 3.1 Añadir `@@unique([comunidadId, nombre])` en `TipoUnidad`, `MacroSector`, `FondoFI` y `@unique` en `Comunidad.slug` + `@@unique([comunidadId, rut])` en `ProveedorPE`; dejar documentado en `design.md` tabla de justificación y casos de NO-constraint (`Unidad.numero`, `Persona.rut`).
- [ ] 3.2 Verificar que `prisma migrate dev` con constraints pasa y que repetidos cross-comunidad se permiten (mismo `nombre` en otra `comunidadId` no viola).

## 4. Repositorios con scoping C1b
- [ ] 4.1 Implementar `k0mp4ss_fe/apps/web/lib/repos/index.ts` con `export function crearRepositorio(comunidadId: string)` que valida `comunidadId` no vacío y retorna objeto con CRUD scoped por `comunidadId` para cada modelo (findMany, findById, create, update, delete) usando `prisma.*` con `where: { comunidadId }` obligatorio.
- [ ] 4.2 Asegurar que ningún método expone query sin `comunidadId`; `lib/prisma.ts` no se exporta para consumo directo desde `app/`; añadir guard que lanza si `comunidadId` falta.

## 5. Tests de aislamiento A/B
- [ ] 5.1 Crear `k0mp4ss_fe/apps/web/lib/repos/repos.test.ts` con `describe` aislamiento: `beforeAll` crea `DATABASE_URL=file:/tmp/test-p2-${Date.now()}.db`, ejecuta `prisma migrate deploy` o `db push`, crea dos comunidades A/B.
- [ ] 5.2 Tests: `repoA.create TipoUnidad nombre X` → `repoB.findById` del mismo id retorna `null`; `repoB.findMany` no ve datos de A; `repoB.update/delete` sobre id de A no muta (retorna null / count 0 / lanza); cross-write con `comunidadId` falsificado falla. Mismo patrón para al menos 2 entidades adicionales (p.ej. `Persona` y `Unidad`) para demostrar scoping genérico.
- [ ] 5.3 `afterAll` con `prisma.$disconnect` y borrado del `.db` temporal; test usa `:memory:` o archivo temporal, no el `dev.db` real.

## 6. Validación y cierre
- [ ] 6.1 `cd k0mp4ss_fe/apps/web && npx prisma validate && npx prisma generate && npx tsc --noEmit && npm run lint && npm test -- --run` verde; `openspec validate --all` sin fallos; `prisma migrate dev` limpio y `migrations/` commiteadas.
- [ ] 6.2 Sync mains (carpeta `SG` nueva + `project.md` ya tiene fila SG, verifica) y `openspec archive bd-prisma-fundamento --yes` (o manual); `nsgc-prepush` (avance P2, manual/dump modelos BD en catálogo si aplica) → fila HECHA en `SERIE-PLATAFORMA.md` + Bitácora → push.
