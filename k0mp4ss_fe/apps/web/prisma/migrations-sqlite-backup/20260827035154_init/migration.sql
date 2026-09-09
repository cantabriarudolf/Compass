-- CreateTable
CREATE TABLE "Comunidad" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "tipos_unidad" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "metraje" REAL NOT NULL,
    "montoBaseGc" REAL NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL,
    "historialTarifas" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tipos_unidad_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "macro_sectores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "descripcion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "macro_sectores_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "micro_sectores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "macroSectorId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "micro_sectores_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "unidades" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "microSectorId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "tipoUnidadId" TEXT NOT NULL,
    "metraje" REAL NOT NULL,
    "prorrateo" REAL NOT NULL,
    "rolSii" TEXT NOT NULL,
    "estadoId" TEXT NOT NULL,
    "servicios" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "unidades_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "personas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "nombreCompleto" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefonoMovil" TEXT NOT NULL,
    "telefonoFijo" TEXT,
    "fotografiaUrl" TEXT,
    "estadoCuenta" TEXT NOT NULL,
    "condicionesEspecialesIds" JSONB NOT NULL,
    "roles" JSONB NOT NULL,
    "datosLaborales" JSONB,
    "datosGobernanza" JSONB,
    "permiteCreacionManualCV" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "personas_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vinculos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "fechaInicio" TEXT NOT NULL,
    "fechaFin" TEXT,
    "estadoOcupacionPropiedad" TEXT,
    "permiteVerFinanzas" BOOLEAN NOT NULL,
    "cerrarAnterior" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vinculos_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "eventos_auditoria" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "tipoAccion" TEXT NOT NULL,
    "referenciaId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eventos_auditoria_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "configuracion_global" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombreComunidad" TEXT NOT NULL,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "rutCondominio" TEXT NOT NULL,
    "direccionOficial" TEXT NOT NULL,
    "administradorResponsable" TEXT NOT NULL,
    "rutAdministrador" TEXT NOT NULL,
    "telefonoAdmin" TEXT NOT NULL,
    "firmaDigitalizadaUrl" TEXT,
    "modoCalculoGC" TEXT NOT NULL,
    "diaCortePago" INTEGER NOT NULL,
    "limiteMesesAvisoCorte" INTEGER NOT NULL,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL,
    "smtpUser" TEXT NOT NULL,
    "smtpPassword" TEXT NOT NULL DEFAULT '',
    "smtpSecurity" TEXT NOT NULL,
    "smtpFrom" TEXT NOT NULL,
    "smtpFromName" TEXT NOT NULL,
    "smtpBcc" TEXT,
    "smtpRecepcion" TEXT,
    "notificarEmisionGC" BOOLEAN NOT NULL,
    "notificarRegistroVisitas" BOOLEAN NOT NULL,
    "notificarEncomiendas" BOOLEAN NOT NULL,
    "notificarReservas" BOOLEAN NOT NULL,
    "notificarAvisosSistema" BOOLEAN NOT NULL,
    "notificarSugerenciasReclamos" BOOLEAN NOT NULL,
    "diasMesComercial" INTEGER NOT NULL,
    "diasVacacionesMes" REAL NOT NULL,
    "jornadaSemanalEstandar" INTEGER NOT NULL,
    "claveEliminacionMaestro" TEXT NOT NULL DEFAULT '',
    "visibilidadPortalInmobiliario" TEXT,
    "cvRequiereVistoBueno" BOOLEAN,
    "ufMensual" REAL,
    "ingresoMinimoMensual" REAL,
    "topeGratificacionLegal" REAL,
    "tasaSIS" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "configuracion_global_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "publicaciones_portal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "operacion" TEXT NOT NULL,
    "precio" REAL NOT NULL,
    "moneda" TEXT,
    "dormitorios" INTEGER,
    "banos" INTEGER,
    "etiquetaEstado" TEXT,
    "descripcion" TEXT,
    "urlMapa" TEXT,
    "condicionesContractuales" TEXT,
    "imagenes" JSONB NOT NULL,
    "activa" BOOLEAN NOT NULL,
    "fechaPublicacion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "publicaciones_portal_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "leads_portal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "publicacionId" TEXT NOT NULL,
    "nombreContacto" TEXT NOT NULL,
    "contacto" TEXT NOT NULL,
    "mensaje" TEXT,
    "fecha" TEXT NOT NULL,
    "atendido" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leads_portal_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "destinatarioRol" TEXT NOT NULL,
    "destinatarioPersonaId" TEXT,
    "asunto" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'email_simulado',
    "moduloOrigen" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notificaciones_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "controles_propiedad" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "residenteVeMorosidad" BOOLEAN NOT NULL,
    "residenteVeActas" BOOLEAN NOT NULL,
    "alertasResidentesActivas" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "controles_propiedad_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "actas_gd" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "hora" TEXT NOT NULL,
    "lugar" TEXT NOT NULL,
    "tablaTemas" JSONB NOT NULL,
    "presentes" JSONB NOT NULL,
    "ausentes" JSONB NOT NULL,
    "invitados" JSONB NOT NULL,
    "minuta" TEXT NOT NULL,
    "adjuntos" JSONB NOT NULL,
    "estado" TEXT NOT NULL,
    "aprobaciones" JSONB NOT NULL,
    "fechaPublicacion" TEXT,
    "avisoCVReferencia" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "actas_gd_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "plantillas_co" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "asunto" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "plantillas_co_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "envios_co" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "asunto" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "plantillaId" TEXT,
    "destinatarios" JSONB NOT NULL,
    "fechaEnvio" TEXT NOT NULL,
    "lecturas" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "envios_co_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mensajes_buzon_co" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "clasificacion" TEXT NOT NULL,
    "reportantePersonaId" TEXT,
    "reportanteNombre" TEXT NOT NULL,
    "unidadId" TEXT,
    "asunto" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "visibilidadComite" BOOLEAN NOT NULL,
    "fechaIngreso" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "respuestas" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "mensajes_buzon_co_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "documentos_co" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamanoKB" REAL NOT NULL,
    "url" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "documentos_co_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "solicitudes_ge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "solicitantePersonaId" TEXT,
    "unidadId" TEXT,
    "estado" TEXT NOT NULL,
    "fechaCreacion" TEXT NOT NULL,
    "comentarios" JSONB NOT NULL,
    "detalleGrabaciones" JSONB,
    "detalleInsumos" JSONB,
    "mensajeBuzonId" TEXT,
    "resolucion" TEXT,
    "fechaCierre" TEXT,
    "historialEstados" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "solicitudes_ge_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "recursos_ir" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "codigo" TEXT,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "descripcion" TEXT,
    "fichaTecnicaUrl" TEXT,
    "microSectorId" TEXT,
    "unidadId" TEXT,
    "responsablePersonaId" TEXT,
    "estadoActivo" TEXT NOT NULL,
    "unidadMedidaId" TEXT,
    "stock" REAL NOT NULL,
    "esCritico" BOOLEAN NOT NULL,
    "umbralCritico" REAL,
    "proveedor" TEXT,
    "numeroFactura" TEXT,
    "facturaUrl" TEXT,
    "garantiaHasta" TEXT,
    "talla" TEXT,
    "renovacionMeses" INTEGER,
    "asignacionActual" JSONB,
    "cargoFIReferencia" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "recursos_ir_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "solicitudes_insumo_ir" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "solicitantePersonaId" TEXT NOT NULL,
    "recursoInsumoId" TEXT,
    "comodin" JSONB,
    "recursoSustitutoId" TEXT,
    "estadoComodin" TEXT NOT NULL,
    "cantidad" REAL NOT NULL,
    "areaDestino" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "fechaSolicitud" TEXT NOT NULL,
    "entregaFecha" TEXT,
    "rechazoJustificacion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "solicitudes_insumo_ir_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "entregas_epp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "recursoId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "fechaEntrega" TEXT NOT NULL,
    "talla" TEXT,
    "estado" TEXT NOT NULL,
    "proximaRenovacion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "entregas_epp_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tipos_infraccion_in" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "tipoSancion" TEXT NOT NULL,
    "valor" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tipos_infraccion_in_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "infracciones_in" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "tipoInfraccionId" TEXT,
    "danoDirecto" JSONB,
    "unidadId" TEXT NOT NULL,
    "reportantePersonaId" TEXT,
    "mensajeBuzonId" TEXT,
    "fechaSuceso" TEXT NOT NULL,
    "horaSuceso" TEXT NOT NULL,
    "antecedentes" TEXT NOT NULL,
    "evidencias" JSONB NOT NULL,
    "estado" TEXT NOT NULL,
    "fechaRegistro" TEXT NOT NULL,
    "montoAplicado" REAL,
    "comentariosDirectiva" JSONB NOT NULL,
    "respaldosDirectiva" JSONB NOT NULL,
    "apelacion" JSONB,
    "desestimacionJustificacion" TEXT,
    "cargoFIReferencia" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "infracciones_in_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "trabajos_mt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "unidadId" TEXT,
    "microSectorId" TEXT,
    "activoIRId" TEXT,
    "responsablePersonaId" TEXT,
    "proveedor" JSONB,
    "prioridad" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "fechaProgramada" TEXT,
    "fechaInicio" TEXT,
    "fechaTermino" TEXT,
    "costoTotal" REAL NOT NULL,
    "origenFondos" TEXT NOT NULL,
    "estadoPago" TEXT NOT NULL,
    "garantiaInicio" TEXT,
    "garantiaFin" TEXT,
    "alertaGarantiaEnviada" BOOLEAN NOT NULL,
    "evidencias" JSONB NOT NULL,
    "preventivo" JSONB,
    "cargoFIReferencia" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "trabajos_mt_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "proyectos_mt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "presupuestoEstimado" REAL NOT NULL,
    "plazoMeses" INTEGER NOT NULL,
    "fechaObjetivo" TEXT,
    "estado" TEXT NOT NULL,
    "fondoFinanciamientoId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "proyectos_mt_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "elementos_ra" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "microSectorId" TEXT,
    "activoIRId" TEXT,
    "franja" TEXT NOT NULL,
    "duracionBloqueHoras" INTEGER,
    "tarifaUso" REAL NOT NULL,
    "garantiaRequerida" REAL NOT NULL,
    "aforo" INTEGER,
    "stock" INTEGER,
    "anticipacionMinimaDias" INTEGER,
    "cancelacionTardiaDias" INTEGER,
    "penalizacionTardiaMonto" REAL,
    "activo" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "elementos_ra_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "reservas_ra" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "elementoId" TEXT NOT NULL,
    "solicitantePersonaId" TEXT NOT NULL,
    "unidadId" TEXT,
    "fecha" TEXT NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "montoTarifa" REAL NOT NULL,
    "montoGarantia" REAL NOT NULL,
    "cancelacion" JSONB,
    "garantiaRetenida" JSONB,
    "cargoFIReferencia" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "reservas_ra_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "avisos_cv" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "tipologia" TEXT NOT NULL,
    "duracionSegundos" INTEGER NOT NULL,
    "imagenUrl" TEXT,
    "videoUrl" TEXT,
    "pantallaCompleta" BOOLEAN NOT NULL,
    "expiresAt" TEXT,
    "tags" JSONB NOT NULL,
    "estado" TEXT NOT NULL,
    "requiereVistoBueno" BOOLEAN NOT NULL,
    "creadoPorPersonaId" TEXT,
    "origen" TEXT NOT NULL,
    "plantillaId" TEXT,
    "actaId" TEXT,
    "fechaCreacion" TEXT NOT NULL,
    "fechaPublicacion" TEXT,
    "fechaArchivado" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "avisos_cv_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "plantillas_cv" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "tipologia" TEXT NOT NULL,
    "duracionSegundosSugerida" INTEGER NOT NULL,
    "imagenUrl" TEXT,
    "videoUrl" TEXT,
    "pantallaCompleta" BOOLEAN NOT NULL,
    "tags" JSONB NOT NULL,
    "activa" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "plantillas_cv_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fondos_fi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descripcion" TEXT,
    "porcentajeAporte" REAL,
    "activo" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "fondos_fi_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "egresos_fi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "folio" TEXT,
    "fecha" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto" REAL NOT NULL,
    "fondoId" TEXT NOT NULL,
    "esRecurrente" BOOLEAN NOT NULL,
    "comprobante" JSONB,
    "microSectoresIds" JSONB,
    "proveedor" TEXT,
    "unidadId" TEXT,
    "aprobacionActaGDId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "egresos_fi_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "emisiones_gc" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "modo" TEXT NOT NULL,
    "gastoTotal" REAL NOT NULL,
    "lineas" JSONB NOT NULL,
    "fondoReservaAporte" JSONB,
    "fechaEmision" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "emisiones_gc_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cobros_fi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "origenModulo" TEXT NOT NULL,
    "origenRef" TEXT,
    "fondoId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "montoBase" REAL NOT NULL,
    "fechaCargo" TEXT NOT NULL,
    "fechaVencimiento" TEXT,
    "moras" JSONB NOT NULL,
    "pagos" JSONB NOT NULL,
    "diferencias" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "cobros_fi_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bitacora_visitas_pe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "patente" TEXT,
    "unidadId" TEXT,
    "destinoPersonaId" TEXT,
    "jornadaId" TEXT NOT NULL,
    "origenAgenda" TEXT NOT NULL,
    "agendadaPorPersonaId" TEXT,
    "estado" TEXT NOT NULL,
    "horaIngreso" TEXT,
    "notas" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bitacora_visitas_pe_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "encomiendas_pe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "destinatarioPersonaId" TEXT,
    "unidadId" TEXT,
    "descripcionPaquete" TEXT,
    "evidencia" JSONB,
    "fechaRecepcion" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "retiro" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "encomiendas_pe_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ingresos_contratista_pe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "contratistaId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "unidadId" TEXT,
    "fecha" TEXT NOT NULL,
    "jornadaId" TEXT NOT NULL,
    "agendadoPor" TEXT NOT NULL,
    "personaAgendaId" TEXT,
    "estado" TEXT NOT NULL,
    "horaIngreso" TEXT,
    "notas" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ingresos_contratista_pe_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "proveedores_pe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rubro" TEXT NOT NULL,
    "contacto" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "sitioWeb" TEXT,
    "activo" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "proveedores_pe_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mantenciones_preventivas_pe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "periodicidadMeses" INTEGER NOT NULL,
    "proximaFecha" TEXT NOT NULL,
    "alertaDiasAntes" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "mantenciones_preventivas_pe_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "visitas_tecnicas_pe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "mantencionId" TEXT,
    "tecnicoNombre" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "trabajoRealizado" TEXT NOT NULL,
    "supervisorPersonaId" TEXT,
    "unidadId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "visitas_tecnicas_pe_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cierres_turno_pe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "hora" TEXT NOT NULL,
    "jornadaReportadaId" TEXT NOT NULL,
    "trabajadorPersonaId" TEXT NOT NULL,
    "novedadesGenerales" TEXT,
    "incidencias" JSONB NOT NULL,
    "checklistInstalaciones" JSONB NOT NULL,
    "checklistEquipamiento" JSONB NOT NULL,
    "historialCambios" JSONB NOT NULL,
    "notificadoAAdmin" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "cierres_turno_pe_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "proyecciones_pe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "mesAnio" TEXT NOT NULL,
    "feriados" JSONB NOT NULL,
    "diasFeriados" INTEGER NOT NULL,
    "reemplazosNecesarios" INTEGER NOT NULL,
    "costoEstimado" REAL NOT NULL,
    "detalleCosto" JSONB NOT NULL,
    "enviadoAFI" BOOLEAN NOT NULL,
    "liquidacionPLReferencia" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "proyecciones_pe_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "liquidaciones_pl" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "trabajadorPersonaId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "fechaGeneracion" TEXT NOT NULL,
    "diasTrabajados" INTEGER NOT NULL,
    "sueldoBaseContrato" REAL NOT NULL,
    "diasMesComercial" INTEGER NOT NULL,
    "jornadaSemanal" REAL NOT NULL,
    "sueldoBaseProporcional" REAL NOT NULL,
    "horasExtrasHoras" REAL NOT NULL,
    "valorHoraOrdinaria" REAL NOT NULL,
    "montoHorasExtras" REAL NOT NULL,
    "bonos" JSONB NOT NULL,
    "gratificacionLegal" REAL NOT NULL,
    "totalImponible" REAL NOT NULL,
    "asignacionMovilizacion" REAL NOT NULL,
    "asignacionColacion" REAL NOT NULL,
    "asignacionFamiliarTramoId" TEXT,
    "cargas" INTEGER NOT NULL,
    "montoAsignacionFamiliar" REAL NOT NULL,
    "totalHaberes" REAL NOT NULL,
    "afpId" TEXT,
    "nombreAfp" TEXT NOT NULL,
    "tasaAFP" REAL NOT NULL,
    "montoAFP" REAL NOT NULL,
    "saludId" TEXT,
    "nombreSalud" TEXT NOT NULL,
    "saludTipo" TEXT NOT NULL,
    "saludPorcentaje" REAL,
    "saludValorUF" REAL,
    "ufAplicada" REAL,
    "montoSalud" REAL NOT NULL,
    "tasaSIS" REAL NOT NULL,
    "montoSIS" REAL NOT NULL,
    "montoSeguroCesantia" REAL NOT NULL,
    "montoAPV" REAL NOT NULL,
    "totalDescuentos" REAL NOT NULL,
    "descuentoAnticipos" REAL NOT NULL,
    "adelantosIds" JSONB NOT NULL,
    "alcanceLiquido" REAL NOT NULL,
    "liquidoAPagar" REAL NOT NULL,
    "estado" TEXT NOT NULL,
    "egresoFIReferencia" TEXT,
    "proyeccionPEReferencia" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "liquidaciones_pl_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "adelantos_pl" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "trabajadorPersonaId" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "monto" REAL NOT NULL,
    "glosa" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "liquidacionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "adelantos_pl_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "certificados_ct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "codigoVerificacion" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "unidadId" TEXT,
    "personaId" TEXT,
    "origenRef" TEXT,
    "solicitanteNombre" TEXT NOT NULL,
    "resumen" TEXT NOT NULL,
    "detalle" JSONB NOT NULL,
    "firmaUrl" TEXT,
    "fechaEmision" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "certificados_ct_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "reportes_re" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "bloques" JSONB NOT NULL,
    "segmento" JSONB NOT NULL,
    "payloadSnapshot" JSONB NOT NULL,
    "fechaGeneracion" TEXT NOT NULL,
    "destinatariosPersonaId" JSONB NOT NULL,
    "distribuidoA" INTEGER NOT NULL,
    "fechaDistribucion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "reportes_re_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_afp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tasaCotizacion" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maestros_afp_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_prevision_salud" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maestros_prevision_salud_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_mutual_caja" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maestros_mutual_caja_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_feriado" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "irrenunciable" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "maestros_feriado_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_banco" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maestros_banco_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_indice_ajuste" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maestros_indice_ajuste_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_caja_fondo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maestros_caja_fondo_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_categoria_insumo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maestros_categoria_insumo_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_unidad_medida" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "abreviatura" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maestros_unidad_medida_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_contacto_emergencia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "categoria" TEXT,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "sitioWeb" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maestros_contacto_emergencia_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_condicion_especial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maestros_condicion_especial_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_estado_ocupacion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "hex" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maestros_estado_ocupacion_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_categoria_macro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maestros_categoria_macro_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_categoria_micro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maestros_categoria_micro_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_categoria_unidad" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maestros_categoria_unidad_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_estado_inmobiliario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maestros_estado_inmobiliario_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_asignacion_familiar" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "monto" REAL NOT NULL,
    "rangoRentas" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maestros_asignacion_familiar_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_jornada" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maestros_jornada_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_courier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maestros_courier_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maestros_contratista" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rubro" TEXT,
    "telefono" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maestros_contratista_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Comunidad_slug_key" ON "Comunidad"("slug");

