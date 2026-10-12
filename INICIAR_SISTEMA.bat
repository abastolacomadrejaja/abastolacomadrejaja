@echo off
title Sistema Abasto La Comadrejaja
echo ======================================================
echo    Iniciando Servidor Local - Abasto La Comadrejaja   
echo ======================================================
echo Abriendo en el navegador con soporte completo para camara...
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
