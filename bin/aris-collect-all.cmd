@echo off
setlocal
chcp 65001 >nul
rem ARIS mailbox collect-all entry (Windows Task Scheduler)
rem mailbox: env ARIS_MAILBOX, else default shared mailbox
rem log: <workspace>\.dsh\logs\aris-collect.log

set "MB=%ARIS_MAILBOX%"
if not defined MB set "MB=%USERPROFILE%\aris-mailbox"

set "ROOT=%~dp0.."
set "LOG=%ROOT%\.dsh\logs\aris-collect.log"
if not exist "%ROOT%\.dsh\logs" mkdir "%ROOT%\.dsh\logs" >nul 2>nul

set "NODE_EXE="
where node >nul 2>nul
if %errorlevel%==0 set "NODE_EXE=node"
if not defined NODE_EXE if exist "%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\app.asar.unpacked\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\app.asar.unpacked\node.exe"

if not defined NODE_EXE (
  echo [ARIS] node not found, skip collect>>"%LOG%"
  exit /b 2
)

echo [%date% %time%] collect-all "%MB%" >>"%LOG%"
"%NODE_EXE%" "%ROOT%\bin\aris-review.mjs" --collect-all --mailbox "%MB%" >>"%LOG%" 2>&1
if errorlevel 1 exit /b 2
exit /b 0