-- CreateIndex
CREATE INDEX "tipos_unidad_comunidadId_idx" ON "tipos_unidad"("comunidadId");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_unidad_comunidadId_nombre_key" ON "tipos_unidad"("comunidadId", "nombre");

-- CreateIndex
CREATE INDEX "macro_sectores_comunidadId_idx" ON "macro_sectores"("comunidadId");

-- CreateIndex
CREATE UNIQUE INDEX "macro_sectores_comunidadId_nombre_key" ON "macro_sectores"("comunidadId", "nombre");

-- CreateIndex
CREATE INDEX "micro_sectores_comunidadId_idx" ON "micro_sectores"("comunidadId");

-- CreateIndex
CREATE INDEX "micro_sectores_macroSectorId_idx" ON "micro_sectores"("macroSectorId");

-- CreateIndex
CREATE INDEX "unidades_comunidadId_idx" ON "unidades"("comunidadId");

-- CreateIndex
CREATE INDEX "unidades_microSectorId_idx" ON "unidades"("microSectorId");

-- CreateIndex
CREATE INDEX "unidades_tipoUnidadId_idx" ON "unidades"("tipoUnidadId");

-- CreateIndex
CREATE INDEX "personas_comunidadId_idx" ON "personas"("comunidadId");

-- CreateIndex
CREATE INDEX "personas_rut_idx" ON "personas"("rut");

