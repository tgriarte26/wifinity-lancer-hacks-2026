@echo off
rem Developer mode: live reload while editing the code. Closing the app window stops everything.
cd /d "%~dp0"
title Orbit (developer mode)
call npm run dev
exit
