#!/bin/bash
# Canvas SMS Web - Docker Setup Script
# Run this after Docker Desktop is installed and running

set -e  # Exit on error

echo "🚀 Canvas SMS Web - Docker Setup"
echo "================================"
echo ""

# Add Node.js to PATH
export PATH="/c/Program Files/nodejs:$PATH"

# Navigate to project directory
cd "$(dirname "$0")"

echo "📦 Step 1: Starting Docker containers..."
docker compose up -d

echo ""
echo "⏳ Waiting for database to be ready..."
sleep 10

echo ""
echo "📊 Step 2: Running database migrations..."
npm run prisma:migrate -- --name initial

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎯 Next steps:"
echo "1. Update Twilio credentials in .env file"
echo "2. Run 'npm run dev' to start API server"
echo "3. Run 'npm run worker' in another terminal"
echo ""
echo "📝 Check running containers:"
docker compose ps