-- CreateIndex
CREATE INDEX "vinculos_comunidadId_idx" ON "vinculos"("comunidadId");

-- CreateIndex
CREATE INDEX "vinculos_personaId_idx" ON "vinculos"("personaId");

-- CreateIndex
CREATE INDEX "vinculos_unidadId_idx" ON "vinculos"("unidadId");

-- CreateIndex
CREATE INDEX "eventos_auditoria_comunidadId_idx" ON "eventos_auditoria"("comunidadId");

-- CreateIndex
CREATE INDEX "eventos_auditoria_categoria_idx" ON "eventos_auditoria"("categoria");

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_global_comunidadId_key" ON "configuracion_global"("comunidadId");

-- CreateIndex
CREATE INDEX "configuracion_global_comunidadId_idx" ON "configuracion_global"("comunidadId");

-- CreateIndex
CREATE INDEX "publicaciones_portal_comunidadId_idx" ON "publicaciones_portal"("comunidadId");

-- CreateIndex
CREATE INDEX "publicaciones_portal_unidadId_idx" ON "publicaciones_portal"("unidadId");

-- CreateIndex
CREATE INDEX "leads_portal_comunidadId_idx" ON "leads_portal"("comunidadId");

-- CreateIndex
CREATE INDEX "leads_portal_publicacionId_idx" ON "leads_portal"("publicacionId");

