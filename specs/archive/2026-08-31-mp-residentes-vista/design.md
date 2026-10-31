## Context

`AppSidebar` (`k0mp4ss_fe/apps/web/components/app-sidebar.tsx`) define `RUTAS_PENDIENTES` con `/personas/residentes` bloqueado. El dato maestro vive en `lib/store.ts` (`personas` + `vinculos` + `unidades`) con seed en `data/comunidad/personas.ts` y `data/comunidad/vinculos.ts`. La vista de referencia es `app/comunidad/personas/page.tsx` (client, `useStoreRehydrated`, `hasHydrated` skeleton, tabla con `Table` + `Badge` + link `Ver Ficha` a `/comunidad/personas/[id]`). Se reutiliza ese patrón sin duplicar edición. Ver proposal.md para motivación y specs para requisitos.

## Goals / Non-Goals

**Goals:**
- Proveer `/personas/residentes` read-only sobre datos existentes (sin mutaciones, sin `STORE_VERSION` bump).
- Filtro preciso: `vinculos` vigente (`!fechaFin`) y `rol in {propietario, arrendatario}`.
- Mostrar unidad vinculada (`unidades.find`) y `estadoCuenta`; link a ficha MP.
- Habilitar navegación del sidebar quitando la ruta de `RUTAS_PENDIENTES`.

**Non-Goals:**
- Crear/editar/borrar personas o vínculos (vive en MP/VU).
- Cambios de esquema/store/migración.
- Nuevos componentes de dominio compartidos extraídos.

## Decisions

- **Client page reutilizando patrón MP**: `app/personas/residentes/page.tsx` con `"use client"`, `useCompassStore` para `personas`/`vinculos`/`unidades`, `useStoreRehydrated` y `hasHydrated` skeleton idéntico a MP. Alternativa descartada: Server Component con lectura indirecta — el store es client Zustand persistido.
- **Filtro in-memory con useMemo**: `residentes = personas.filter(p => vinculos.some(v => v.personaId===p.id && !v.fechaFin && (v.rol==='propietario'||v.rol==='arrendatario')))` + mapeo `vinculosVigentes` por persona para mostrar unidad. Permite búsqueda por nombre/RUT y filtro adicional sin backend. Alternativa: vista derivada en store — innecesaria, solo lectura.
- **Unidad vinculada = primer vínculo vigente propietario/arrendatario** (si múltiples, mostrar todas concatenadas o la primera; elegir mostrar todas asociadas). Para simplicidad inicial mostrar badges por cada vínculo vigente que califique.
- **Link "Ver Ficha" reutilizando patrón**: `Link href={`/comunidad/personas/${persona.id}`}` con `Button asChild`, idéntico a tabla MP.
- **Sidebar**: quitar literal `"/personas/residentes"` del `Set` `RUTAS_PENDIENTES`; el resto del menú permanece con `aria-disabled` para otras pendientes.

## Risks / Trade-offs

- [Filtro con múltiples unidades por persona] → Mostrar múltiples badges de unidad; si persona tiene 2 unidades (ej. `p-3` con `u-B-201` propiet.+ `u-C-301`), ambas válidas. Mitigación: `vinculosVigentes` array, no single.
- [Seed con 0 residentes vigentes tras rehidratación corrupta] → Vista vacía con empty state "Sin residentes con vínculo vigente". Mitigación: empty state + e2e afirma contra seed real (54 vigentes esperados, verificar con `seedVinculos.filter(!fechaFin && rol propietario/arrendatario).map(personaId).unique`).
- [Hydration mismatch] → Skeleton idéntico a MP evita flash. Mitigación: `if (!hasHydrated) return skeleton`.

## Migration Plan

- Deploy: nuevo archivo page + e2e + sidebar tweak. No migración de datos.
- Rollback: revertir commit; `RUTAS_PENDIENTES` vuelve a incluir la ruta y muestra "Próximamente".

## Open Questions

- Ninguna — el filtrado y el patrón de UI quedan definidos en specs y en la referencia MP.
