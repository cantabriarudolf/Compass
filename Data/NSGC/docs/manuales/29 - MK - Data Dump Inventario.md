# 📋 MK - Data Dump: Inventario Completo

> Todos los registros mock **ya resueltos** (sin algoritmos). Copia y pega lo que necesites sin gastar tokens.
> Archivo fuente: `k0mp4ss_fe/apps/web/data/inventario/estructura.ts`

---

## 🏗️ Tipos de Unidad (5 registros)

| ID | Nombre | Categoría | m² | GC Base | Activo |
|----|--------|-----------|-----|---------|--------|
| `tipo-a` | Depto Tipo A | Depto | 55.5 | $45.000 | ✅ |
| `tipo-b` | Depto Tipo B | Depto | 42.0 | $35.000 | ✅ |
| `local-a` | Local Comercial A (Grande) | Local | 120.0 | $95.000 | ✅ |
| `local-b` | Local Comercial B (Estándar) | Local | 60.0 | $50.000 | ✅ |
| `tipo-es-1` | Estacionamiento Estándar | Estacionamiento | 12.5 | $5.000 | ✅ |

---

## 🏢 Macro Sectores (6 registros)

| ID | Nombre | Etiqueta |
|----|--------|----------|
| `torre-a` | A | Torre |
| `torre-b` | B | Torre |
| `torre-c` | C | Torre |
| `torre-d` | D | Torre |
| `torre-e` | E | Torre |
| `comercial` | Centro Comercial | Sector |

---

## 📐 Micro Sectores (21 registros)

| ID | MacroSector | Nombre | Etiqueta |
|----|-------------|--------|----------|
| `piso-torre-a-1` | `torre-a` | Piso 1 | Piso |
| `piso-torre-a-2` | `torre-a` | Piso 2 | Piso |
| `piso-torre-a-3` | `torre-a` | Piso 3 | Piso |
| `piso-torre-a-4` | `torre-a` | Piso 4 | Piso |
| `piso-torre-b-1` | `torre-b` | Piso 1 | Piso |
| `piso-torre-b-2` | `torre-b` | Piso 2 | Piso |
| `piso-torre-b-3` | `torre-b` | Piso 3 | Piso |
| `piso-torre-b-4` | `torre-b` | Piso 4 | Piso |
| `piso-torre-c-1` | `torre-c` | Piso 1 | Piso |
| `piso-torre-c-2` | `torre-c` | Piso 2 | Piso |
| `piso-torre-c-3` | `torre-c` | Piso 3 | Piso |
| `piso-torre-c-4` | `torre-c` | Piso 4 | Piso |
| `piso-torre-d-1` | `torre-d` | Piso 1 | Piso |
| `piso-torre-d-2` | `torre-d` | Piso 2 | Piso |
| `piso-torre-d-3` | `torre-d` | Piso 3 | Piso |
| `piso-torre-d-4` | `torre-d` | Piso 4 | Piso |
| `piso-torre-e-1` | `torre-e` | Piso 1 | Piso |
| `piso-torre-e-2` | `torre-e` | Piso 2 | Piso |
| `piso-torre-e-3` | `torre-e` | Piso 3 | Piso |
| `piso-torre-e-4` | `torre-e` | Piso 4 | Piso |
| `piso-comercial-1` | `comercial` | Nivel Calle | Planta |

---

## 🏠 Unidades - Torre A (16 deptos)

| ID | Piso | Nº | Tipo | m² | Estado | Rol SII |
|----|------|----|------|-----|--------|---------|
| `u-A-101` | Piso 1 | 101 | tipo-a | 55.5 | Ocupado por Propietario | 123-A11 |
| `u-A-102` | Piso 1 | 102 | tipo-a | 55.5 | Arrendado | 123-A12 |
| `u-A-103` | Piso 1 | 103 | tipo-b | 42.0 | En Juicio | 123-A13 |
| `u-A-104` | Piso 1 | 104 | tipo-b | 42.0 | Cortesía | 123-A14 |
| `u-A-201` | Piso 2 | 201 | tipo-a | 55.5 | Arrendado | 123-A21 |
| `u-A-202` | Piso 2 | 202 | tipo-a | 55.5 | En Juicio | 123-A22 |
| `u-A-203` | Piso 2 | 203 | tipo-b | 42.0 | Cortesía | 123-A23 |
| `u-A-204` | Piso 2 | 204 | tipo-b | 42.0 | Vacante | 123-A24 |
| `u-A-301` | Piso 3 | 301 | tipo-a | 55.5 | En Juicio | 123-A31 |
| `u-A-302` | Piso 3 | 302 | tipo-a | 55.5 | Cortesía | 123-A32 |
| `u-A-303` | Piso 3 | 303 | tipo-b | 42.0 | Vacante | 123-A33 |
| `u-A-304` | Piso 3 | 304 | tipo-b | 42.0 | Ocupado por Propietario | 123-A34 |
| `u-A-401` | Piso 4 | 401 | tipo-a | 55.5 | Cortesía | 123-A41 |
| `u-A-402` | Piso 4 | 402 | tipo-a | 55.5 | Vacante | 123-A42 |
| `u-A-403` | Piso 4 | 403 | tipo-b | 42.0 | Ocupado por Propietario | 123-A43 |
| `u-A-404` | Piso 4 | 404 | tipo-b | 42.0 | Arrendado | 123-A44 |