-- CreateIndex
CREATE INDEX "notificaciones_comunidadId_idx" ON "notificaciones"("comunidadId");

-- CreateIndex
CREATE INDEX "notificaciones_destinatarioRol_idx" ON "notificaciones"("destinatarioRol");

-- CreateIndex
CREATE INDEX "controles_propiedad_comunidadId_idx" ON "controles_propiedad"("comunidadId");

-- CreateIndex
CREATE INDEX "controles_propiedad_unidadId_idx" ON "controles_propiedad"("unidadId");

-- CreateIndex
CREATE INDEX "actas_gd_comunidadId_idx" ON "actas_gd"("comunidadId");

-- CreateIndex
CREATE INDEX "plantillas_co_comunidadId_idx" ON "plantillas_co"("comunidadId");

-- CreateIndex
CREATE INDEX "envios_co_comunidadId_idx" ON "envios_co"("comunidadId");

-- CreateIndex
CREATE INDEX "mensajes_buzon_co_comunidadId_idx" ON "mensajes_buzon_co"("comunidadId");

-- CreateIndex
CREATE INDEX "documentos_co_comunidadId_idx" ON "documentos_co"("comunidadId");

-- CreateIndex
CREATE INDEX "solicitudes_ge_comunidadId_idx" ON "solicitudes_ge"("comunidadId");

