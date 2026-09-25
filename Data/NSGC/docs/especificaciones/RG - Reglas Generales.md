# RG - Reglas Generales del Proyecto SGC

Estas reglas son de cumplimiento obligatorio para cualquier nuevo desarrollo, modificación de módulos existentes o documentación técnica.

## 1. Trazabilidad Universal (Regla de Oro)
**Todo componente, módulo o funcionalidad que implique una acción de usuario o un proceso automático debe estar vinculado al módulo [AM - Auditoria y Metricas](<AM - Auditoria y Metricas.md>).**

### Requerimientos por cada funcionalidad:
- **Evento Identificable:** Cada acción debe tener un nombre técnico y una descripción clara.
- **Data Cuantificable:** Se debe identificar qué valor numérico o métrica se puede extraer de la acción (ej: CLP, tiempo, cantidad, intentos).
- **Inmutabilidad:** Ningún registro de acción puede ser eliminado.

## 2. Estándares de Documentación
- Seguir el formato `AA - Herramienta.md`.
- Idioma: Español chileno.
- Mantener el `00-index.md` actualizado.
- Cada archivo debe incluir una sección final llamada **"Integración con Auditoría y Métricas"**.
- Título del documento: `# AA - Nombre del Módulo`.
- Numeración correlativa de secciones (`## 1.`, `## 2.`, ...) sin saltos ni duplicados.

## 3. Plantilla Estándar de Especificación (Prisma)

Toda spec nueva o existente debe cumplir esta estructura de secciones, en este orden:

```markdown
# AA - Nombre del Módulo

Párrafo de contexto: qué resuelve este módulo y cómo se relaciona con el resto.

## 1. <Funcionalidad principal>
Atributos, entidades o flujos del módulo. Usar ### para subsecciones.

## 2. Reglas de Negocio
Reglas de validación, integridad y consistencia.

## 3. Integración con Auditoría y Métricas (AM)
Registro de eventos, data cuantificable y métricas:
- **Evento:** `AA_ACCION`.
- **Data Cuantificable:** valor numérico o métrica extraíble.
- **Métrica:** KPI o ratio que alimenta el Dashboard de AM.
```

Requisitos de la plantilla:
- La sección AM es **siempre la última** y se llama exactamente `## N. Integración con Auditoría y Métricas (AM)`.
- Toda sección AM incluye los 3 sub-bullets: **Evento**, **Data Cuantificable**, **Métrica**.
- Enlazar módulos relacionados con `[AA - Nombre](<AA - Nombre.md>)` cuando se crucen dependencias.

## 4. Consistencia de Datos y UX (Interfaz de Usuario)
- **Principio de Claridad Visual (Campos Obligatorios):** En cualquier parte del sistema donde exista un formulario o ingreso de datos, **todos los campos obligatorios deben estar visualmente marcados** (ej: con un asterisco rojo `*` y validación en tiempo real). Esto informa al usuario qué es lo mínimo necesario para avanzar, reduciendo la fricción y el error humano.
- **Badge Visual Canónico:** Toda selección de color o estado visual en maestros (Estados de Ocupación, Estados Inmobiliarios, Condiciones Especiales, etc.) DEBE ofrecer una paleta canónica fija (`BADGE_OPTIONS`) con selector de muestra visual y guardar el valor exacto de la clase. Prohibido pedir al usuario escribir clases Tailwind a mano. Los valores legacy se normalizan a la paleta con `normalizeBadgeColor`. Referencia: [MA - Maestros Administrativos](<MA - Maestros Administrativos.md>).
- **Terminología de Dominio:** El término oficial para referirse a la entidad colectiva del sistema es **"comunidad"**. El término **"condominio"** está en desuso y NO debe usarse en UI, specs, manuales ni avances nuevos.
- **Jerarquía de Unidades:** Las unidades siempre deben depender de un **Tipo de Unidad** (Maestro TU).
- **Validación de Configuraciones:** Las configuraciones críticas (SMTP, Cálculos de GC) deben requerir confirmación antes de ser guardadas.
- **Capa de Datos Persistente (ST):** La fuente de verdad es la base de datos (Prisma/SQLite en dev, PostgreSQL/Neon en prod). Toda operación de escritura pasa por API Routes de Next.js App Router, validada por Zod, autorizada por `authz`, y persistida en Prisma. El store legacy `lib/store.ts` está congelado (`STORE_VERSION=28`) y sus acciones de dominio están `@deprecated`. El estado de UI puro (modales, filtros, vistas) vive en `lib/store-ui.ts`. Las páginas leen datos de dominio via hooks SWR (`lib/api/use-*.ts`) que consumen las API REST. Referencia: [ST - Capa de Datos Persistente](<ST - Capa de Datos Persistente.md>).
