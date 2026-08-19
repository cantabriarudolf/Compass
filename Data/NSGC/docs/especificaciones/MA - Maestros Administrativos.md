# MA - Maestros Administrativos (Tablas de Referencia)

> 🔌 **Datos:** este módulo persiste en la capa de datos (ST) — ver [ST - Capa de Datos Persistente](<ST - Capa de Datos Persistente.md>).

Este módulo centraliza la gestión de todas las tablas base y parámetros técnicos que alimentan la lógica de los demás módulos del sistema. Solo usuarios con el rol de **Administrador Maestro** tienen acceso de escritura aquí.

## 1. Maestros de Recursos Humanos (PE)

Datos necesarios para el cálculo de remuneraciones y cumplimiento legal del personal.

- **AFP:** Listado de Administradoras de Fondos de Pensiones y sus tasas de cotización vigentes.
- **Previsiones de Salud:** Registro de Fonasa e Isapres.
- **Mutuales y Cajas de Compensación:** Configuración de la entidad a la que está adherida la comunidad.
- **Feriados:** Calendario de feriados nacionales e irrenunciables, además de feriados locales o propios de la comunidad. (Afecta el cálculo de recargos en `PE`).

## 2. Maestros Financieros (FI)

Parámetros para la gestión bancaria y ajustes de deuda.

- **Bancos:** Listado de instituciones bancarias permitidas para el registro de cuentas de la comunidad y para identificar transferencias de residentes.
- **Índices de Ajuste (IPC/UF):** Carga mensual de indicadores para el reajuste de fondos de reserva o multas si se configuran de forma indexada.
- **Cajas y Fondos:** (Vínculo con `FI`) Definición de los "cajones" de dinero (Gasto Común, Reserva, Amenities, etc.).

## 3. Maestros de Insumos e Inventario (IR)

Estandarización de los recursos físicos de la comunidad.

- **Categorías de Insumos:** Clasificación de artículos (Limpieza, Oficina, Iluminación).
- **Artículos y EPP:** Definición de los elementos de protección personal (guantes, mascarillas, cascos) y herramientas que se entregan al personal.
- **Unidades de Medida:** Unidades, Litros, Kilos, Metros.

## 4. Maestros de Comunidad y Emergencias (CO)

Información de consulta rápida para residentes y personal.

- **Directorio de Emergencias:** Listado de números críticos (Bomberos, Carabineros, Plan Cuadrante, Ambulancia, Empresa de Ascensores, Empresa Eléctrica).
- **Mensajes Prefijados (Plantillas):** Gestión centralizada de los textos de comunicación masiva (Asambleas, Cobranza, Urgencias).
- **Categorías del Carrusel:** Configuración de los tipos de avisos permitidos en el [Visor de Mensajes (CV)](<CV - Visor de Mensajes.md>).

## 5. Maestros de Personas (MP)

- **Condiciones Especiales:** Gestión de la lista de etiquetas de vulnerabilidad (Electrodependiente, Movilidad Reducida, etc.).

## 6. Maestros de Estructura Física (EF)

Categorías que alimentan el módulo [EF - Estructura Física](<EF - Estructura Fisica.md>), los selectores de inventario y el módulo [VU - Vinculación de Unidades](<VU - Vinculacion Unidades.md>).

- **Categorías Macro Sectores:** Define los distintos tipos de Macro-Sectores que puede tener la comunidad (ej: Torre, Manzana, Etapa, Edificio).
- **Categorías Micro Sectores:** Define los distintos tipos de Micro-Sectores que puede tener un Macro-Sector (ej: Piso, Nivel, Pasaje, Bloque, "No Aplica").
- **Categorías de Unidad:** Define las categorías de propiedades (ej: Depto, Casa, Local, Oficina, Bodega, Estacionamiento). Alimentan el campo **Categoría** del módulo [TU - Tipos de Unidad](<TU - Tipos de Unidad.md>) y la etiqueta de las unidades en EF.
- **Ubicaciones de Estacionamiento:** Define las ubicaciones para sectorizar las plazas (ej: Superficie, Subterráneo -1, Sector Visitas). Alimentan el módulo [ES - Estacionamientos](<ES - Estacionamientos.md>).
- **Estados Inmobiliarios:** Define los estados de ocupación de la propiedad (ej: Habitada, Próxima Vacancia, En Arriendo, Arrendada, En Venta). Alimentan el campo **Estado Ocupación Propiedad** del módulo [VU - Vinculación de Unidades](<VU - Vinculacion Unidades.md>).
- **Regla importante:** Estas categorías definen los **tipos** de sectores, pero no son sectores reales. Los sectores concretos (por ejemplo, "Torre A" o "Piso 3") se crean en el módulo EF; hasta entonces no es posible asignarles unidades.

## 7. Regla de Visualización (Seguridad por Rol)

Aunque la **Gestión (Creación/Edición)** de estos maestros es exclusiva de la Administración, la **Visualización** depende del contexto:
- El **Personal de Servicio** solo ve el Directorio de Emergencia y los Insumos asignados.
- el **Residente** solo ve los Números de Emergencia y las categorías de plantillas cuando corresponda (ej: Buzón).
- El **Comité** tiene acceso de lectura a todos los maestros para auditoría.

## 8. Integración con Auditoría y Métricas (AM)

Todo cambio sobre un maestro de referencia debe quedar trazado, ya que impacta la lógica de múltiples módulos:
- **Evento:** `MA_MAESTRO_CREATE`, `MA_MAESTRO_UPDATE`, `MA_MAESTRO_DELETE`.
- **Data Cuantificable:** Cantidad de registros por maestro, frecuencia de actualización de parámetros críticos (AFP, feriados, bancos).
- **Métrica:** Vigencia de los datos maestros, cantidad de módulos dependientes afectados por cambios.
