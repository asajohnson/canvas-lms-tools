# Canvas SMS Web App

Web application that enables parents to receive daily SMS notifications about their children's Canvas LMS assignments.

## Features

- 🔐 Secure parent authentication
- 👨‍👩‍👧 Multi-child support (parents can monitor multiple students)
- 📱 Daily SMS notifications at 3pm M-F (timezone-aware)
- 🎨 Web dashboard for managing children and viewing message history
- 🔒 AES-256-GCM encryption for Canvas API tokens
- ⏰ Reliable job scheduling with Bull + Redis

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- Redis 7+
- Twilio account (for SMS)
- Docker (optional, for containerized deployment)

## Quick Start

### 1. Install Dependencies

```bash
npm install
cd client && npm install && cd ..
```

### 2. Set Up Environment

```bash
cp .env.example .env
# Edit .env with your database credentials, Twilio keys, etc.
```

Generate encryption key:
```bash
openssl rand -hex 32
```

### 3. Set Up Database

```bash
# Start PostgreSQL and Redis (via Docker)
docker-compose up -d postgres redis

# Run Prisma migrations
npm run prisma:migrate

# Generate Prisma Client
npm run prisma:generate
```

### 4. Run Development Servers

```bash
# Terminal 1: API Server
npm run dev

# Terminal 2: Background Worker
npm run worker

# Terminal 3: React Frontend
cd client && npm run dev
```

Visit http://localhost:5173 to access the app.

## Architecture

```
React Frontend (Vite) ←→ Express API ←→ PostgreSQL
                              ↓
                         Bull Queue (Redis)
                              ↓
                      Background Worker
                              ↓
                    Canvas API + Twilio SMS
```

## Project Structure

```
canvas-sms-web/
├── src/                    # Backend source
│   ├── server.ts          # Express app entry
│   ├── worker.ts          # Bull job processor
│   ├── config/            # Database, Redis config
│   ├── routes/            # API routes
│   ├── services/          # Business logic
│   ├── middleware/        # Auth, validation
│   └── types/             # TypeScript types
├── client/                # React frontend
├── prisma/                # Database schema & migrations
├── tests/                 # Unit & integration tests
├── docker-compose.yml     # Local dev environment
└── Dockerfile             # Production build
```

## Canvas API Token Setup

Parents need to obtain their child's Canvas API token:

1. Log into the child's Canvas account
2. Navigate to: **Account** → **Settings** → **Approved Integrations**
3. Click **"+ New Access Token"**
4. Copy the generated token
5. Paste it into the web app when adding a child

## Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- encryption.service

# Watch mode
npm run test:watch
```

## Deployment

See [deployment guide](docs/deployment.md) for production deployment to AWS/GCP.

## License

MIT

## Support

For issues or questions, please open a GitHub issue.