## 🏠 Unidades - Torre B (16 deptos)

| ID | Piso | Nº | Tipo | m² | Estado | Rol SII |
|----|------|----|------|-----|--------|---------|
| `u-B-101` | Piso 1 | 101 | tipo-a | 55.5 | Vacante | 123-B11 |
| `u-B-102` | Piso 1 | 102 | tipo-a | 55.5 | Ocupado por Propietario | 123-B12 |
| `u-B-103` | Piso 1 | 103 | tipo-b | 42.0 | Arrendado | 123-B13 |
| `u-B-104` | Piso 1 | 104 | tipo-b | 42.0 | En Juicio | 123-B14 |
| `u-B-201` | Piso 2 | 201 | tipo-a | 55.5 | Ocupado por Propietario | 123-B21 |
| `u-B-202` | Piso 2 | 202 | tipo-a | 55.5 | Arrendado | 123-B22 |
| `u-B-203` | Piso 2 | 203 | tipo-b | 42.0 | En Juicio | 123-B23 |
| `u-B-204` | Piso 2 | 204 | tipo-b | 42.0 | Cortesía | 123-B24 |
| `u-B-301` | Piso 3 | 301 | tipo-a | 55.5 | Arrendado | 123-B31 |
| `u-B-302` | Piso 3 | 302 | tipo-a | 55.5 | En Juicio | 123-B32 |
| `u-B-303` | Piso 3 | 303 | tipo-b | 42.0 | Cortesía | 123-B33 |
| `u-B-304` | Piso 3 | 304 | tipo-b | 42.0 | Vacante | 123-B34 |
| `u-B-401` | Piso 4 | 401 | tipo-a | 55.5 | En Juicio | 123-B41 |
| `u-B-402` | Piso 4 | 402 | tipo-a | 55.5 | Cortesía | 123-B42 |
| `u-B-403` | Piso 4 | 403 | tipo-b | 42.0 | Vacante | 123-B43 |
| `u-B-404` | Piso 4 | 404 | tipo-b | 42.0 | Ocupado por Propietario | 123-B44 |

## 🏠 Unidades - Torre C (16 deptos)

| ID | Piso | Nº | Tipo | m² | Estado | Rol SII |
|----|------|----|------|-----|--------|---------|
| `u-C-101` | Piso 1 | 101 | tipo-a | 55.5 | Cortesía | 123-C11 |
| `u-C-102` | Piso 1 | 102 | tipo-a | 55.5 | Vacante | 123-C12 |
| `u-C-103` | Piso 1 | 103 | tipo-b | 42.0 | Ocupado por Propietario | 123-C13 |
| `u-C-104` | Piso 1 | 104 | tipo-b | 42.0 | Arrendado | 123-C14 |
| `u-C-201` | Piso 2 | 201 | tipo-a | 55.5 | Vacante | 123-C21 |
| `u-C-202` | Piso 2 | 202 | tipo-a | 55.5 | Ocupado por Propietario | 123-C22 |
| `u-C-203` | Piso 2 | 203 | tipo-b | 42.0 | Arrendado | 123-C23 |
| `u-C-204` | Piso 2 | 204 | tipo-b | 42.0 | En Juicio | 123-C24 |
| `u-C-301` | Piso 3 | 301 | tipo-a | 55.5 | Ocupado por Propietario | 123-C31 |
| `u-C-302` | Piso 3 | 302 | tipo-a | 55.5 | Arrendado | 123-C32 |
| `u-C-303` | Piso 3 | 303 | tipo-b | 42.0 | En Juicio | 123-C33 |
| `u-C-304` | Piso 3 | 304 | tipo-b | 42.0 | Cortesía | 123-C34 |
| `u-C-401` | Piso 4 | 401 | tipo-a | 55.5 | Arrendado | 123-C41 |
| `u-C-402` | Piso 4 | 402 | tipo-a | 55.5 | En Juicio | 123-C42 |
| `u-C-403` | Piso 4 | 403 | tipo-b | 42.0 | Cortesía | 123-C43 |
| `u-C-404` | Piso 4 | 404 | tipo-b | 42.0 | Vacante | 123-C44 |

## 🏠 Unidades - Torre D (16 deptos)

