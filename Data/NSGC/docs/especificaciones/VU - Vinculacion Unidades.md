# VU - Vinculación de Unidades

Este módulo gestiona la relación entre las Unidades y las Personas (Maestro).

## 1. Lógica de Responsabilidad
- **Responsable de Cobro:** Cada unidad debe tener asignado un sujeto para la cobranza (Propietario o Residente). Para el sistema es indistinto quién asume la obligación financiera, siempre que exista un responsable vinculado.
- **Autogestión de Trámites:** El sistema permite que tanto el Propietario como el Residente realicen actualizaciones de datos (Censo) y suban documentación contractual (Contratos, Salvoconductos) directamente desde sus respectivos paneles.

### 1.1 Censo Demográfico de la Unidad
Más allá de quién paga, el sistema debe registrar quiénes habitan la unidad para temas de seguridad y evacuación.
- **Datos Censales:** Cantidad total de ocupantes, cantidad de niños, cantidad y tipo de mascotas.
- **Condiciones Especiales:** Heredadas del módulo `MP` (silla de ruedas, electrodependiente).
- **Control de Obsolescencia:** El sistema registra la "Fecha de Última Actualización" de esta ficha.
- **Alerta de Censo:** Si el residente es nuevo, o si la ficha lleva más de 1 año sin actualizarse, el sistema levanta una alerta en el dashboard del administrador y notifica al residente para que revalide sus datos.
- **Certificación de Residencia:** Los datos validados en este censo permiten la generación automática del documento oficial a través del [Módulo de Certificados (CT)](<CT - Certificados.md>#11-certificado-de-residencia).

## 2. Control de Arriendos y Contratos
- **Fechas:** Registro de inicio y término de vigencia del contrato de arriendo.
- **Documentación:** Carga de contrato digital y salvoconducto.
- **Mudanzas:** Registro de fechas de entrada y salida física.

### 2.1 Gestión de Datos Inmobiliarios (Exclusivo Propietario)
Aunque el residente puede actualizar datos censales, la información destinada al [Portal Inmobiliario (PI)](<PI - Portal Inmobiliario.md>) (fotos de la propiedad, descripción de venta/arriendo, precio) es de **uso exclusivo del Propietario**. Un residente solo tendrá acceso a esta sección si además ostenta la calidad de Propietario de la unidad.

## 3. Reglas de Negocio
- Un residente no puede vincularse a una unidad si ya está marcado como "Inactivo" en el Maestro de Personas.
- El sistema debe evitar solapamientos de contratos de arriendo en la misma unidad.

## 4. Historial de Propiedad (Trazabilidad)

El sistema debe garantizar la memoria histórica de cada unidad, manteniendo un registro inmutable de:
- **Historial de Propietarios:** Registro de dueños anteriores y actuales.
- **Historial de Ocupación (Arrendatarios):** Registro cronológico de todos los residentes que han habitado la unidad, incluyendo sus fechas de inicio y término de contrato, facilitando la trazabilidad de incidentes o deudas históricas vinculadas a periodos específicos.

## 5. Integración con Auditoría y Métricas (AM)

Control de cambios en la responsabilidad legal y financiera:
- **Evento:** `VU_CHANGE_OWNER`, `VU_NEW_TENANT`, `VU_MUDANZA_REG`.
- **Data Cuantificable:** Tiempo promedio de rotación de arrendatarios, cantidad de mudanzas por mes.
- **Métrica:** Tasa de rotación del condominio, historial de morosidad vinculado a periodos de arriendo específicos.
