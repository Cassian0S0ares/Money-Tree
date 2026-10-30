@echo off
setlocal
cd /d %~dp0

if not exist .env (
    echo .env nao encontrado. Copiando de .env.example...
    copy .env.example .env >nul
    echo Preencha .env e rode de novo.
    exit /b 1
)

if not exist node_modules (
    echo Instalando dependencias...
    call npm ci || exit /b 1
) else (
    call npm install || exit /b 1
)

call npx tsx --env-file=.env scripts/migrate.ts || exit /b 1

REM Abre um segundo terminal livre na pasta do projeto para outros comandos
start "Money Tree - Terminal" cmd /k "cd /d %~dp0"

call npm run dev

endlocal
