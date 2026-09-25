#!/bin/bash
#
# deploy-vercel-auto.sh — Deploy automatizado de Compass a Vercel via CLI
#
# Uso:
#   cd k0mp4ss_fe/apps/web
#   bash scripts/deploy-vercel-auto.sh
#
# El script:
# 1. Verifica prerequisitos (Node, Git)
# 2. Instala Vercel CLI si no existe
# 3. Hace deploy inicial desde el directorio de la app
# 4. Lee variables de .env.local y las sube a Vercel
# 5. Redeploya con variables configuradas

set -euo pipefail

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err()  { echo -e "${RED}[ERROR]${NC} $1"; }

# Verificar que estamos en el directorio correcto
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$WEB_DIR/../.." && pwd)"

if [ ! -f "$WEB_DIR/package.json" ]; then
  log_err "No se encontró package.json en $WEB_DIR"
  log_err "Corré este script desde k0mp4ss_fe/apps/web/"
  exit 1
fi

cd "$WEB_DIR"

log_info "Directorio de trabajo: $(pwd)"

# Verificar Node.js
if ! command -v node &> /dev/null; then
  log_err "Node.js no está instalado. Instalalo primero: https://nodejs.org"
  exit 1
fi
NODE_VERSION=$(node -v)
log_ok "Node.js detectado: $NODE_VERSION"

# Verificar Git
if ! command -v git &> /dev/null; then
  log_warn "Git no está instalado. Puede ser necesario para Vercel CLI."
fi

# Instalar Vercel CLI si no existe
if ! command -v vercel &> /dev/null; then
  log_info "Instalando Vercel CLI..."
  npm install -g vercel
else
  log_ok "Vercel CLI ya está instalado: $(vercel --version)"
fi

# Verificar login
log_info "Verificando autenticación con Vercel..."
if ! vercel whoami &> /dev/null; then
  log_warn "No estás logueado en Vercel."
  log_info "Ejecutando 'vercel login'..."
  vercel login
fi

VERCEL_USER=$(vercel whoami)
log_ok "Logueado como: $VERCEL_USER"

# Verificar .env.local
ENV_FILE=".env.local"
if [ ! -f "$ENV_FILE" ]; then
  log_warn "No se encontró $ENV_FILE"
  ENV_FILE=".env"
  if [ ! -f "$ENV_FILE" ]; then
    log_err "No se encontró .env.local ni .env"
    log_err "Creá el archivo con las variables de entorno antes de deployar."
    exit 1
  fi
fi

log_ok "Usando variables de: $ENV_FILE"

# Función para leer variable del archivo .env
read_env_var() {
  local key="$1"
  local value=""
  if [ -f "$ENV_FILE" ]; then
    value=$(grep "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | sed "s/^${key}=//" | sed 's/^["\x27]//' | sed 's/["\x27]$//' || true)
  fi
  echo "$value"
}

# Variables requeridas
DATABASE_URL=$(read_env_var "DATABASE_URL")
AUTH_SECRET=$(read_env_var "AUTH_SECRET")
GOOGLE_CLIENT_ID=$(read_env_var "GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET=$(read_env_var "GOOGLE_CLIENT_SECRET")
APP_ENV=$(read_env_var "APP_ENV")
CLAVE_CIFRADO_DATOS=$(read_env_var "CLAVE_CIFRADO_DATOS")

# Verificar que las variables críticas existen
MISSING=()
[ -z "$DATABASE_URL" ] && MISSING+=("DATABASE_URL")
[ -z "$AUTH_SECRET" ] && MISSING+=("AUTH_SECRET")
[ -z "$GOOGLE_CLIENT_ID" ] && MISSING+=("GOOGLE_CLIENT_ID")
[ -z "$GOOGLE_CLIENT_SECRET" ] && MISSING+=("GOOGLE_CLIENT_SECRET")
[ -z "$APP_ENV" ] && APP_ENV="production"
[ -z "$CLAVE_CIFRADO_DATOS" ] && MISSING+=("CLAVE_CIFRADO_DATOS")

if [ ${#MISSING[@]} -gt 0 ]; then
  log_err "Faltan variables obligatorias en $ENV_FILE:"
  for var in "${MISSING[@]}"; do
    log_err "  - $var"
  done
  exit 1
fi

log_ok "Todas las variables encontradas en $ENV_FILE"

# Limpiar config vieja de Vercel
if [ -d ".vercel" ]; then
  log_warn "Eliminando configuración vieja de .vercel/"
  rm -rf .vercel/
fi

# Deploy inicial
log_info "Iniciando deploy en Vercel (región iad1)..."
log_info "Cuando te pregunte, elegí:"
log_info "  - 'Set up and deploy?' → Y"
log_info "  - 'Link to existing project?' → N (crear nuevo)"
log_info "  - 'Project name' → compass (o el que prefieras)"
log_info ""

# Forzar región iad1 y limpiar cache
vercel --prod --yes --region iad1 2>/dev/null || vercel --prod --region iad1

# Obtener el nombre del proyecto deployado
# Vercel crea un archivo .vercel/project.json
PROJECT_ID=""
if [ -f ".vercel/project.json" ]; then
  PROJECT_ID=$(cat .vercel/project.json | grep -o '"projectId"[^,]*' | sed 's/.*"projectId":"\([^"]*\)".*/\1/')
fi

if [ -z "$PROJECT_ID" ]; then
  log_warn "No se pudo detectar el projectId automáticamente."
  log_info "Agregá las variables manualmente en el dashboard de Vercel:"
  log_info "  Settings → Environment Variables"
  exit 0
fi

log_ok "Proyecto Vercel detectado: $PROJECT_ID"

# Agregar variables de entorno
log_info "Agregando variables de entorno..."

add_env() {
  local key="$1"
  local value="$2"
  log_info "  → $key"
  echo "$value" | vercel env add "$key" production --yes 2>/dev/null || true
}

add_env "DATABASE_URL" "$DATABASE_URL"
add_env "AUTH_SECRET" "$AUTH_SECRET"
add_env "GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_ID"
add_env "GOOGLE_CLIENT_SECRET" "$GOOGLE_CLIENT_SECRET"
add_env "APP_ENV" "$APP_ENV"
add_env "CLAVE_CIFRADO_DATOS" "$CLAVE_CIFRADO_DATOS"

log_ok "Variables agregadas."

# Redeploy con variables
log_info "Redeployando con variables configuradas..."
vercel --prod --yes --region iad1

log_ok "Deploy completado!"
log_info "Tu app debería estar disponible en el URL que muestra Vercel arriba."
log_info ""
log_info "Para verificar:"
log_info "  - /ingresar → login con credentials"
log_info "  - /ingresar → botón 'Continuar con Google'"
log_info "  - /admin → panel administrativo"
