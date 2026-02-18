import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { prisma } from './config/database';
import { connectRedis } from './config/redis';
import logger from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';

// Import routes
import authRoutes from './routes/auth.routes';
import childrenRoutes from './routes/children.routes';
import messagesRoutes from './routes/messages.routes';

/**
 * Express Application Server
 * Main API server for Canvas SMS Web App
 */
class Server {
  public app: express.Application;
  private port: number;

  constructor() {
    this.app = express();
    this.port = env.PORT;

    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  /**
   * Initialize Express middleware
   */
  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet());

    // CORS
    this.app.use(
      cors({
        origin: env.CLIENT_URL,
        credentials: true,
      })
    );

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Max 100 requests per window
      message: 'Too many requests, please try again later',
    });
    this.app.use('/api/', limiter);

    // Stricter rate limiting for auth routes
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5, // Max 5 login attempts
      skipSuccessfulRequests: true,
    });
    this.app.use('/api/auth/login', authLimiter);

    // Request logging
    this.app.use((req, _res, next) => {
      logger.debug(`${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Initialize API routes
   */
  private initializeRoutes(): void {
    // Health check
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: env.NODE_ENV,
      });
    });

    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/children', childrenRoutes);
    this.app.use('/api/messages', messagesRoutes);

    // 404 handler (must be after all routes)
    this.app.use(notFoundHandler);
  }

  /**
   * Initialize error handling
   */
  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  /**
   * Start the Express server
   */
  public async start(): Promise<void> {
    try {
      // Test database connection
      await prisma.$connect();
      logger.info('✅ Database connected');

      // Connect to Redis
      await connectRedis();

      // Start HTTP server
      this.app.listen(this.port, () => {
        logger.info(`🚀 Server running on port ${this.port}`);
        logger.info(`📊 Environment: ${env.NODE_ENV}`);
        logger.info(`🔗 Health check: http://localhost:${this.port}/health`);
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down server...');

    try {
      await prisma.$disconnect();
      logger.info('Database disconnected');

      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Create and start server
const server = new Server();

// Handle shutdown signals
process.on('SIGTERM', () => server.shutdown());
process.on('SIGINT', () => server.shutdown());

// Start server
server.start();

export default server;