-- CreateIndex
CREATE INDEX "recursos_ir_comunidadId_idx" ON "recursos_ir"("comunidadId");

-- CreateIndex
CREATE INDEX "recursos_ir_categoria_idx" ON "recursos_ir"("categoria");

-- CreateIndex
CREATE INDEX "solicitudes_insumo_ir_comunidadId_idx" ON "solicitudes_insumo_ir"("comunidadId");

-- CreateIndex
CREATE INDEX "entregas_epp_comunidadId_idx" ON "entregas_epp"("comunidadId");

-- CreateIndex
CREATE INDEX "entregas_epp_personaId_idx" ON "entregas_epp"("personaId");

-- CreateIndex
CREATE INDEX "tipos_infraccion_in_comunidadId_idx" ON "tipos_infraccion_in"("comunidadId");

-- CreateIndex
CREATE INDEX "infracciones_in_comunidadId_idx" ON "infracciones_in"("comunidadId");

-- CreateIndex
CREATE INDEX "infracciones_in_unidadId_idx" ON "infracciones_in"("unidadId");

-- CreateIndex
CREATE INDEX "trabajos_mt_comunidadId_idx" ON "trabajos_mt"("comunidadId");

-- CreateIndex
CREATE INDEX "proyectos_mt_comunidadId_idx" ON "proyectos_mt"("comunidadId");

