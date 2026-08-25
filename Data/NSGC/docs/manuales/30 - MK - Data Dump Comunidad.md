# 📋 MK - Data Dump: Personas y Estacionamientos

> Todos los registros mock de comunidad y parking **ya resueltos**.
> Archivos fuente: `data/comunidad/personas.ts` (y `data/inventario/estacionamientos.ts`, hoy eliminado).

> [!WARNING]
> **Dump histórico.** El maestro creció a **54 personas** (`p-1`…`p-54`, incluye empresas SpA) con 51 vínculos, y todos los RUT fueron migrados a DV válido (`scripts/fix-rut-seeds.cjs`) — los RUT de las tablas de abajo pueden diferir del código vigente. Las plazas `es-*` ya no existen: son unidades `u-E-*` en EF (ver Dump 29). Para registros actuales manda el código fuente; las colecciones nuevas de Sesión 1 NSGC están vacías por diseño (ver Dump 35).

---

## 👤 Personas (10 registros)

### Tabla maestra

| ID | RUT | Nombre | Email | Móvil | Estado | Roles |
|----|-----|--------|-------|-------|--------|-------|
| `p-1` | 15.123.456-7 | Juan Pérez González | juan.perez@email.com | +56 9 1234 5678 | activa | propietario, residente, directiva |
| `p-2` | 18.987.654-3 | María López Soto | maria.lopez@email.com | +56 9 8765 4321 | activa | residente |
| `p-3` | 12.345.678-9 | Roberto Gómez Bolaños | roberto.gomez@email.com | +56 9 5555 4444 | activa | propietario |
| `p-4` | 19.111.222-K | Ana María Silva | ana.silva@email.com | +56 9 9999 1111 | activa | personal, residente |
| `p-5` | 13.555.666-8 | Carlos Castillo Ruiz | admin@compass.cl | +56 9 3333 7777 | activa | personal |
| `p-6` | 14.222.333-4 | Laura Martínez Cárdenas | laura.tesoreria@email.com | +56 9 8888 2222 | activa | propietario, residente, directiva |
| `p-7` | 17.444.555-6 | Pedro Valdés Orellana | pvaldes@ascensores.cl | +56 9 6666 5555 | activa | contratista |
| `p-8` | 20.123.987-5 | Tomás Alarcón | tomas.alarcon.antiguo@email.com | +56 9 1111 2222 | inactiva | residente |
| `p-9` | 11.234.567-0 | Rosa Meléndez | rosa.aseo@email.com | +56 9 4444 3333 | activa | personal |
| `p-10` | 16.777.888-9 | Esteban Dido | esteban.bloqueado@email.com | +56 9 0000 0000 | bloqueada | residente |

### Vínculos persona → unidad

| Vínculo ID | Persona | Unidad | Rol | Desde | Hasta | Estado Propiedad | Ve Finanzas |
|------------|---------|--------|-----|-------|-------|-----------------|-------------|
| `v-1` | p-1 (Juan) | `u-A-101` | propietario | 2024-01-15 | — | habitada | ✅ |
| `v-2` | p-2 (María) | `u-B-201` | arrendatario | 2025-01-01 | — | — | ❌ |
| `v-3` | p-3 (Roberto) | `u-B-201` | propietario | 2020-05-10 | — | arrendada | ❌ |
| `v-4` | p-3 (Roberto) | `u-C-301` | propietario | 2023-11-20 | — | proxima_vacancia | ❌ |
| `v-31` | p-3 (Roberto) | `u-LC-01` | propietario | 2021-02-14 | — | en_venta | ❌ |
| `v-5` | p-4 (Ana María) | `u-D-401` | residente | 2022-02-01 | — | — | ❌ |
| `v-6` | p-6 (Laura) | `u-A-102` | propietario | 2019-10-10 | — | habitada | ✅ |
| `v-8` | p-8 (Tomás) | `u-C-301` | arrendatario | 2021-03-01 | 2023-11-19 | — | ❌ |
| `v-10` | p-10 (Esteban) | `u-B-202` | arrendatario | 2024-08-01 | — | — | ✅ |

### Extensiones laborales (personal)

