#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
    echo ".env não encontrado. Copiando de .env.example..."
    cp .env.example .env
    echo "Preencha .env e rode de novo."
    exit 1
fi

if [ ! -d node_modules ]; then
    echo "Instalando dependências..."
    npm ci
else
    npm install
fi

npx tsx --env-file=.env scripts/migrate.ts

# Abre um segundo terminal livre na pasta do projeto para outros comandos
DIR="$(pwd)"
if [[ "$OSTYPE" == darwin* ]]; then
    open -a Terminal "$DIR"
elif command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal --working-directory="$DIR" &
elif command -v konsole >/dev/null 2>&1; then
    konsole --workdir "$DIR" &
elif command -v x-terminal-emulator >/dev/null 2>&1; then
    (cd "$DIR" && x-terminal-emulator &)
else
    echo "Nenhum emulador de terminal encontrado; abra outro terminal manualmente."
fi

npm run dev
