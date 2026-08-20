# ST - Capa de Datos Persistente

Este módulo define la capa de datos del frontend: un store global que centraliza el estado del dominio, lo persiste entre recargas y expone acciones CRUD validadas por entidad. Es la Fase 0 de la estrategia de datos: mientras no exista backend, la persistencia vive en el navegador (localStorage).

## 1. Arquitectura

- **Store Global (Zustand + persist):** Todos los conjuntos de entidades viven en `apps/web/lib/store.ts`, sembrados desde los mocks de `apps/web/data/`.
- **Persistencia:** Middleware `persist` sobre localStorage con key `compass-store`, versión del esquema y función `migrate` para futuras migraciones.
- **Patrón Repository:** Las páginas nunca mutan el estado directamente; solo invocan acciones CRUD expuestas por el store. Esto garantiza consistencia entre módulos.

## 2. Entidades Cobertas

- **Inventario (TU/EF):** tipos de unidad, macro sectores, micro sectores y unidades físicas (desde v8 los estacionamientos son unidades físicas con `tipoUnidadId: tipo-es-1` y microsectores `est-*` en EF; no hay colección separada `estacionamientos`).
- **Comunidad (MP/VU):** personas y vínculos de unidad.
- **Administración (MA):** maestros administrativos (AFP, bancos, previsión, feriados, etc.) y maestros de estructura, inventario y vínculos (estados de ocupación con `hex` de color, categorías macro, categorías micro, categorías de unidad y estados inmobiliarios — `ubicacionesEstacionamiento` fue absorbido como microsectores de EF en v8).
- **Configuración (CF):** parámetros globales de la comunidad.

## 3. Reglas de Integridad al Eliminar

Las acciones de eliminación validan dependencias y rechazan la operación si existen vínculos:

- **Tipo de Unidad:** no se elimina si tiene unidades físicas vinculadas (`tipoUnidadId`).
- **Macro Sector:** no se elimina si tiene micro sectores asociados.
- **Micro Sector:** no se elimina si tiene unidades asociadas.
- **Unidad:** no se elimina si tiene vínculos de persona asociados (desde v8 también cubre unidades-estacionamiento `u-E-*`; la validación legacy "unidad con estacionamientos" se subsume aquí).
- **Persona:** no se elimina si tiene vínculos de unidad asociados.
- **Maestros (MA):** `removeMaestro` valida que `estadosOcupacion`, `categoriasUnidad`, `categoriasMacro/Micro`, `estadosInmobiliarios`, `condicionesEspeciales` no estén en uso por unidades/tipos/vínculos/personas.
- **Nota v7 legacy:** la regla "Estacionamiento no se elimina si tiene asignación activa" aplicaba a la colección `estacionamientos` eliminada en v8; ahora aplica como "Unidad-estacionamiento no se elimina si tiene vínculos (VU)".

## 3b. Reglas de Negocio al Guardar Vínculos (VU)

`saveVinculo` valida antes de persistir y devuelve el error si se incumple alguna regla:

- **Persona existente:** la persona vinculada debe existir en el Maestro de Personas.
- **Persona inactiva:** una persona con `estadoCuenta: "inactiva"` no puede vincularse a una unidad.
- **Vínculo duplicado:** no puede existir más de un vínculo activo (sin `fechaFin`) de la misma persona a la misma unidad.
- **Solapamiento de arriendos:** los contratos de arriendo (`rol: "arrendatario"`) en la misma unidad no pueden solaparse en sus rangos de fechas (`fechaInicio`-`fechaFin`, siendo `fechaFin` ausente un rango abierto).

## 4. Compartición entre Módulos

Al existir una única instancia de estado por entidad, las modificaciones hechas en un módulo se reflejan en los demás:

- Un tipo creado en TU aparece en los formularios de EF (incluye unidades-estacionamiento `u-E-*` filtradas por `tipo-es-1`).
- Una unidad editada en EF se refleja en TU (conteo de unidades vinculadas) y en VU (vínculos).
- Desde v8, EF es el único dueño del inventario físico; ES se consulta como vista filtrada de `unidades` por categoría `Estacionamiento`.

## 5. Sembrado y Versiones

- En la primera carga (sin estado persistido), el store se siembra desde los mocks de `apps/web/data/` (`data/inventario/estructura.ts` incluye desde v8 los 83 estacionamientos como unidades `u-E-*`).
- Una vez persistido, el localStorage manda por sobre el seed.
- La versión del esquema (`compass-store` v8) habilita migraciones ordenadas de datos sin romper al usuario. El `migrate` v8 fusiona `categoriasMacro`/`macroSectores`/`microSectores`/`unidades` por id y limpia `estacionamientos`/`ubicacionesEstacionamiento` legacy.

## 6. Hidratación y Renderizado SSR

Para evitar errores de hidratación de React (mismatch entre el HTML del servidor y el primer render del cliente):

- El persist usa `skipHydration: true`; la rehidratación se dispara solo en el cliente mediante `useStoreRehydrated()` (useEffect).
- Toda página que renderiza datos del store muestra un esqueleto (skeleton) mientras `hasHydrated` es `false` y monta el contenido real solo tras la hidratación.
- Regla obligatoria para páginas nuevas: incluir `useStoreRehydrated()`, el guard `hasHydrated` y el skeleton, siguiendo el patrón de las páginas existentes (TU, EF, MP, VU, MA, CF, AM — ES absorbido en EF).