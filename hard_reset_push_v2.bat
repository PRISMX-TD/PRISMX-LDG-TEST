@echo off
echo ===================================================
echo      PRISMX LEDGER - HARD RESET & FORCE PUSH (FIXED)
echo ===================================================
echo.

set REMOTE_URL=https://github.com/PRISMX-TD/PRISMX-LDG-TEST.git

echo [1/6] Removing old git history...
if exist .git rmdir /s /q .git

echo.
echo [2/6] Initializing new git repository...
git init
git branch -m main

echo.
echo [3/6] Configuring user identity (temporary for this repo)...
git config user.email "bot@trae.ai"
git config user.name "Trae Bot"

echo.
echo [4/6] Adding remote origin...
git remote add origin %REMOTE_URL%

echo.
echo [5/6] Adding all files...
git add .
git commit -m "feat: initial release (clean version)"

echo.
echo [6/6] Force pushing to GitHub...
git push -u --force origin main

echo.
echo ===================================================
echo      RESET COMPLETE!
echo      The repository has been reset to this clean version.
echo      You can now delete this script.
echo ===================================================
pause
