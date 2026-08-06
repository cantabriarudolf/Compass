# MA - Maestros Administrativos (Tablas de Referencia)

Este módulo centraliza la gestión de todas las tablas base y parámetros técnicos que alimentan la lógica de los demás módulos del sistema. Solo usuarios con el rol de **Administrador Maestro** tienen acceso de escritura aquí.

## 1. Maestros de Recursos Humanos (PE)

Datos necesarios para el cálculo de remuneraciones y cumplimiento legal del personal.

- **AFP:** Listado de Administradoras de Fondos de Pensiones y sus tasas de cotización vigentes.
- **Previsiones de Salud:** Registro de Fonasa e Isapres.
- **Mutuales y Cajas de Compensación:** Configuración de la entidad a la que está adherida la comunidad.
- **Feriados:** Calendario de feriados nacionales e irrenunciables, además de feriados locales o propios del condominio. (Afecta el cálculo de recargos en `PE`).

## 2. Maestros Financieros (FI)

Parámetros para la gestión bancaria y ajustes de deuda.

- **Bancos:** Listado de instituciones bancarias permitidas para el registro de cuentas de la comunidad y para identificar transferencias de residentes.
- **Índices de Ajuste (IPC/UF):** Carga mensual de indicadores para el reajuste de fondos de reserva o multas si se configuran de forma indexada.
- **Cajas y Fondos:** (Vínculo con `FI`) Definición de los "cajones" de dinero (Gasto Común, Reserva, Amenities, etc.).

## 3. Maestros de Insumos e Inventario (IR)

Estandarización de los recursos físicos del condominio.

- **Categorías de Insumos:** Clasificación de artículos (Limpieza, Oficina, Iluminación).
- **Artículos y EPP:** Definición de los elementos de protección personal (guantes, mascarillas, cascos) y herramientas que se entregan al personal.
- **Unidades de Medida:** Unidades, Litros, Kilos, Metros.

## 4. Maestros de Comunidad y Emergencias (CO)

Información de consulta rápida para residentes y personal.

- **Directorio de Emergencias:** Listado de números críticos (Bomberos, Carabineros, Plan Cuadrante, Ambulancia, Empresa de Ascensores, Empresa Eléctrica).
- **Mensajes Prefijados (Plantillas):** Gestión centralizada de los textos de comunicación masiva (Asambleas, Cobranza, Urgencias).
- **Categorías del Carrusel:** Configuración de los tipos de avisos permitidos en el [Visor de Mensajes (CO)](<CO - Visor de Mensajes.md>).

## 5. Maestros de Personas (MP)

- **Condiciones Especiales:** Gestión de la lista de etiquetas de vulnerabilidad (Electrodependiente, Movilidad Reducida, etc.).

## 6. Regla de Visualización (Seguridad por Rol)

Aunque la **Gestión (Creación/Edición)** de estos maestros es exclusiva de la Administración, la **Visualización** depende del contexto:
- El **Personal de Servicio** solo ve el Directorio de Emergencia y los Insumos asignados.
- el **Residente** solo ve los Números de Emergencia y las categorías de plantillas cuando corresponda (ej: Buzón).
- El **Comité** tiene acceso de lectura a todos los maestros para auditoría.
