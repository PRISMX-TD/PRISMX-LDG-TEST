@echo off
echo ===================================================
echo      PRISMX LEDGER - HARD RESET & FORCE PUSH
echo ===================================================
echo.
echo [WARNING] This will overwrite the remote repository history.
echo           Ensure you have the correct remote URL configured.
echo.

set REMOTE_URL=https://github.com/PRISMX-TD/PRISMX-LDG-TEST.git

echo [1/5] Removing old git history...
rmdir /s /q .git

echo.
echo [2/5] Initializing new git repository...
git init
git branch -m main

echo.
echo [3/5] Adding remote origin...
git remote add origin %REMOTE_URL%

echo.
echo [4/5] Adding all files...
git add .
git commit -m "feat: initial release (clean version)"

echo.
echo [5/5] Force pushing to GitHub...
git push -u --force origin main

echo.
echo ===================================================
echo      RESET COMPLETE!
echo      The repository has been reset to this clean version.
echo      You can now delete this script.
echo ===================================================
pause
