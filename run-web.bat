@echo off
cd /d "%~dp0"

where pnpm >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set "PNPM_CMD=pnpm"
) else (
    set "PNPM_CMD=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
)

if not "%PNPM_CMD%" == "pnpm" if not exist "%PNPM_CMD%" (
    echo Khong tim thay pnpm. Hay cai pnpm hoac them pnpm vao PATH.
    pause
    exit /b 1
)

where docker >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Dang khoi dong SQL Server...
    docker compose up -d sqlserver
    if errorlevel 1 (
        echo Khong khoi dong duoc SQL Server. Hay kiem tra Docker Desktop.
        pause
        exit /b 1
    )
    timeout /t 20 /nobreak >nul
)

echo Dang chay migration...
call "%PNPM_CMD%" --filter @flashcard/api migration:run
if errorlevel 1 (
    echo Migration that bai. API can SQL Server dang chay va dung thong tin trong file .env.
    pause
    exit /b 1
)

echo Dang khoi dong API va web...
start "Flashcard API" cmd /k call "%PNPM_CMD%" --filter @flashcard/api start:dev
start "Flashcard Web" cmd /k call "%PNPM_CMD%" --filter @flashcard/web dev

echo API: http://localhost:3000/api
echo Swagger: http://localhost:3000/api/docs
echo Web: http://localhost:5173

pause
