# FI - Finanzas y Morosidad

> 🔌 **Datos:** este módulo persiste en la capa de datos (ST) — ver [ST - Capa de Datos Persistente](<ST - Capa de Datos Persistente.md>).

Este módulo centraliza la salud financiera del condominio, asegurando la transparencia en el uso de los recursos y la eficiencia en la recaudación.

## 1. Gestión de Gastos (Egresos)

El sistema debe registrar cada salida de dinero clasificada para un cálculo preciso del Gasto Común (GC).

### Funcionalidades:
- **Maestro de Fondos (Cajas):** El dinero no entra a un saco único. El sistema permite crear N fondos (Fondo de Gasto Común, Fondo de Reserva, Fondo Cuota Extraordinaria Pintura, etc.).
- **Categorización de Gastos:** Clasificación por tipo (Sueldos, Mantención). Además, permite marcar un gasto como **Recurrente/Fijo** para alimentar el termómetro de presupuesto del Dashboard.
- **Imputación por Fondo:** Al registrar un egreso, el administrador debe definir de qué Fondo sale el dinero (por defecto: Gasto Común).
- **Carga de Comprobantes:** Posibilidad de adjuntar facturas o boletas digitalizadas.
- **Gastos Diferenciados:** Marcar gastos que solo aplican a ciertos sectores.

## 2. Proceso de Emisión de Gastos Comunes

Este proceso genera la deuda para todas las unidades activas del condominio para un mes/año determinado.

### Modalidades de Ejecución:
1. **Modalidad Fija:** El sistema consulta el campo **Monto Fijo** de cada unidad en el [Módulo de Estructura](<EF - Estructura Fisica.md>) y genera el cargo idéntico.
2. **Modalidad Variable:** El administrador define el monto total de egresos a recaudar. El sistema realiza el cálculo: `(Gasto Total * % de Prorrateo de la Unidad) = Cobro del Mes`.
### 1.2 Presupuesto y Proyecciones de Egresos
Para evitar variaciones extremas en el Gasto Común de un mes a otro, el sistema permite proyectar los sobrecostos:
- **Proyección Operativa (Feriados):** Recibe los datos del módulo `PE` e informa: *"En Septiembre habrá 3 feriados, se proyecta un incremento de $X en remuneraciones de reemplazo"*.
- **Proyección Anual:** Permite a la administración construir un presupuesto estimado para todo el año, cruzando los mantenimientos programados de infraestructura (`EF/IR`) con las horas extras o parches del personal (`PE`).
- **Análisis y Proyección de Flujo de Caja (Cash Flow):** Herramienta para identificar los picos de ingreso (recaudación post-emisión) y valles de egreso (pagos de servicios, proveedores y sueldos).
    - **Alerta de Insolvencia Prematura:** El sistema debe emitir una alerta crítica automática si, basándose en la velocidad de recaudación histórica y actual, se proyecta que el saldo en caja no será suficiente para cubrir el ítem de **Remuneraciones (Sueldos)** al cierre del mes. Esto permite a la administración tomar medidas correctivas (ej. intensificar cobranza o diferir egresos no críticos) con antelación.

### 2.1 Gestión de Tarifario y Aumentos Programados (Aumento Diferido)
El sistema soporta la programación de cambios en el valor del Gasto Común Fijo o en las reglas de multas, definiendo una **Fecha de Entrada en Vigencia**.
- **Adelanto de Pagos (Incentivo):** Si se programa un aumento de GC para el futuro, los residentes pueden adelantar el pago de los meses venideros manteniendo el valor *actual* (más bajo) como premio por pronto pago.
- **Retroactividad Penalizada (Actualización de Deuda):** Si un residente arrastra deuda de meses anteriores y decide pagar *después* de que entró en vigencia el nuevo tarifario, el sistema **aplica el nuevo valor del GC y la nueva regla de multas a la deuda histórica**. Esto penaliza la morosidad y motiva a regularizar antes de las alzas.
### Reglas de Negocio:
- No se puede emitir un periodo que ya ha sido procesado previamente.
- El sistema debe validar que todas las unidades tengan un responsable de cobro asignado antes de iniciar.

### Cargos Adicionales y Otros Cobros:
- **Cuotas Extraordinarias:** Cobros aprobados por asamblea para proyectos específicos. Pueden ser montos fijos por unidad o aplicados por prorrateo.
- **Multas Individuales:** Cargos específicos derivados del [Módulo de Infracciones](<IN - Infracciones y Multas.md>). Solo se cargan aquellas multas marcadas como "Cerradas/Aplicadas".
- **Consumos Individuales:** Cobros por uso de medidores de servicios básicos si el condominio los centraliza.

## 3. Fondos de Reserva y Contingencia

Manejo de ahorros obligatorios según la Ley de Copropiedad.

### Reglas de Negocio:
- **Cálculo de Fondo de Reserva:** Aplicación automática del porcentaje definido por la asamblea sobre el total recaudado.
- **Uso de Fondos:** Registro de retiros del fondo de reserva con aprobación documentada de la directiva.

## 4. Control de Morosidad y Cobranza Activa

Monitoreo constante y automatizado de los pagos pendientes, basado en las configuraciones de `CF` (Día de corte y Meses límite).

### Funcionalidades:
- **Cálculo Automático de Multas:** Pasado el "Día de Corte de Pago", el sistema muestra un panel con todas las unidades atrasadas y *propone automáticamente el cálculo de la multa o interés* asociado a cada una, listo para ser aplicado por el administrador.
- **Dashboard de Corte de Servicios:** Panel que resalta exclusivamente a las unidades que ya superaron la "Cantidad máxima de meses" configurada, indicando que requieren corte de suministro (ej: luz o agua caliente).
- **Ajustes Manuales y Auditoría de Pago:** Al recibir un pago, el sistema carga el monto total exacto (Deuda Base + Mora). Si el administrador realiza un **ajuste manual**, este puede ser:
  - *Descuento:* Perdonar una multa (a favor del residente).
  - *Recargo:* Añadir un saldo pendiente no facturado (a favor del condominio).
  El sistema procesa el pago pero genera un **Informe de Diferencia** inmutable, obligando al administrador a justificar la razón del ajuste para prevenir fraudes.

- **Generación de Documentos Oficiales:** La emisión de **Estados de Cuenta** detallados y el certificado de **Unidad Al Día** se realiza a través del [Módulo de Certificados (CT)](<CT - Certificados.md>), asegurando la validez legal y el formato institucional.

## 5. Integración con Auditoría y Métricas (AM)

Métricas críticas para la salud económica y transparencia de la gestión:
- **Evento:** `FI_EMISION_GC`, `FI_RECEIVE_PAYMENT`, `FI_MANUAL_DISCOUNT`, `FI_COBRANZA_SENT`.
- **Data Cuantificable:** Montos emitidos vs recaudados, diferencias por ajustes manuales, cantidad de gestiones de cobranza realizadas.
- **Métrica:** Índice de morosidad (% de unidades morosas), efectividad de cobranza (% pagado tras aviso), recaudación por fondo (GC, reserva, cuotas extraordinarias).
- **Métricas y KPIs (Centros de Ingreso):** 
    - Ingresos netos por Mora / Multas aplicadas.
    - Ingresos por Arriendo de Espacios Comunes (Cruzado con `RA`).
    - Índice de Morosidad histórico y efectividad de la gestión de cobranza (cuántos pagaron tras enviar el aviso).
