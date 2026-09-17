@echo off
setlocal
cd /d "%~dp0"
if exist "%ProgramFiles%\nodejs\npm.cmd" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\node\npm.cmd" set "PATH=%LocalAppData%\Programs\node;%PATH%"

echo Building...
call npm.cmd run build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo Publishing dist to gh-pages...
call npx --yes gh-pages@6 -d dist --dotfiles -m "deploy: update GitHub Pages"
if errorlevel 1 (
  echo Publish failed. Check git remote and GitHub login.
  pause
  exit /b 1
)

echo.
echo Done. Site: https://xiongbubuyu12-cyber.github.io/table-filter/
echo.
pause
