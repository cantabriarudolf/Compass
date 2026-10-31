# 🔷 06 - Interfaces TypeScript: FormularioVinculoUnidad

Este documento define las interfaces TypeScript para el componente `FormularioVinculoUnidad`, el mapeo entre los estados locales del formulario y la estructura de datos del mock `personas.ts`, y los contratos de props para cada sub-componente involucrado en el CRUD de vínculos.

---

## 🧭 Contexto: Flujo de Datos

```
[personas.ts: Persona.vinculosUnidad[]]
        ↕ (lectura inicial / escritura tras submit)
[page.tsx: useState<VinculoUnidad[]>(persona.vinculosUnidad)]
        ↓ (props drilling)
[FormularioVinculoUnidad: estado local del formulario]
        ↓ (onSubmit callback)
[page.tsx: actualiza el estado local in-memory]
```

El estado raíz de los vínculos vive en la página `[id]/page.tsx`. El formulario opera sobre una copia local transitoria. Al confirmar, se dispara un callback que actualiza el array en el estado de React.

---

## ⚠️ GAP CRÍTICO: Divergencia de Roles en el Mock

El campo `rol` de `VinculoUnidad` en `personas.ts` declara actualmente:

```typescript
// ❌ ESTADO ACTUAL (personas.ts línea 9)
rol: "propietario" | "residente" | "arrendatario";
```

El `design.md` y las specs exigen **4 roles**, y `"residente"` no es un rol de vínculo directo (es derivado del `Persona.roles[]`):

```typescript
// ✅ ESTADO REQUERIDO (Tarea 1.1)
rol: "propietario" | "arrendatario" | "copropietario" | "ocupante";
```

> [!CAUTION]
> El mock de `p-4` (Ana Silva) usa `rol: "residente"` en `v-5`. Esto es un dato legacy que debe migrarse a `"ocupante"` o resolverse en la Tarea 1.1, ya que **"residente" no pertenece al dominio de los roles de vínculo** según la spec.

---

## 🔧 Interfaces TypeScript Actualizadas

### 1. Tipos de Dominio (en `data/comunidad/personas.ts`)

```typescript
// ─── TIPOS DE DOMINIO ───────────────────────────────────────────

/** Roles válidos para un VinculoUnidad (Task 1.1) */
export type RolVinculo =
  | "propietario"
  | "arrendatario"
  | "copropietario"    // Incluye Familiar (etiqueta en UI)
  | "ocupante";

/** Estados válidos del inmueble. Solo aplica cuando rol === "propietario" */
export type EstadoOcupacionPropiedad =
  | "habitada"
  | "proxima_vacancia"
  | "en_arriendo"
  | "arrendada"
  | "en_venta";

/** Interfaz actualizada de VinculoUnidad (reemplaza la actual en personas.ts) */
export interface VinculoUnidad {
  id: string;
  unidadId: string;                                   // FK → estructura.ts Unidad.id
  rol: RolVinculo;
  fechaInicio: string;                                // formato ISO "YYYY-MM-DD"
  fechaFin?: string;                                  // opcional, para historial
  // Campos condicionales: solo disponibles cuando rol === "propietario"
  estadoOcupacionPropiedad?: EstadoOcupacionPropiedad;
  permiteVerFinanzas?: boolean;                       // ← era obligatorio, ahora opcional
}
```

> [!NOTE]
> `permiteVerFinanzas` cambia de `boolean` (obligatorio) a `boolean | undefined` (opcional) porque para roles no-propietario el campo no aplica y no debe almacenarse con `false` por defecto, lo que sería ambiguo.

---

### 2. Estado Local del Formulario (`FormState`)

Representa el estado transitorio del `<FormularioVinculoUnidad>`. Es una versión "draft" que no tiene `id` asignado hasta el submit.

```typescript
// ─── ESTADO LOCAL DEL FORMULARIO ────────────────────────────────

/** Estado interno del formulario (draft, pre-submit) */
export interface FormularioVinculoState {
  unidadId: string;                                   // Campo requerido
  rol: RolVinculo | "";                               // Vacío al inicializar
  fechaInicio: string;                                // Requerido
  fechaFin: string;                                   // Opcional, string vacío si no aplica
  // Campos condicionales (solo activos si rol === "propietario")
  estadoOcupacionPropiedad: EstadoOcupacionPropiedad | "";
  permiteVerFinanzas: boolean;
}

/** Valor inicial del formulario para modo Creación */
export const FORMULARIO_VINCULO_INITIAL_STATE: FormularioVinculoState = {
  unidadId: "",
  rol: "",
  fechaInicio: "",
  fechaFin: "",
  estadoOcupacionPropiedad: "",
  permiteVerFinanzas: false,
};
```

---

### 3. Props del Componente `FormularioVinculoUnidad`

El componente opera en dos modos: **Creación** y **Edición**.

