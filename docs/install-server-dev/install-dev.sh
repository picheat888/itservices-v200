#!/usr/bin/env bash
#
# install-dev.sh — Auto-install the IT Service V2 project for local development.
#
# Idempotent: safe to run multiple times. Each step checks current state before
# acting, so re-running only fixes what is missing.
#
# Usage:
#   bash docs/install-server-dev/install-dev.sh [options]
#
# Options:
#   --seed        Run database seeders (demo data + demo login accounts)
#   --fresh       Drop all tables and re-migrate (DESTRUCTIVE), implies a clean DB
#   --no-npm      Skip `npm install`
#   --no-composer Skip `composer install`
#   --help        Show this help
#
# Override DB settings via env vars before running, e.g.:
#   DB_NAME=mydb DB_USER=me DB_PASS=secret bash docs/install-server-dev/install-dev.sh
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Settings (override via environment variables)
# ---------------------------------------------------------------------------
DB_NAME="${DB_NAME:-itservices}"
DB_USER="${DB_USER:-itservices}"
DB_PASS="${DB_PASS:-itservices}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"

# Sanctum SPA stateful hosts — both localhost and 127.0.0.1 on the dev ports,
# so login works no matter which URL you open. (8000 = artisan serve, 5173 = vite)
SANCTUM_DOMAINS="localhost,localhost:8000,localhost:5173,127.0.0.1,127.0.0.1:8000,127.0.0.1:5173,::1"

# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------
DO_SEED=0
DO_FRESH=0
DO_NPM=1
DO_COMPOSER=1
for arg in "$@"; do
  case "$arg" in
    --seed) DO_SEED=1 ;;
    --fresh) DO_FRESH=1 ;;
    --no-npm) DO_NPM=0 ;;
    --no-composer) DO_COMPOSER=0 ;;
    --help|-h)
      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Unknown option: $arg (use --help)"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
# Resolve project root = two levels up from this script (docs/install-server-dev/..).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
cd "$PROJECT_ROOT"

