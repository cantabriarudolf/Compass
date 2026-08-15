# CT - Certificados

Este módulo permite la generación automatizada de documentación oficial y acreditaciones tanto para residentes como para el personal, garantizando la validez de la información mediante la firma digital del administrador.

## 1. Tipologías de Certificados

El sistema ofrece una suite de documentos predefinidos que se nutren de los datos reales de los módulos financieros y operativos.

### 1.1 Certificado de Residencia
- **Objetivo:** Acreditar que una persona reside actualmente en el condominio para trámites bancarios, legales o vecinales.
- **Fuente de Datos:** [Vinculación de Unidades (VU)](<VU - Vinculacion Unidades.md>).
- **Requisito:** El solicitante debe estar marcado como "Activo" en la unidad.

### 1.2 Estado de Cuenta / Fondos
- **Objetivo:** Entregar un detalle oficial de los gastos comunes pagados, cuotas extraordinarias y fondos pendientes por unidad.
- **Fuente de Datos:** [Finanzas y Morosidad (FI)](<FI - Finanzas y Morosidad.md>).
- **Contenido:** Historial de cargos y abonos con firma del tesorero/administrador.

### 1.3 Certificado Liquidación de Sueldo
- **Objetivo:** Certificar la remuneración, descuentos legales y haberes de un trabajador para trámites externos.
- **Fuente de Datos:** [Remuneraciones y Adelantos (PL)](<PL - Liquidaciones y Remuneraciones.md>).
- **Control:** Solo puede ser generado por la administración o descargado por el trabajador tras el cierre del mes.

### 1.4 Certificado "Al Día" (Informativo)
- **Objetivo:** Acreditar que la unidad no tiene deudas pendientes con la comunidad.
- **Fuente de Datos:** [Finanzas y Morosidad (FI)](<FI - Finanzas y Morosidad.md>).
- **Lógica de Emisión:** El sistema valida que el saldo actual sea <= 0 antes de permitir la generación.

## 2. Funcionalidades del Panel

Basado en la interfaz premium definida, el módulo cuenta con:

- **Botón Generar:** Abre un selector para elegir el tipo de certificado y la unidad/persona destino.
- **Historial de Emisión:** Registro de todos los certificados emitidos, indicando fecha, solicitante y un código de verificación único.
- **Firma Digital Automática:** Los documentos se generan en PDF incluyendo la firma digitalizada del administrador configurada en [CF](<CF - Configuracion Global.md>).

## 3. Integración con Auditoría y Métricas (AM)

Cada documento generado es un evento legal que debe ser rastreado:
- **Evento:** `CT_GENERATE_RESIDENCE`, `CT_GENERATE_FINANCIAL`, `CT_GENERATE_PAYROLL`.
- **Data Cuantificable:** Cantidad de certificados por tipo, tiempo de respuesta en solicitudes.
- **Métrica:** Unidades con mayor demanda de certificados, trazabilidad de documentos para validación externa.
