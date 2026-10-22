@echo off
cd /d "%~dp0"
where npm >nul 2>nul || (echo Node.js is not installed. Install it from https://nodejs.org then run this file again. & pause & exit /b)
if not exist node_modules call npm install
call npm run build
start "PahaadCare Server" cmd /k "npm run preview -- --host 127.0.0.1 --port 4173"
timeout /t 6 /nobreak >nul
start "" http://127.0.0.1:4173