-- CreateIndex
CREATE INDEX "elementos_ra_comunidadId_idx" ON "elementos_ra"("comunidadId");

-- CreateIndex
CREATE INDEX "reservas_ra_comunidadId_idx" ON "reservas_ra"("comunidadId");

-- CreateIndex
CREATE INDEX "reservas_ra_elementoId_idx" ON "reservas_ra"("elementoId");

-- CreateIndex
CREATE INDEX "avisos_cv_comunidadId_idx" ON "avisos_cv"("comunidadId");

-- CreateIndex
CREATE INDEX "plantillas_cv_comunidadId_idx" ON "plantillas_cv"("comunidadId");

-- CreateIndex
CREATE INDEX "fondos_fi_comunidadId_idx" ON "fondos_fi"("comunidadId");

-- CreateIndex
CREATE UNIQUE INDEX "fondos_fi_comunidadId_nombre_key" ON "fondos_fi"("comunidadId", "nombre");

-- CreateIndex
CREATE INDEX "egresos_fi_comunidadId_idx" ON "egresos_fi"("comunidadId");

-- CreateIndex
CREATE INDEX "egresos_fi_fondoId_idx" ON "egresos_fi"("fondoId");

-- CreateIndex
CREATE INDEX "emisiones_gc_comunidadId_idx" ON "emisiones_gc"("comunidadId");

