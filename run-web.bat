@echo off
cd /d "%~dp0"

set "PNPM_CMD="
for /f "delims=" %%P in ('where pnpm 2^>nul') do if not defined PNPM_CMD set "PNPM_CMD=%%P"
if not defined PNPM_CMD set "PNPM_CMD=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"

if not exist "%PNPM_CMD%" (
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

echo Dang kiem tra API va web...
powershell -NoProfile -Command "if (Test-NetConnection localhost -Port 3000 -WarningAction SilentlyContinue -InformationLevel Quiet) { exit 0 } else { exit 1 }"
if %ERRORLEVEL% EQU 0 (
    echo API dang chay tai cong 3000, se su dung lai tien trinh hien tai.
) else (
    echo Dang khoi dong API...
    start "Flashcard API" cmd /k call "%PNPM_CMD%" --filter @flashcard/api start:dev
)

echo Dang cho API san sang...
powershell -NoProfile -Command "$deadline = (Get-Date).AddSeconds(30); do { if (Test-NetConnection localhost -Port 3000 -WarningAction SilentlyContinue -InformationLevel Quiet) { exit 0 }; Start-Sleep -Seconds 1 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 (
    echo API khong san sang sau 30 giay. Hay kiem tra cua so Flashcard API.
    pause
    exit /b 1
)

powershell -NoProfile -Command "if (Test-NetConnection localhost -Port 5556 -WarningAction SilentlyContinue -InformationLevel Quiet) { exit 0 } else { exit 1 }"
if %ERRORLEVEL% EQU 0 (
    echo Web dang chay tai cong 5556, se su dung lai tien trinh hien tai.
) else (
    echo Dang khoi dong web tai cong 5556...
    start "Flashcard Web" cmd /k call "%PNPM_CMD%" --filter @flashcard/web dev -- --host localhost --port 5556 --strictPort
)

echo Dang cho web san sang...
powershell -NoProfile -Command "$deadline = (Get-Date).AddSeconds(30); do { if (Test-NetConnection localhost -Port 5556 -WarningAction SilentlyContinue -InformationLevel Quiet) { exit 0 }; Start-Sleep -Seconds 1 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 (
    echo Web khong san sang sau 30 giay. Hay kiem tra cua so Flashcard Web.
    pause
    exit /b 1
)

echo API: http://localhost:3000/api
echo Swagger: http://localhost:3000/api/docs
echo Web: http://localhost:5556
start "" "http://localhost:5556/"

pause
