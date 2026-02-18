# Canvas SMS Web App - Complete Setup Guide

This guide will walk you through setting up the Canvas SMS web application from scratch.

## Prerequisites Installation

### 1. Install Node.js

**Windows:**
1. Download Node.js LTS (v18 or newer) from https://nodejs.org/
2. Run the installer and follow the prompts
3. Verify installation:
```bash
node --version  # Should show v18.x.x or higher
npm --version   # Should show 9.x.x or higher
```

### 2. Install Docker Desktop

**Windows:**
1. Download Docker Desktop from https://www.docker.com/products/docker-desktop
2. Run the installer
3. Restart your computer
4. Verify installation:
```bash
docker --version
docker-compose --version
```

### 3. Get Twilio Account (for SMS)

1. Sign up at https://www.twilio.com/try-twilio
2. Get a phone number from the Twilio console
3. Note down:
   - Account SID
   - Auth Token
   - Your Twilio phone number

---

## Project Setup

### Step 1: Install Dependencies

```bash
cd "C:\Development\canvas-lms-tools\canvas-sms-web"
npm install
```

This will install all required packages (Express, Prisma, Bull, Twilio, etc.)

### Step 2: Configure Environment Variables

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` file with your settings:

```bash
# Database
DATABASE_URL=postgresql://canvas_sms_user:canvas_sms_dev_password@localhost:5432/canvas_sms

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Security - Generate a secure encryption key:
# Run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_MASTER_KEY=your_64_character_hex_key_here

# JWT Secret - Generate a random string:
# Run: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
JWT_SECRET=your_jwt_secret_here

# Twilio (your credentials from Twilio console)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+15555555555

# App
NODE_ENV=development
PORT=3000
CLIENT_URL=http://localhost:5173

# Logging
LOG_LEVEL=debug
```

**To generate secure keys:**
```bash
# Generate ENCRYPTION_MASTER_KEY (64 hex characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Step 3: Start Database Services

Start PostgreSQL and Redis using Docker:

```bash
docker-compose up -d
```

Verify services are running:
```bash
docker-compose ps
```

You should see:
- `canvas-sms-postgres` - running on port 5432
- `canvas-sms-redis` - running on port 6379

### Step 4: Set Up Database

Run Prisma migrations to create database tables:

```bash
npm run prisma:generate  # Generate Prisma Client
npm run prisma:migrate   # Run database migrations
```

When prompted for migration name, enter: `initial`

Optional: Open Prisma Studio to view database:
```bash
npm run prisma:studio
```

---

## Running the Application

### Terminal 1: API Server

```bash
npm run dev
```

You should see:
```
✅ Database connected
✅ Redis connected
🚀 Server running on port 3000
📊 Environment: development
🔗 Health check: http://localhost:3000/health
```

Test the health endpoint:
```bash
curl http://localhost:3000/health
```

### Terminal 2: Background Worker

```bash
npm run worker
```

You should see:
```
🔧 Starting Canvas SMS Worker...
✅ Database connected
✅ Redis connected
✅ Worker started and processing jobs
```

### Terminal 3: React Frontend (optional for now)

The frontend hasn't been created yet, but you can test the API directly using curl or Postman.

---

## Testing the API

### 1. Register a Parent Account

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "parent@example.com",
    "password": "password123",
    "firstName": "John",
    "lastName": "Doe",
    "phoneNumber": "+15555551234",
    "timezone": "America/Los_Angeles"
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-here",
      "email": "parent@example.com",
      "firstName": "John",
      "lastName": "Doe"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Save the token!** You'll need it for all subsequent requests.

### 2. Add a Child

First, get a Canvas API token:
1. Log into your child's Canvas account
2. Go to: Account → Settings → Approved Integrations
3. Click "+ New Access Token"
4. Copy the generated token

Then add the child:
```bash
curl -X POST http://localhost:3000/api/children \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{
    "firstName": "Jane",
    "lastName": "Doe",
    "phoneNumber": "+15555555678",
    "canvasDomain": "example.instructure.com",
    "canvasToken": "your_canvas_api_token_here"
  }'
```

### 3. Preview Canvas Data

```bash
curl -X GET "http://localhost:3000/api/children/{childId}/preview" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

Response:
```json
{
  "success": true,
  "data": {
    "assignmentCount": 3,
    "message": "Assignments for 2026-02-18:\n\nCourse: English\nAssignment: Essay on Shakespeare\nType: assignment\nDue: 2026-02-25\n\n...",
    "assignments": [...]
  }
}
```

### 4. View Message History

```bash
curl -X GET http://localhost:3000/api/messages \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

---

## How Scheduled SMS Works

### Automatic Scheduling

