## MODIFIED Requirements

### Requirement: Capa de datos persistente (ST)
Todo dato de dominio SHALL persistir en el servidor (base de datos vía API REST) y SHALL leerse desde ahí mediante los hooks de `apps/web/lib/api/use-*.ts`. El store global `apps/web/lib/store.ts` (Zustand + persist, key `compass-store`) es una capa **legacy** marcada `@deprecated`: NO SHALL recibir entidades nuevas de dominio, sus acciones de dominio NO SHALL ser el mecanismo de mutación de las páginas y `STORE_VERSION` SHALL permanecer congelado en 28 sin migraciones de dominio nuevas. Las páginas y componentes NO SHALL importar entidades desde `apps/web/data/` (los mocks son la semilla del servidor, aplicada por los scripts `seed:mocks`/`db:*`) ni usar `useState` local para datos de dominio: leen por API y mutan por las rutas REST del módulo, que validan integridad referencial al eliminar. Toda entidad nueva de un módulo SHALL declararse en la spec del módulo con su tabla Prisma, su ruta API y sus validaciones de integridad al eliminar.

#### Scenario: Página que lee mocks directamente
- **WHEN** una página o componente importa entidades desde `apps/web/data/` en lugar de leer del servidor
- **THEN** la implementación se considera fuera de regla y debe migrar a los hooks de API del módulo.

#### Scenario: Estado de dominio en useState local
- **WHEN** una página mantiene datos de dominio en `useState` local
- **THEN** la implementación debe migrar a los hooks de API (`lib/api/use-*`) del módulo.

#### Scenario: Entidad nueva sin acciones en el store
- **WHEN** se incorpora una entidad nueva de un módulo
- **THEN** la entidad se declara en la spec del módulo con tabla Prisma, ruta API y validaciones de integridad al eliminar, y NO se agrega al store legacy.
