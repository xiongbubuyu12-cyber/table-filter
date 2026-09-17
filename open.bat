@echo off
setlocal
cd /d "%~dp0"
set PORT=5021
set TITLE=table-filter
call "%~dp0..\.workbuddy\vite-launch.bat"