c_reset=$'\033[0m'; c_grn=$'\033[32m'; c_yel=$'\033[33m'; c_red=$'\033[31m'; c_blu=$'\033[36m'
step() { printf "\n${c_blu}==> %s${c_reset}\n" "$*"; }
ok()   { printf "    ${c_grn}OK${c_reset} %s\n" "$*"; }
warn() { printf "    ${c_yel}!!${c_reset} %s\n" "$*"; }
die()  { printf "\n${c_red}ERROR:${c_reset} %s\n" "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# set_env KEY VALUE — set or append a key in .env, handling commented (# KEY=) lines.
set_env() {
  local key="$1"; shift; local val="$*"
  local esc; esc="$(printf '%s' "$val" | sed -e 's/[&|]/\\&/g')"
  if grep -qE "^#?[[:space:]]*${key}=" "$ENV_FILE"; then
    sed -i.bak -E "s|^#?[[:space:]]*${key}=.*|${key}=${esc}|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}

# Find a working MariaDB admin connection (socket as current user, or root).
DB_ADMIN=""
detect_db_admin() {
  local tries=( "mariadb" "mariadb -uroot" "sudo mariadb -uroot" "mysql" "mysql -uroot" )
  local cmd
  for cmd in "${tries[@]}"; do
    if $cmd -e "SELECT 1;" >/dev/null 2>&1; then DB_ADMIN="$cmd"; return 0; fi
  done
  return 1
}

# ---------------------------------------------------------------------------
# 1. Prerequisites
# ---------------------------------------------------------------------------
step "Checking prerequisites"
have php      || die "php not found. Install PHP 8.2+ (brew install php)."
have composer || die "composer not found. Install Composer (brew install composer)."
[ "$DO_NPM" -eq 1 ] && { have node || die "node not found. Install Node 20+ (brew install node)."; }
PHP_VER="$(php -r 'echo PHP_VERSION;')"
ok "php $PHP_VER, composer $(composer --version 2>/dev/null | awk '{print $3}')"
[ "$DO_NPM" -eq 1 ] && ok "node $(node -v), npm $(npm -v)"

if ! have mariadb && ! have mysql; then
  die "mariadb/mysql client not found. Install MariaDB (brew install mariadb)."
fi

# ---------------------------------------------------------------------------
# 2. MariaDB service + database + user
# ---------------------------------------------------------------------------
step "Ensuring MariaDB is running"
if (have mariadb-admin && mariadb-admin ping >/dev/null 2>&1) || (have mysqladmin && mysqladmin ping >/dev/null 2>&1); then
  ok "MariaDB already running"
else
  warn "MariaDB not responding — attempting to start"
  if have brew; then brew services start mariadb >/dev/null 2>&1 || true; fi
  sleep 3
  (have mariadb-admin && mariadb-admin ping >/dev/null 2>&1) \
    || die "Could not start MariaDB. Start it manually: brew services start mariadb"
  ok "MariaDB started"
fi

step "Creating database '$DB_NAME' and user '$DB_USER'"
detect_db_admin || die "Cannot connect to MariaDB as an admin. Try: sudo mariadb -uroot, then create the DB/user manually (see readme.txt)."
ok "admin connection: $DB_ADMIN"
$DB_ADMIN <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
ok "database + user ready"

# Verify the app can log in over TCP (Laravel uses PDO/TCP, not the socket).
if mariadb -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "SELECT 1;" >/dev/null 2>&1; then
  ok "TCP login as '$DB_USER' verified"
else
  warn "TCP login as '$DB_USER' failed — check the password or user host grants"
fi

# ---------------------------------------------------------------------------
# 3. .env
# ---------------------------------------------------------------------------
step "Preparing .env"
if [ ! -f "$ENV_FILE" ]; then
  cp "$PROJECT_ROOT/.env.example" "$ENV_FILE"
  ok "created .env from .env.example"
else
  ok ".env already exists"
fi
set_env DB_CONNECTION mariadb
set_env DB_HOST "$DB_HOST"
set_env DB_PORT "$DB_PORT"
set_env DB_DATABASE "$DB_NAME"
set_env DB_USERNAME "$DB_USER"
set_env DB_PASSWORD "$DB_PASS"
set_env SANCTUM_STATEFUL_DOMAINS "$SANCTUM_DOMAINS"
ok "DB + Sanctum settings written"

# ---------------------------------------------------------------------------
# 4. Dependencies
# ---------------------------------------------------------------------------
if [ "$DO_COMPOSER" -eq 1 ]; then
  step "Installing PHP dependencies (composer install)"
  composer install --no-interaction
  ok "composer install done"
else
  warn "Skipping composer install (--no-composer)"
fi

if [ "$DO_NPM" -eq 1 ]; then
  step "Installing JS dependencies (npm install)"
  npm install
  ok "npm install done"
else
  warn "Skipping npm install (--no-npm)"
fi

# ---------------------------------------------------------------------------
# 5. App key
# ---------------------------------------------------------------------------
step "Application key"
if grep -qE '^APP_KEY=base64:.+' "$ENV_FILE"; then
  ok "APP_KEY already set"
else
  php artisan key:generate
  ok "APP_KEY generated"
fi

# ---------------------------------------------------------------------------
# 6. Migrate (+ optional seed)
# ---------------------------------------------------------------------------
if [ "$DO_FRESH" -eq 1 ]; then
  step "Migrating database (FRESH — drops all tables)"
  if [ "$DO_SEED" -eq 1 ]; then php artisan migrate:fresh --seed --force; else php artisan migrate:fresh --force; fi
else
  step "Migrating database"
  php artisan migrate --force
  if [ "$DO_SEED" -eq 1 ]; then
    step "Seeding database (demo data + demo logins)"
    php artisan db:seed --force
  fi
fi
ok "migrations done"

# ---------------------------------------------------------------------------
# 7. Storage link + clear config cache
# ---------------------------------------------------------------------------
step "Finalizing"
php artisan storage:link >/dev/null 2>&1 || warn "storage:link skipped (already linked)"
php artisan config:clear >/dev/null 2>&1 || true
ok "storage linked, config cache cleared"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
printf "\n${c_grn}========================================${c_reset}\n"
printf "${c_grn} Install complete.${c_reset}\n"
printf "${c_grn}========================================${c_reset}\n"
echo
echo "Start the dev server (server + queue + vite):"
echo "    composer run dev"
echo
echo "Then open:  http://localhost:8000"
if [ "$DO_SEED" -eq 1 ]; then
  echo
  echo "Demo logins (password for all = 'password'):"
  echo "    super  (super admin)   it  (IT admin)   hr  (HR)   user  (staff)"
fi
echo
echo "If anything fails to log in or connect, read: docs/install-server-dev/readme.txt"
