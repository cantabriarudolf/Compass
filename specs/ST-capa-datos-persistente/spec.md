# ST-capa-datos-persistente Specification

## Purpose

Capa de datos del dominio: la base de datos, vía API REST, es la única fuente de verdad y el navegador no guarda estado de dominio. Del store legacy que vivió en `k0mp4ss_fe/apps/web/lib/store.ts` sobreviven únicamente helpers puros, sin estado ni persistencia.

## Requirements

### Requirement: Persistencia entre recargas

El sistema SHALL persistir los datos de dominio en el servidor (base de datos vía API REST), de modo que las modificaciones realizadas en la interfaz sobrevivan a recargas de página. El navegador NO SHALL guardar estado de dominio: el store legacy del cliente se retiró en F22/F22a, y con él `useCompassStore`, `persist`, `STORE_VERSION`, `migrate`, `ESQUEMAS_COLECCION`, `partialize`, `skipHydration` y los hooks de hidratación (`useStoreRehydrated`, `rehydrateStore`, `waitForStoreHydration`). Del store retirado sobreviven sólo símbolos puros, con consumidores vivos: el tipo `StoreResult`, `esMiembroDirectivaVigente` y `periodoDirectivaVigente` (`k0mp4ss_fe/apps/web/lib/store/helpers.ts`) y `repararRut` (`k0mp4ss_fe/apps/web/lib/store.ts`). La clave `compass-store` que dejó ese store SHALL eliminarse una sola vez por navegador desde `k0mp4ss_fe/apps/web/components/limpieza-store-legacy.tsx`, montado en el layout raíz; la clave `compass-ui-store` (`k0mp4ss_fe/apps/web/lib/store-ui.ts`) NO SHALL eliminarse, porque sostiene el estado de UI.

#### Scenario: Cambio persistido al recargar
- **WHEN** el usuario crea o edita una entidad y luego recarga la página
- **THEN** el estado cargado refleja la última versión guardada en el servidor, no el seed inicial de los mocks.

#### Scenario: Navegador con la clave del store retirado
- **WHEN** un navegador que todavía tiene la clave `compass-store` en `localStorage` abre la aplicación
- **THEN** la clave se elimina una sola vez, ninguna pantalla la lee
- **AND** el estado de UI persistido en `compass-ui-store` queda intacto.
