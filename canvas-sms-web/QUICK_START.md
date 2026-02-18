# Canvas SMS Web App - Quick Start

## 🚀 Get Running in 5 Minutes

### Step 1: Install Node.js
Download from https://nodejs.org/ → Install → Restart terminal

### Step 2: Install Dependencies
```bash
cd "C:\Development\canvas-lms-tools\canvas-sms-web"
npm install
```

### Step 3: Configure Environment
```bash
# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Copy and edit .env
cp .env.example .env
# Edit .env with:
# - The encryption key you just generated
# - Your Twilio credentials (Account SID, Auth Token, Phone Number)
```

### Step 4: Start Services
```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Run database migrations
npm run prisma:generate
npm run prisma:migrate
```

### Step 5: Run the App
```bash
# Terminal 1: API Server
npm run dev

# Terminal 2: Background Worker
npm run worker
```

---

## ✅ Quick Test

### 1. Register
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "phoneNumber": "+15555551234"
  }'
```

Save the `token` from the response!

### 2. Add Child
First, get a Canvas API token:
- Log into child's Canvas → Settings → Approved Integrations → "+ New Access Token"

Then:
```bash
curl -X POST http://localhost:3000/api/children \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "firstName": "Jane",
    "canvasDomain": "example.instructure.com",
    "canvasToken": "YOUR_CANVAS_TOKEN_HERE"
  }'
```

### 3. Preview Canvas Data
```bash
curl "http://localhost:3000/api/children/CHILD_ID/preview" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

You should see formatted assignments!

---

## 📋 Common Commands

```bash
# Start everything
docker-compose up -d && npm run dev

# View logs
tail -f logs/combined.log

# Database GUI
npm run prisma:studio

# Run tests
npm test

# Stop services
docker-compose down
```

---

## 🔧 Troubleshooting

**"npm: command not found"**
→ Install Node.js from https://nodejs.org/

**"Port 3000 already in use"**
→ Change `PORT=3001` in .env

**"Database connection failed"**
→ Run `docker-compose up -d`

**"Canvas token invalid"**
→ Generate new token in Canvas Settings

---

For detailed setup: See [SETUP.md](./SETUP.md)
For implementation details: See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