| ID | Persona | Cargo | AFP | Previsión | Ingreso |
|----|---------|-------|-----|-----------|---------|
| `l-1` | p-4 (Ana María) | Conserje Turno Día | Habitat | Fonasa | 2021-06-15 |
| `l-2` | p-5 (Carlos) | Administrador General | Cuprum | Isapre Banmédica | 2023-01-01 |
| `l-3` | p-9 (Rosa) | Auxiliar de Aseo | Modelo | Fonasa | 2020-05-15 |

### Extensiones gobernanza (directiva)

| ID | Persona | Cargo | Asunción |
|----|---------|-------|----------|
| `g-1` | p-1 (Juan) | presidente | 2025-03-01 |
| `g-2` | p-6 (Laura) | tesorero | 2025-03-01 |

### Condiciones especiales (vulnerabilidades)

| Persona | IDs Condición | Descripción |
|---------|--------------|-------------|
| p-2 (María) | `c-2` | Movilidad Reducida |
| p-4 (Ana María) | `c-1`, `c-3` | Electrodependiente, Adulto Mayor Solo |

---

## 🚗 Estacionamientos (100 plazas)

### Resumen por rango

| Rango | Nivel | Cantidad | Asignación |
|-------|-------|----------|------------|
| P-001 a P-008 | Subterráneo -1 | 8 | Locales comerciales |
| P-009 a P-088 | Mixto | 80 | Unidades residenciales (en orden) |
| P-089 a P-100 | Subterráneo -2 | 12 | **Disponible (sin asignar)** |

### Plazas con historial especial

| Plaza | Historial | Caso que simula |
|-------|-----------|----------------|
| `es-1` (P-001) | Constructora → Ex-Dueño Depto 204 → Local L-01 | Alta rotación (3 dueños) |
| `es-15` (P-015) | Residente Temporal → Depto actual | Rotación moderada |
| `es-30` (P-030) | Residente Temporal → Depto actual | Rotación moderada |

### Plazas comerciales (detalle)

| ID | Nº | Unidad asignada | Asignado a | Sector |
|----|----|----------------|------------|--------|
| `es-1` | P-001 | `u-LC-01` | Local Comercial L-01 (Ancla) | comercial |
| `es-2` | P-002 | `u-LC-01` | Local Comercial 01 | comercial |
| `es-3` | P-003 | `u-LC-01` | Local Comercial 01 | comercial |
| `es-4` | P-004 | `u-LC-01` | Local Comercial 01 | comercial |
| `es-5` | P-005 | `u-LC-02` | Local Comercial 02 | comercial |
| `es-6` | P-006 | `u-LC-02` | Local Comercial 02 | comercial |
| `es-7` | P-007 | `u-LC-03` | Local Comercial 03 | comercial |
| `es-8` | P-008 | `u-LC-03` | Local Comercial 03 | comercial |

### Patrón para crear nuevas plazas

```
ID:        es-{numero}
Número:    P-{numero con 3 dígitos}  → P-001, P-042, P-100
Ubicación: {Nivel}, Sector {Alfa|Beta}, Plaza P-{NNN}
Metraje:   12.5 (estándar)
Prorrateo: 0.005
EstadoId:  "ocupado-prop" si tiene unidad, "vacante" si no
Nivel:     num <= 50 → "Subterráneo -1" | num > 50 → "Subterráneo -2"
Sector:    num par → "Alfa" | num impar → "Beta"
```

---

## 🔑 Maestros Administrativos (catálogos)

### Estados de Ocupación

| ID | Nombre | Color CSS |
|----|--------|-----------|
| `vacante` | Vacante | bg-emerald-500 |
| `ocupado-prop` | Ocupado Propietario | bg-blue-600 |
| `arrendado` | Arrendado | bg-purple-600 |
| `juicio` | En Juicio / Legal | bg-rose-600 |
| `mantencion` | En Mantención | bg-amber-500 |
| `vacio` | Vacío | bg-zinc-400 |
| `inactivo` | Inactivo | bg-zinc-900 |

### Ubicaciones Estacionamiento

| ID | Nombre |
|----|--------|
| `superficie` | Superficie |
| `subterraneo-1` | Subterráneo -1 |
| `subterraneo-2` | Subterráneo -2 |
| `visitas` | Sector Visitas |

---

*Última actualización: 09 de Mayo 2026*