When you add a child, the system automatically:
1. Validates the Canvas token
2. Syncs course data from Canvas
3. Creates a scheduled job to run at 3pm Monday-Friday

### Manual Testing

To test SMS without waiting until 3pm:

**Option 1: Use the /preview endpoint** (doesn't send SMS, just shows what would be sent)

**Option 2: Manually trigger a job** (requires adding an admin endpoint)

Add this to `src/routes/children.routes.ts`:
```typescript
router.post('/:childId/test-sms', async (req: AuthRequest, res: Response) => {
  const parentId = req.user!.userId;
  const { childId } = req.params;

  // Verify parent owns child
  const relationship = await prisma.parentChild.findFirst({
    where: { parentId, childId, isActive: true },
  });

  if (!relationship) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  // Manually trigger SMS
  await schedulerService.triggerManualSms(parentId, childId);

  res.json({ success: true, message: 'Test SMS triggered' });
});
```

Then call:
```bash
curl -X POST "http://localhost:3000/api/children/{childId}/test-sms" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

---

## Monitoring

### Check Queue Stats

Add this endpoint to monitor the job queue:

```typescript
// src/routes/admin.routes.ts
import { Router } from 'express';
import { schedulerService } from '../services/scheduler.service';
import { authenticateJwt } from '../middleware/auth';

const router = Router();
router.use(authenticateJwt);

router.get('/queue-stats', async (req, res) => {
  const stats = await schedulerService.getQueueStats();
  res.json({ success: true, data: stats });
});

export default router;
```

### View Logs

Logs are written to:
- `logs/error.log` - Errors only
- `logs/combined.log` - All logs

View logs in real-time:
```bash
# Windows PowerShell
Get-Content logs/combined.log -Wait -Tail 50

# Git Bash
tail -f logs/combined.log
```

### Prisma Studio

View and edit database records:
```bash
npm run prisma:studio
```

Opens at http://localhost:5555

---

## Troubleshooting

### Issue: "npm: command not found"

**Solution:** Node.js isn't installed or not in PATH
- Reinstall Node.js from https://nodejs.org/
- Restart your terminal after installation

### Issue: "Port 3000 already in use"

**Solution:** Another app is using port 3000
```bash
# Change PORT in .env to 3001
PORT=3001
```

### Issue: "Database connection failed"

**Solution:** PostgreSQL isn't running
```bash
# Start Docker containers
docker-compose up -d

# Check container status
docker-compose ps
```

### Issue: "Canvas API authentication failed"

**Solution:** Canvas token is invalid or expired
- Generate a new Canvas API token
- Update the child's token via the API (requires adding an update endpoint)

### Issue: "Twilio error: Invalid phone number"

**Solution:** Phone numbers must be in E.164 format
- Correct: `+15555551234` (country code + number)
- Incorrect: `555-555-1234`, `(555) 555-1234`

### Issue: "SMS not being sent at 3pm"

**Solution:** Check worker is running and jobs are scheduled
```bash
# Verify worker is running (Terminal 2)
# Should see: "✅ Worker started and processing jobs"

# Check queue stats (add admin endpoint above)
curl http://localhost:3000/api/admin/queue-stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Next Steps

### 1. Build React Frontend

The frontend needs to be created separately. Key components needed:
- Login/Register pages
- Dashboard with child list
- Add child form with Canvas token instructions
- Message history viewer
- Settings page (phone number, timezone, schedule)

### 2. Deploy to Production

See deployment guide for:
- AWS ECS deployment
- Google Cloud Run deployment
- Environment variable management
- SSL/TLS setup
- Domain configuration

### 3. Add Features

Potential enhancements:
- SMS reply handling (Twilio webhooks)
- Email notifications as backup
- Assignment filtering (only show assignments due within X days)
- Multi-language support
- Parent dashboard analytics

---

## Support

For issues or questions:
- Check logs in `logs/` directory
- Review Prisma Studio for database state
- Check Docker container logs: `docker-compose logs`
- View queue dashboard (if Bull Board is set up)

## Security Notes

- **Never commit `.env` file** to version control
- Generate unique encryption keys for each environment
- Use strong JWT secrets (32+ characters)
- Rotate Canvas API tokens regularly
- Enable 2FA on Twilio account
- Monitor Twilio usage to avoid unexpected charges

---

## Architecture Overview

```
Parent registers → Adds child → Provides Canvas token → Token encrypted → Stored in DB
                                                                           ↓
                                                           Scheduler creates repeatable job
                                                                           ↓
                                              Worker runs at 3pm M-F (per parent timezone)
                                                                           ↓
                                              Fetches Canvas TODO → Formats message → Sends SMS
                                                                           ↓
                                                           Logs to database (message history)
```

This preserves the exact behavior of the original bash script while adding multi-tenant support, web UI, and reliable scheduling.
