# IR - Inventario y Recursos

> 🔌 **Datos:** este módulo persiste en la capa de datos (ST) — ver [ST - Capa de Datos Persistente](<ST - Capa de Datos Persistente.md>).

Este módulo gestiona todos los activos, insumos y recursos necesarios para la operación del condominio, vinculando la [Estructura Física (EF)](<EF - Estructura Fisica.md>) con el [Personal (PE)](<PE - Personal y Servicios.md>).

## 1. Clasificación de Recursos

### 1.1 Activos de Infraestructura (Sistemas Fijos)
Equipamiento que forma parte de la estructura pero requiere mantenimiento.
- **Ejemplos:** Hidropack, Motobombas, Cámaras de Seguridad, Cercos Eléctricos, Citofonía, Ascensores.
- **Gestión:** Se vinculan a una ubicación en `EF`. Tienen ficha técnica, marca, modelo y programa de mantención.

### 1.2 Activos Mobiliarios (Herramientas y Equipos)
Bienes durables que se utilizan y se almacenan.
- **Herramientas de Terreno:** Mangueras, cortadoras de arbustos, carretillas, andamios, escaleras.
- **Equipamiento Tecnológico:** Computadores, celulares de conserjería, tablets de ronda.
- **Gestión:** Seguimiento por estado (Disponible, En Uso, Reparación, Baja). Requieren responsable asignado.

### 1.3 Insumos y Consumibles (Stock)
Artículos que se agotan con el uso y requieren reposición.
- **Aseo y Limpieza:** Cloro, detergentes, bolsas, mopas, desinfectantes.
- **Cafetería y Oficina:** Café, azúcar, papel, tintas.
- **Protección Diaria:** Bloqueador solar, mascarillas, guantes desechables.
- **Gestión de Stock Crítico:** Al crear un artículo, el administrador define si es "Crítico" o no. Si lo es, debe fijar un umbral de **Stock Crítico** (ej: 5 bidones de cloro). Al llegar a ese número, el sistema levanta una "Alarma de Reposición" automática en el Dashboard del administrador.

### 1.4 Elementos de Protección Personal (EPP) y Uniformes
Artículos entregados al personal para su uso individual y protección.
- **Ropa y Calzado:** Pantalones, camisas, delantales, capas de lluvia, zapatos de seguridad.
- **EPP Específicos:** Cascos, protectores auditivos, arneses.
- **Gestión:** Registro de entrega individual (Fecha, Talla, Estado). Ciclo de renovación automática.

## 2. Control de Accesos Físicos
Gestión de elementos que permiten la movilidad y seguridad en la estructura.
- **Llaves Físicas:** Maestro de llaves vinculadas a unidades de `EF`.
- **Credenciales:** Tarjetas RFID, tags vehiculares, códigos de acceso.
- **Gestión:** Registro de "Quién tiene qué". Alerta de llaves no devueltas al fin de turno.

## 3. Flujos Operativos

### Ingreso (Compras)
- Todo ingreso de recurso debe estar vinculado a un Egreso en el módulo de [Finanzas (FI)](<FI - Finanzas y Morosidad.md>).
- Registro de proveedor, garantía y factura.

### Solicitud y Consumo (Gestión Trazable)
La solicitud de insumos no es un simple descuento de stock, es una **Gestión Operativa** que queda registrada.
- **Flujo de Solicitud:** El trabajador pide el insumo a través del sistema (con las restricciones de su rol vistas en `RP`).
- **Tipificación:** El sistema asocia el pedido a:
  - *Quién lo pidió* (Ej: Aseador Pedro).
  - *Qué tipo de insumo es* (Ej: Cloro - Aseo).
  - *Para qué ubicación* (Ej: Piso 1, Torre A).
- **Cierre del Ciclo:** Una vez entregado, la administración o jefatura "cierra" la gestión marcando la entrega. Si la solicitud queda pendiente por mucho tiempo, pasa al *Panel de Incumplimientos* (`AM`).

- **Solicitud de Artículo No Catalogado (Comodín):** 
    - Para evitar que la operativa se detenga, el personal puede solicitar un artículo que no figure en el catálogo maestro (ej: un tipo específico de escobillón o herramienta de emergencia).
    - **Proceso:** El solicitante describe el artículo, la cantidad y la justificación.
    - **Acción Administrativa:** Esta solicitud genera una alerta crítica al administrador, quien tiene la opción de:
        1. *Aprobar y Crear:* El sistema añade automáticamente el nuevo artículo al maestro para futuras solicitudes.
        2. *Sustituir:* El administrador sugiere un artículo similar que ya existe en stock.
        3. *Rechazar:* Con justificación obligatoria.

### Baja y Reposición
- Registro de pérdida, robo o fin de vida útil de activos.

## 4. Integración con Auditoría y Métricas (AM)
- **Evento:** `IR_DELIVERY_EPP`, `IR_STOCK_LOW`, `IR_ASSET_REPAIR`.
- **Data Cuantificable:** Gasto mensual en insumos de aseo vs presupuesto, ratio de pérdida/daño de herramientas, cumplimiento de entrega de EPP (Seguridad Laboral).
- **Métrica:** Desviación de gasto en insumos respecto al presupuesto, tasa de rotura/pérdida de activos, porcentaje de personal con EPP entregado a tiempo.