| ID | Piso | Nº | Tipo | m² | Estado | Rol SII |
|----|------|----|------|-----|--------|---------|
| `u-D-101` | Piso 1 | 101 | tipo-a | 55.5 | En Juicio | 123-D11 |
| `u-D-102` | Piso 1 | 102 | tipo-a | 55.5 | Cortesía | 123-D12 |
| `u-D-103` | Piso 1 | 103 | tipo-b | 42.0 | Vacante | 123-D13 |
| `u-D-104` | Piso 1 | 104 | tipo-b | 42.0 | Ocupado por Propietario | 123-D14 |
| `u-D-201` | Piso 2 | 201 | tipo-a | 55.5 | Cortesía | 123-D21 |
| `u-D-202` | Piso 2 | 202 | tipo-a | 55.5 | Vacante | 123-D22 |
| `u-D-203` | Piso 2 | 203 | tipo-b | 42.0 | Ocupado por Propietario | 123-D23 |
| `u-D-204` | Piso 2 | 204 | tipo-b | 42.0 | Arrendado | 123-D24 |
| `u-D-301` | Piso 3 | 301 | tipo-a | 55.5 | Vacante | 123-D31 |
| `u-D-302` | Piso 3 | 302 | tipo-a | 55.5 | Ocupado por Propietario | 123-D32 |
| `u-D-303` | Piso 3 | 303 | tipo-b | 42.0 | Arrendado | 123-D33 |
| `u-D-304` | Piso 3 | 304 | tipo-b | 42.0 | En Juicio | 123-D34 |
| `u-D-401` | Piso 4 | 401 | tipo-a | 55.5 | Ocupado por Propietario | 123-D41 |
| `u-D-402` | Piso 4 | 402 | tipo-a | 55.5 | Arrendado | 123-D42 |
| `u-D-403` | Piso 4 | 403 | tipo-b | 42.0 | En Juicio | 123-D43 |
| `u-D-404` | Piso 4 | 404 | tipo-b | 42.0 | Cortesía | 123-D44 |

## 🏠 Unidades - Torre E (16 deptos)

| ID | Piso | Nº | Tipo | m² | Estado | Rol SII |
|----|------|----|------|-----|--------|---------|
| `u-E-101` | Piso 1 | 101 | tipo-a | 55.5 | Arrendado | 123-E11 |
| `u-E-102` | Piso 1 | 102 | tipo-a | 55.5 | En Juicio | 123-E12 |
| `u-E-103` | Piso 1 | 103 | tipo-b | 42.0 | Cortesía | 123-E13 |
| `u-E-104` | Piso 1 | 104 | tipo-b | 42.0 | Vacante | 123-E14 |
| `u-E-201` | Piso 2 | 201 | tipo-a | 55.5 | En Juicio | 123-E21 |
| `u-E-202` | Piso 2 | 202 | tipo-a | 55.5 | Cortesía | 123-E22 |
| `u-E-203` | Piso 2 | 203 | tipo-b | 42.0 | Vacante | 123-E23 |
| `u-E-204` | Piso 2 | 204 | tipo-b | 42.0 | Ocupado por Propietario | 123-E24 |
| `u-E-301` | Piso 3 | 301 | tipo-a | 55.5 | Cortesía | 123-E31 |
| `u-E-302` | Piso 3 | 302 | tipo-a | 55.5 | Vacante | 123-E32 |
| `u-E-303` | Piso 3 | 303 | tipo-b | 42.0 | Ocupado por Propietario | 123-E33 |
| `u-E-304` | Piso 3 | 304 | tipo-b | 42.0 | Arrendado | 123-E34 |
| `u-E-401` | Piso 4 | 401 | tipo-a | 55.5 | Vacante | 123-E41 |
| `u-E-402` | Piso 4 | 402 | tipo-a | 55.5 | Ocupado por Propietario | 123-E42 |
| `u-E-403` | Piso 4 | 403 | tipo-b | 42.0 | Arrendado | 123-E43 |
| `u-E-404` | Piso 4 | 404 | tipo-b | 42.0 | En Juicio | 123-E44 |

## 🏪 Unidades - Centro Comercial (3 locales)

| ID | Nº | Tipo | m² | Prorrateo | Estado | Rol SII |
|----|-----|------|-----|-----------|--------|---------|
| `u-LC-01` | L-01 | local-a | 120.0 | 0.050 | Ocupado por Propietario | 999-01 |
| `u-LC-02` | L-02 | local-b | 60.0 | 0.025 | Arrendado | 999-02 |
| `u-LC-03` | L-03 | local-b | 60.0 | 0.025 | Vacante | 999-03 |

---

> **Patrón de IDs para crear nuevos:** `u-{TORRE}-{PISO}0{CORRELATIVO}` → ej: `u-A-501` sería Torre A, Piso 5, depto 1.
> **Prorrateo estándar deptos:** `0.0125` | **Locales:** `0.025` a `0.050`
> **Todos los deptos tienen servicios:** agua (`C-AG-{T}-{N}`) y luz (`C-LZ-{T}-{N}`)

---

*Última actualización: 09 de Mayo 2026*
