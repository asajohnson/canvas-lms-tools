@echo off
REM Canvas SMS Web - Docker Setup Script (Windows)
REM Run this after Docker Desktop is installed and running

echo.
echo 🚀 Canvas SMS Web - Docker Setup
echo ================================
echo.

echo 📦 Step 1: Starting Docker containers...
docker compose up -d

echo.
echo ⏳ Waiting for database to be ready...
timeout /t 10 /nobreak > nul

echo.
echo 📊 Step 2: Running database migrations...
call npm run prisma:migrate -- --name initial

echo.
echo ✅ Setup complete!
echo.
echo 🎯 Next steps:
echo 1. Update Twilio credentials in .env file
echo 2. Run 'npm run dev' to start API server
echo 3. Run 'npm run worker' in another terminal
echo.
echo 📝 Check running containers:
docker compose ps
echo.
pause
