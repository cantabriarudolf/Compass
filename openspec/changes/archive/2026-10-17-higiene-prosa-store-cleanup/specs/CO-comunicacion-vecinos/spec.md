## MODIFIED Requirements

### Requirement: Biblioteca de Documentos Comunales
El sistema MUST ofrecer acceso 24/7 a documentos comunales referenciados por metadatos + URL (nombre, tipo MIME, tamañoKB, url — D1, jamás base64/Blob), gestionados con `saveDocumentoCO`/`removeDocumentoCO` (store) y por la API REST `/api/co/documentos` (GET paginado, POST upsert idempotente; detalle/PUT/DELETE en `/[id]`); cada descarga queda auditada como `CO_DOC_DOWNLOAD`.

#### Scenario: Descarga auditada
- **WHEN** un usuario abre un documento de la biblioteca
- **THEN** se emite el evento `CO_DOC_DOWNLOAD` con referencia al documento

#### Scenario: Documento por referencia
- **WHEN** se intenta guardar un documento con URL data:/blob:
- **THEN** retorna `{ok:false}` citando la regla D1 media por referencia
