import { Job } from 'bull';
import { env } from './config/env';
import { prisma } from './config/database';
import { connectRedis } from './config/redis';
import { schedulerService } from './services/scheduler.service';
import { canvasService } from './services/canvas.service';
import { formattingService } from './services/formatting.service';
import { twilioService } from './services/twilio.service';
import { messageService } from './services/message.service';
import logger from './utils/logger';

/**
 * Background Worker - Processes scheduled SMS jobs
 * Combines Canvas fetch + formatting + SMS sending (ports complete bash script flow)
 */

interface SendSmsJobData {
  parentId: string;
  childId: string;
}

/**
 * Processes a single SMS job
 * Replicates the complete bash script workflow (lines 24-135)
 */
async function processSmsJob(job: Job<SendSmsJobData>): Promise<any> {
  const { parentId, childId } = job.data;

  logger.info(`Processing SMS job for parent ${parentId}, child ${childId}`);

  try {
    // 1. Fetch Canvas TODO items (bash script lines 24-42)
    logger.debug(`Fetching Canvas TODO items for child ${childId}`);
    const todos = await canvasService.fetchTodoItems(childId);

    logger.info(`Fetched ${todos.length} assignments for child ${childId}`);

    // 2. Format message (bash script lines 58-118)
    logger.debug('Formatting SMS message');
    const message = await formattingService.formatMessage(childId, todos, new Date());

    // Validate message
    const validation = formattingService.validateMessage(message);
    if (!validation.valid) {
      throw new Error(`Invalid message: ${validation.errors.join(', ')}`);
    }

    logger.info(`Message formatted (${validation.segments} SMS segments)`);

    // 3. Get parent and child details
    const [parent, child, preferences] = await Promise.all([
      prisma.parent.findUnique({ where: { id: parentId } }),
      prisma.child.findUnique({ where: { id: childId } }),
      prisma.preference.findUnique({ where: { parentId } }),
    ]);

    if (!parent || !child) {
      throw new Error('Parent or child not found');
    }

    // 4. Send SMS to parent (bash script lines 124-128)
    if (parent.phoneNumber) {
      logger.debug(`Sending SMS to parent: ${parent.phoneNumber}`);
      const parentSid = await twilioService.sendSms(parent.phoneNumber, message);

      // Log message
      await messageService.logMessage({
        childId,
        parentId,
        messageBody: message,
        recipientPhone: parent.phoneNumber,
        recipientType: 'parent',
        twilioSid: parentSid,
        status: 'sent',
        assignmentCount: todos.length,
      });

      logger.info(`SMS sent to parent ${parentId}`);
    } else {
      logger.warn(`Parent ${parentId} has no phone number, skipping SMS`);
    }

    // 5. Optionally send SMS to child (bash script lines 129-135)
    if (child.phoneNumber && preferences?.includeChildInSms) {
      logger.debug(`Sending SMS to child: ${child.phoneNumber}`);
      const childSid = await twilioService.sendSms(child.phoneNumber, message);

      // Log message
      await messageService.logMessage({
        childId,
        parentId,
        messageBody: message,
        recipientPhone: child.phoneNumber,
        recipientType: 'child',
        twilioSid: childSid,
        status: 'sent',
        assignmentCount: todos.length,
      });

      logger.info(`SMS sent to child ${childId}`);
    }

    return {
      success: true,
      assignmentCount: todos.length,
      messageLength: message.length,
      smsSegments: validation.segments,
    };
  } catch (error: any) {
    logger.error(`SMS job failed for ${parentId}-${childId}:`, error);

    // Log failed message
    try {
      const parent = await prisma.parent.findUnique({ where: { id: parentId } });
      if (parent?.phoneNumber) {
        await messageService.logMessage({
          childId,
          parentId,
          messageBody: '',
          recipientPhone: parent.phoneNumber,
          recipientType: 'parent',
          status: 'failed',
        });
      }
    } catch (logError) {
      logger.error('Failed to log error message:', logError);
    }

    throw error; // Re-throw to trigger Bull retry mechanism
  }
}

/**
 * Initialize and start the worker
 */
async function startWorker(): Promise<void> {
  try {
    logger.info('🔧 Starting Canvas SMS Worker...');

    // Connect to database
    await prisma.$connect();
    logger.info('✅ Database connected');

    // Connect to Redis
    await connectRedis();

    // Process jobs from the queue
    schedulerService.dailySmsQueue.process('send-sms', 5, processSmsJob); // Process up to 5 jobs concurrently

    // Handle completed jobs
    schedulerService.dailySmsQueue.on('completed', (job, result) => {
      logger.info(`Job ${job.id} completed:`, result);
    });

    // Handle failed jobs
    schedulerService.dailySmsQueue.on('failed', (job, error) => {
      logger.error(`Job ${job.id} failed:`, error);
    });

    // Handle stalled jobs
    schedulerService.dailySmsQueue.on('stalled', (job) => {
      logger.warn(`Job ${job.id} stalled`);
    });

    // Log queue stats every 5 minutes
    setInterval(async () => {
      const stats = await schedulerService.getQueueStats();
      logger.info('Queue stats:', stats);
    }, 5 * 60 * 1000);

    // Clean up old jobs daily
    setInterval(async () => {
      await schedulerService.cleanupOldJobs();
    }, 24 * 60 * 60 * 1000);

    logger.info('✅ Worker started and processing jobs');
  } catch (error) {
    logger.error('Failed to start worker:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(): Promise<void> {
  logger.info('Shutting down worker...');

  try {
    await schedulerService.dailySmsQueue.close();
    await prisma.$disconnect();
    logger.info('Worker shut down gracefully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the worker
startWorker();