-- CreateIndex
CREATE INDEX "emisiones_gc_periodo_idx" ON "emisiones_gc"("periodo");

-- CreateIndex
CREATE INDEX "cobros_fi_comunidadId_idx" ON "cobros_fi"("comunidadId");

-- CreateIndex
CREATE INDEX "cobros_fi_unidadId_idx" ON "cobros_fi"("unidadId");

-- CreateIndex
CREATE INDEX "cobros_fi_periodo_idx" ON "cobros_fi"("periodo");

-- CreateIndex
CREATE INDEX "bitacora_visitas_pe_comunidadId_idx" ON "bitacora_visitas_pe"("comunidadId");

-- CreateIndex
CREATE INDEX "encomiendas_pe_comunidadId_idx" ON "encomiendas_pe"("comunidadId");

-- CreateIndex
CREATE INDEX "ingresos_contratista_pe_comunidadId_idx" ON "ingresos_contratista_pe"("comunidadId");

-- CreateIndex
CREATE INDEX "proveedores_pe_comunidadId_idx" ON "proveedores_pe"("comunidadId");

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_pe_comunidadId_rut_key" ON "proveedores_pe"("comunidadId", "rut");

-- CreateIndex
CREATE INDEX "mantenciones_preventivas_pe_comunidadId_idx" ON "mantenciones_preventivas_pe"("comunidadId");

