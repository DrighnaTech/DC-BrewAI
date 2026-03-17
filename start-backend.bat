@echo off
echo Starting BrewAI Backend...
cd /d "%~dp0backend"
venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
