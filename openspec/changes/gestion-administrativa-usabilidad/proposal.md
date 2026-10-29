# Proposal: gestion-administrativa-usabilidad

## Contexto

`k0mp4ss_fe/apps/web/app/admin/gestion/page.tsx` (359 líneas) muestra «Gestión Administrativa»
con cuatro pestañas (Propietarios / Residentes / Directiva / Personal). La auditoría de usabilidad
del 2026-10-26 encontró siete problemas; uno de ellos resultó ser un **defecto de contrato**, no de
estética:

| # | Hallazgo | Evidencia |
| --- | --- | --- |
| D1 | **Truncamiento silencioso.** Los contadores de pestaña se calculan sobre la primera página de 100 y se presentan como el universo. El hook documenta que el consumidor *debe* avisar | `lib/api/use-personas.ts:99-103` exige el aviso (`total > personas.length`, ver `components/pe/aviso-truncamiento.tsx`); `app/admin/gestion/page.tsx:63` destructura sin `total` |
| D2 | **Búsqueda server-side disponible y sin usar** | `use-personas.ts:112` acepta `usePersonas(q)` → `?q=` (nombreCompleto \| rut \| email); la página llama `usePersonas()` sin argumento |
| D3 | **Dos metáforas en la misma página** | Pestañas 1–3: una `Card` completa por persona. Pestaña 4: tabla |
| D4 | **Las pestañas no son pestañas** | Propietarios/Residentes/Directiva/Personal son recortes solapados de la misma colección (`directiva = personas.filter(p => p.datosGobernanza != null)`); la misma persona aparece en dos |
| D5 | **El error aparece lejos de su causa** | Una sola línea en `:149`, arriba de todo; un switch que falla 40 filas abajo no deja rastro visible |
| D6 | **La firma se muestra como URL cruda** | `:262` imprime el string de la URL en texto verde: no hay forma de verificar qué se guardó |

**Retirado durante la verificación:** la sospecha de que `<label>` envolviendo el `Switch` no
reenviara el click es **falsa**. `<button>` es elemento etiquetable y el patrón es convención del
repo (`app/personas/personal/page.tsx:731`). No se presenta como defecto.

## Objetivo

Que cada una de las dos tareas que hoy conviven mal encuentre su forma: el **directorio de personas**
se lee y se busca como directorio; la **configuración de privacidad por unidad** se ve y se edita
como matriz por unidad, que es la unidad sobre la que realmente opera.

## Alcance

Solo `app/admin/gestion/page.tsx`. Sin cambios de rutas, de endpoints, de esquema, de RBAC ni de
otros módulos.

1. **Una tabla de directorio** con buscador server-side (`?q=`, con debounce) y **chips de rol como
   filtros multi-selección** en lugar de pestañas (los roles se solapan: D4).
2. **Matriz de privacidad por unidad**: una fila por unidad, tres columnas de switch, columna de
   origen (`explícito` / `defaults`) y propietario vigente. Sustituye las 142 tarjetas anidadas.
3. **Ficha en panel lateral** (`Sheet`) para foto, contacto, unidades, gobernanza y datos laborales;
   reemplaza las tarjetas de las tres pestañas de personas.
4. **Aviso de truncamiento** en directorio y en privacidad (D1), reutilizando `AvisoTruncamiento`.
5. **Estado por fila** al guardar un control: guardando / error en la propia fila (D5).
6. **Firma con preview real de la imagen**, editable en la ficha (D6).
7. Subtítulo en lenguaje de administrador de comunidad, no de desarrollo.

## Fuera de alcance

- Delegar el directorio a `/comunidad/personas` o mover los switches a `/inventario/estructura`
  (opciones consideradas y descartadas por el owner en esta ronda).
- Paginación con «cargar más» en el directorio: se mantiene `pageSize=100` y se declara el
  truncamiento, que es lo que exige el contrato del hook.
- Cambiar la semántica de `actualizarControl`, sus defaults o el endpoint.

## Criterios de aceptación

1. Con más de 100 personas, la vista declara cuántas muestra y cuántas existen.
2. Buscar por nombre, RUT o email dispara `?q=` en el servidor, no un filtro en memoria.
3. Un rol se elige y se combina con otro; una misma persona puede aparecer bajo dos roles sin
   duplicar filas.
4. Cambiar un switch persiste con la misma semántica que antes y el error, si ocurre, se ve en esa
   fila.
5. La ficha muestra la imagen de la firma cuando la URL es http(s).
6. Typecheck, lint, suite y build en verde.