-- CreateIndex
CREATE INDEX "mantenciones_preventivas_pe_proveedorId_idx" ON "mantenciones_preventivas_pe"("proveedorId");

-- CreateIndex
CREATE INDEX "visitas_tecnicas_pe_comunidadId_idx" ON "visitas_tecnicas_pe"("comunidadId");

-- CreateIndex
CREATE INDEX "visitas_tecnicas_pe_proveedorId_idx" ON "visitas_tecnicas_pe"("proveedorId");

-- CreateIndex
CREATE INDEX "cierres_turno_pe_comunidadId_idx" ON "cierres_turno_pe"("comunidadId");

-- CreateIndex
CREATE INDEX "proyecciones_pe_comunidadId_idx" ON "proyecciones_pe"("comunidadId");

-- CreateIndex
CREATE INDEX "liquidaciones_pl_comunidadId_idx" ON "liquidaciones_pl"("comunidadId");

-- CreateIndex
CREATE INDEX "liquidaciones_pl_trabajadorPersonaId_idx" ON "liquidaciones_pl"("trabajadorPersonaId");

-- CreateIndex
CREATE INDEX "adelantos_pl_comunidadId_idx" ON "adelantos_pl"("comunidadId");

-- CreateIndex
CREATE INDEX "adelantos_pl_trabajadorPersonaId_idx" ON "adelantos_pl"("trabajadorPersonaId");

-- CreateIndex
CREATE INDEX "certificados_ct_comunidadId_idx" ON "certificados_ct"("comunidadId");

-- CreateIndex
CREATE INDEX "reportes_re_comunidadId_idx" ON "reportes_re"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_afp_comunidadId_idx" ON "maestros_afp"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_prevision_salud_comunidadId_idx" ON "maestros_prevision_salud"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_mutual_caja_comunidadId_idx" ON "maestros_mutual_caja"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_feriado_comunidadId_idx" ON "maestros_feriado"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_banco_comunidadId_idx" ON "maestros_banco"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_indice_ajuste_comunidadId_idx" ON "maestros_indice_ajuste"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_caja_fondo_comunidadId_idx" ON "maestros_caja_fondo"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_categoria_insumo_comunidadId_idx" ON "maestros_categoria_insumo"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_unidad_medida_comunidadId_idx" ON "maestros_unidad_medida"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_contacto_emergencia_comunidadId_idx" ON "maestros_contacto_emergencia"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_condicion_especial_comunidadId_idx" ON "maestros_condicion_especial"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_estado_ocupacion_comunidadId_idx" ON "maestros_estado_ocupacion"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_categoria_macro_comunidadId_idx" ON "maestros_categoria_macro"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_categoria_micro_comunidadId_idx" ON "maestros_categoria_micro"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_categoria_unidad_comunidadId_idx" ON "maestros_categoria_unidad"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_estado_inmobiliario_comunidadId_idx" ON "maestros_estado_inmobiliario"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_asignacion_familiar_comunidadId_idx" ON "maestros_asignacion_familiar"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_jornada_comunidadId_idx" ON "maestros_jornada"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_courier_comunidadId_idx" ON "maestros_courier"("comunidadId");

-- CreateIndex
CREATE INDEX "maestros_contratista_comunidadId_idx" ON "maestros_contratista"("comunidadId");