```typescript
// ─── PROPS DEL COMPONENTE ────────────────────────────────────────

import { Unidad } from "@/data/inventario/estructura";

/** Props para el componente FormularioVinculoUnidad */
export interface FormularioVinculoUnidadProps {
  /**
   * MODO DEL FORMULARIO
   * - "crear": formulario vacío, genera nuevo id al submit
   * - "editar": formulario pre-poblado con vinculoExistente
   */
  modo: "crear" | "editar";

  /**
   * Datos del vínculo existente para pre-poblar en modo "editar".
   * Requerido cuando modo === "editar", debe ser undefined en modo "crear".
   */
  vinculoExistente?: VinculoUnidad;

  /**
   * Lista de unidades disponibles en el inventario.
   * Proviene de estructura.ts → unidades[]
   * DEBE venir ya filtrada (sin las unidades ya vinculadas a la persona activa)
   * para garantizar validación anti-duplicados en la Tarea 3.2.
   */
  unidadesDisponibles: Unidad[];

  /**
   * Callback disparado al confirmar el formulario.
   * En modo "crear": recibe el VinculoUnidad nuevo (sin id, el componente lo genera).
   * En modo "editar": recibe el VinculoUnidad actualizado con el id original.
   */
  onSubmit: (vinculo: VinculoUnidad) => void;

  /**
   * Callback para cancelar/cerrar el modal sin guardar cambios.
   */
  onCancel: () => void;
}
```

---

### 4. Props del Componente Padre (Pestaña Unidades en `page.tsx`)

Muestra el estado reactivo de los vínculos y orquesta los modales.

```typescript
// ─── ESTADO LOCAL EN page.tsx ────────────────────────────────────

/**
 * Estado local que gestiona los vínculos de la persona en page.tsx.
 * Se inicializa desde persona.vinculosUnidad y se muta in-memory.
 */
interface PestanaUnidadesState {
  vinculos: VinculoUnidad[];
  modalCrearAbierto: boolean;
  vinculoEnEdicion: VinculoUnidad | null;    // null = ninguno en edición
  vinculoParaEliminar: VinculoUnidad | null; // null = ninguno pendiente de eliminar
}
```

---

## 🗺️ Mapeo Estado Local ↔ Mock de Personas

| Campo `FormularioVinculoState` | Campo `VinculoUnidad` (mock) | Notas |
| :--- | :--- | :--- |
| `unidadId` | `unidadId` | Mapeo directo 1:1 |
| `rol` | `rol` | Se expande de 3 → 4 valores (Tarea 1.1) |
| `fechaInicio` | `fechaInicio` | Formato ISO string |
| `fechaFin` | `fechaFin?` | Undefined si string vacío al guardar |
| `estadoOcupacionPropiedad` | `estadoOcupacionPropiedad?` | Solo si `rol === "propietario"`, undefined si no |
| `permiteVerFinanzas` | `permiteVerFinanzas?` | Solo si `rol === "propietario"`, undefined si no |
| *(generado al submit)* | `id` | Generado con `crypto.randomUUID()` en modo crear |

---

## 🔴 Lógica Condicional de Campos (Task 3.3 y 3.4)

```typescript
// Pseudocódigo del comportamiento reactivo en FormularioVinculoUnidad

const esPropietario = formState.rol === "propietario";

// Al cambiar de rol a uno no-propietario, limpiar campos condicionales:
const handleRolChange = (nuevoRol: RolVinculo | "") => {
  setFormState(prev => ({
    ...prev,
    rol: nuevoRol,
    // Limpiar campos condicionales si ya no aplica:
    estadoOcupacionPropiedad: nuevoRol === "propietario" ? prev.estadoOcupacionPropiedad : "",
    permiteVerFinanzas: nuevoRol === "propietario" ? prev.permiteVerFinanzas : false,
  }));
};
```

---

## ✅ Contrato de Transformación al Submit

```typescript
/**
 * Transforma el FormularioVinculoState a un VinculoUnidad listo para el mock.
 * Limpia campos condicionales que no apliquen según el rol.
 */
function transformarFormAVinculo(
  form: FormularioVinculoState,
  idExistente?: string
): VinculoUnidad {
  const esNuevo = !idExistente;
  const esPropietario = form.rol === "propietario";

  return {
    id: idExistente ?? crypto.randomUUID(),
    unidadId: form.unidadId,
    rol: form.rol as RolVinculo,
    fechaInicio: form.fechaInicio,
    fechaFin: form.fechaFin !== "" ? form.fechaFin : undefined,
    // Solo incluir si el rol es propietario
    estadoOcupacionPropiedad: esPropietario && form.estadoOcupacionPropiedad !== ""
      ? form.estadoOcupacionPropiedad as EstadoOcupacionPropiedad
      : undefined,
    permiteVerFinanzas: esPropietario ? form.permiteVerFinanzas : undefined,
  };
}
```

---

## 📦 Mock Data: Estado Pre y Post Tarea 1.1

### Estado Actual (Legacy con gap de roles)

```typescript
// p-4 "Ana Silva" → usa "residente", que no es válido en el nuevo modelo
{ id: "v-5", unidadId: "u-D-401", rol: "residente", ... }
```

### Estado Requerido (Tarea 1.1)

```typescript
// "residente" → migrar a "ocupante" para el caso de personal que habita la propiedad
{ id: "v-5", unidadId: "u-D-401", rol: "ocupante", fechaInicio: "2022-02-01", permiteVerFinanzas: undefined }
```

---

## 🗂️ Archivos Impactados

| Archivo | Cambio |
| :--- | :--- |
| `data/comunidad/personas.ts` | Actualizar tipo `rol` en `VinculoUnidad`, hacer `permiteVerFinanzas` opcional, migrar `v-5` de `"residente"` a `"ocupante"` |
| `components/comunidad/formulario-vinculo.tsx` | Nuevo componente con las props definidas en este doc |
| `app/comunidad/personas/[id]/page.tsx` | Agregar estado local `vinculos[]`, botones CRUD y modales |

---

> [!NOTE]
> *Documento generado según normas del proyecto (notación `AA - Herramienta.md`), sincronizado con el change `vinculacion-unidades` en OpenSpec.*
