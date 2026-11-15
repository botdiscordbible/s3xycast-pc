@echo off
REM ===========================================================================
REM  S3XYCast PC - builds the Windows installer, the way upstream's release
REM  workflow does (.github/workflows/release.yml), on a developer's machine:
REM    1. cmake --install : the program, the interface as shipped (no dev
REM       tooling), OpenSSL, the drivers;
REM    2. windeployqt     : the Qt runtime and Microsoft's VC++ redistributable;
REM    3. Qt's OpenSSL TLS plugin, which windeployqt leaves out;
REM    4. Inno Setup      : the installer (moonlightweb.iss).
REM
REM  Usage:   backend\installer\make-installer.bat <version> [output folder]
REM  Before:  backend\build_msvc.bat (the program, in build\)
REM  Needs:   QTDIR  the Qt kit (e.g. C:\Qt\6.11.0\msvc2022_64)
REM           ISCC   Inno Setup's ISCC.exe, 6.6 or newer (default: the usual
REM                  "Inno Setup 6" folder under Program Files)
REM  The version is the one the program was built as (its s3x-vX.Y.Z tag): the
REM  entry page only opens a machine whose interface is the published list of
REM  that version (bootstrap\v1\interfaces\<version>.json).
REM  Nothing is installed on this machine: the script only makes the file.
REM ===========================================================================
setlocal enabledelayedexpansion
set "ROOT=%~dp0..\.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
set "VERSION=%~1"
set "OUT=%~2"
if "%VERSION%"=="" goto usage
if "%OUT%"=="" set "OUT=%ROOT%\build\installer"
set "DIST=%ROOT%\build\dist"
if not defined ISCC set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"

if not defined QTDIR ( echo [ERROR] QTDIR is not set ^(the Qt kit, e.g. C:\Qt\6.11.0\msvc2022_64^) & exit /b 1 )
if not exist "%QTDIR%\bin\windeployqt.exe" ( echo [ERROR] windeployqt.exe not found under %QTDIR%\bin & exit /b 1 )
if not exist "%ISCC%" ( echo [ERROR] Inno Setup compiler not found: %ISCC% ^(set ISCC^) & exit /b 1 )
if not exist "%ROOT%\build\S3XYCastPC.exe" ( echo [ERROR] build\S3XYCastPC.exe is missing: run backend\build_msvc.bat first & exit /b 1 )
if not exist "%ROOT%\bootstrap\v1\interfaces\%VERSION%.json" (
    echo [ERROR] bootstrap\v1\interfaces\%VERSION%.json is missing: the entry page would refuse this version.
    echo         Build it on the release commit: node scripts\interface-list.mjs build %VERSION% --ref HEAD
    exit /b 1
)

REM windeployqt stages vc_redist only from inside a Visual C++ environment.
if not defined VCINSTALLDIR (
    set "VSPATH="
    set "_VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
    if exist "!_VSWHERE!" (
        for /f "usebackq tokens=*" %%i in (`"!_VSWHERE!" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSPATH=%%i"
    )
    if not defined VSPATH ( echo [ERROR] Visual C++ build tools not found & exit /b 1 )
    call "!VSPATH!\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
)

echo [1/4] cmake --install
if exist "%DIST%" rmdir /s /q "%DIST%"
cmake --install "%ROOT%\build" --prefix "%DIST%" --component app >nul
if !errorlevel! neq 0 ( echo [ERROR] cmake --install failed & exit /b 1 )

echo [2/4] windeployqt
"%QTDIR%\bin\windeployqt.exe" --release --compiler-runtime "%DIST%\S3XYCastPC.exe" >"%ROOT%\build\windeployqt.log" 2>&1
if !errorlevel! neq 0 ( echo [ERROR] windeployqt failed, see build\windeployqt.log & exit /b 1 )

echo [3/4] Qt OpenSSL TLS plugin
if not exist "%DIST%\tls" mkdir "%DIST%\tls"
copy /y "%QTDIR%\plugins\tls\qopensslbackend.dll" "%DIST%\tls\" >nul
if !errorlevel! neq 0 ( echo [ERROR] qopensslbackend.dll not found under %QTDIR%\plugins\tls & exit /b 1 )
for %%F in (libssl-3-x64.dll libcrypto-3-x64.dll vc_redist.x64.exe) do (
    if not exist "%DIST%\%%F" ( echo [ERROR] %%F was not staged & exit /b 1 )
)

echo [4/4] Inno Setup
if not exist "%OUT%" mkdir "%OUT%"
"%ISCC%" "/DSourceDir=%DIST%" /DMyArch=x64 "/DMyAppVersion=%VERSION%" "/O%OUT%" "%ROOT%\backend\installer\moonlightweb.iss" >"%OUT%\iscc.log" 2>&1
if !errorlevel! neq 0 ( echo [ERROR] Inno Setup failed, see %OUT%\iscc.log & exit /b 1 )
REM A log that could not be opened (the file held by whoever captures this
REM script's own output there) skips Inno Setup and leaves no error code: the
REM installer itself is what says the step ran.
if not exist "%OUT%\S3XYCastPC-installer-%VERSION%-win-x64.exe" ( echo [ERROR] Inno Setup wrote no installer, see %OUT%\iscc.log & exit /b 1 )
echo [OK] %OUT%\S3XYCastPC-installer-%VERSION%-win-x64.exe
endlocal
exit /b 0

:usage
echo usage: backend\installer\make-installer.bat ^<version^> [output folder]
exit /b 2
