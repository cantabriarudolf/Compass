# Tareas — Store Split Fase 2

## Slice IR — Inventario y Recursos (primero, riesgo mínimo)
- [ ] 1.1 Crear `lib/store/slices/ir-slice.ts` con estado + 9 acciones
- [ ] 1.2 Extraer tipos `RecursoIR`, `SolicitudInsumoIR`, `EntregaEPP` si no están en `types/`
- [ ] 1.3 Actualizar `lib/store.ts`: importar `irSlice` y combinar con spread
- [ ] 1.4 Remover duplicados de IR de `lib/store.ts`
- [ ] 1.5 Verificar: tsc 0, tests IR verdes, suite store completa verde
- [ ] 1.6 e2e CRUD IR verde
- [ ] 1.7 Migración v27 con backup: datos intactos

## Slice MT — Mantenimiento y Proyectos
- [ ] 2.1 Crear `lib/store/slices/mt-slice.ts`
- [ ] 2.2 Combinar en store.ts, remover duplicados
- [ ] 2.3 Verificar tests + tsc + e2e

## Slice AD — Gestión Administrativa
- [ ] 3.1 Crear `lib/store/slices/ad-slice.ts` (incluye actasGD)
- [ ] 3.2 Nota: `publicarActaEnCV` muta `avisosCV` — permitido en Fase 2
- [ ] 3.3 Verificar tests + tsc + e2e

## Slices PI/D3, CO, GE, CV (resto de Fase 2)
- [ ] 4.1 PI: `lib/store/slices/pi-slice.ts`
- [ ] 4.2 CO: `lib/store/slices/co-slice.ts`
- [ ] 4.3 GE: `lib/store/slices/ge-slice.ts`
- [ ] 4.4 CV: `lib/store/slices/cv-slice.ts`
- [ ] 4.5 Verificación completa: tsc, tests, e2e

## Post-Fase 2
- [ ] 5.1 Documentar en manual de arquitectura
- [ ] 5.2 Avance NSGC
