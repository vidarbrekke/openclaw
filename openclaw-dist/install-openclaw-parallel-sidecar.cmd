@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-openclaw-parallel-sidecar.ps1"
endlocal
