import Bull from 'bull';
import { env } from '../config/env';
import { prisma } from '../config/database';
import logger from '../utils/logger';

/**
 * SchedulerService - Manages Bull job queue for scheduled SMS sending
 * Implements timezone-aware scheduling for 3pm M-F delivery
 */
export class SchedulerService {
  public dailySmsQueue: Bull.Queue;

  constructor() {
    // Create Bull queue for daily SMS jobs
    this.dailySmsQueue = new Bull('daily-sms', {
      redis: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD || undefined,
      },
      defaultJobOptions: {
        attempts: 3, // Retry up to 3 times
        backoff: {
          type: 'exponential',
          delay: 60000, // Start with 1 minute delay
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 200, // Keep last 200 failed jobs
      },
    });

    logger.info('SchedulerService initialized');
  }

  /**
   * Schedules daily SMS jobs for all active parent-child pairs
   * Called on app startup and when relationships change
   */
  async scheduleAllDailySms(): Promise<void> {
    try {
      logger.info('Scheduling daily SMS jobs for all parent-child pairs...');

      // Get all active parent-child relationships
      const relationships = await prisma.parentChild.findMany({
        where: { isActive: true },
        include: {
          parent: {
            include: { preferences: true },
          },
          child: true,
        },
      });

      let scheduledCount = 0;

      for (const rel of relationships) {
        try {
          await this.scheduleDailySmsForPair(rel.parentId, rel.childId);
          scheduledCount++;
        } catch (error) {
          logger.error(`Failed to schedule for ${rel.parentId}-${rel.childId}:`, error);
        }
      }

      logger.info(`✅ Scheduled ${scheduledCount} daily SMS jobs`);
    } catch (error) {
      logger.error('Failed to schedule daily SMS jobs:', error);
      throw error;
    }
  }

  /**
   * Schedules a daily SMS job for a specific parent-child pair
   * @param parentId - Parent UUID
   * @param childId - Child UUID
   */
  async scheduleDailySmsForPair(parentId: string, childId: string): Promise<void> {
    try {
      // Get parent preferences
      const parent = await prisma.parent.findUnique({
        where: { id: parentId },
        include: { preferences: true },
      });

      if (!parent || !parent.preferences) {
        throw new Error('Parent or preferences not found');
      }

      const prefs = parent.preferences;

      // Build cron expression (3pm M-F by default)
      const cronExpression = this.buildCronExpression(
        prefs.sendTime,
        prefs.sendDays,
        parent.timezone
      );

      // Job ID ensures we don't duplicate jobs
      const jobId = `sms-${parentId}-${childId}`;

      // Remove existing job if it exists
      const existingJob = await this.dailySmsQueue.getJob(jobId);
      if (existingJob) {
        await existingJob.remove();
      }

      // Add repeatable job
      await this.dailySmsQueue.add(
        'send-sms',
        {
          parentId,
          childId,
        },
        {
          repeat: {
            cron: cronExpression,
            tz: parent.timezone, // Timezone-aware scheduling
          },
          jobId,
        }
      );

      logger.info(`Scheduled SMS job: ${jobId} with cron: ${cronExpression}`);
    } catch (error) {
      logger.error(`Failed to schedule SMS for ${parentId}-${childId}:`, error);
      throw error;
    }
  }

  /**
   * Cancels scheduled SMS for a parent-child pair
   * @param parentId - Parent UUID
   * @param childId - Child UUID
   */
  async cancelDailySmsForPair(parentId: string, childId: string): Promise<void> {
    try {
      const jobId = `sms-${parentId}-${childId}`;
      const job = await this.dailySmsQueue.getJob(jobId);

      if (job) {
        await job.remove();
        logger.info(`Cancelled SMS job: ${jobId}`);
      }
    } catch (error) {
      logger.error(`Failed to cancel SMS job for ${parentId}-${childId}:`, error);
      throw error;
    }
  }

  /**
   * Builds a cron expression from preferences
   * @param sendTime - Time in HH:mm:ss format (e.g., "15:00:00")
   * @param sendDays - Comma-separated days (e.g., "Mon,Tue,Wed,Thu,Fri")
   * @param timezone - IANA timezone (e.g., "America/Los_Angeles")
   * @returns Cron expression (e.g., "0 15 * * 1-5")
   */
  private buildCronExpression(sendTime: string, sendDays: string, timezone: string): string {
    // Parse time
    const [hours, minutes] = sendTime.split(':');

    // Parse days
    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    const days = sendDays.split(',').map((d) => dayMap[d.trim()]);
    const dayRange = days.length === 5 && days.every((d, i) => d === i + 1)
      ? '1-5' // Mon-Fri shorthand
      : days.join(',');

    // Build cron: "minute hour day-of-month month day-of-week"
    return `${minutes} ${hours} * * ${dayRange}`;
  }

  /**
   * Manually triggers a SMS job for testing
   * @param parentId - Parent UUID
   * @param childId - Child UUID
   */
  async triggerManualSms(parentId: string, childId: string): Promise<void> {
    await this.dailySmsQueue.add(
      'send-sms',
      { parentId, childId },
      { priority: 1 } // High priority for manual triggers
    );
    logger.info(`Manual SMS triggered for ${parentId}-${childId}`);
  }

  /**
   * Gets statistics about the job queue
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.dailySmsQueue.getWaitingCount(),
      this.dailySmsQueue.getActiveCount(),
      this.dailySmsQueue.getCompletedCount(),
      this.dailySmsQueue.getFailedCount(),
      this.dailySmsQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Cleans up old completed and failed jobs
   */
  async cleanupOldJobs(): Promise<void> {
    await this.dailySmsQueue.clean(7 * 24 * 60 * 60 * 1000, 'completed'); // 7 days
    await this.dailySmsQueue.clean(30 * 24 * 60 * 60 * 1000, 'failed'); // 30 days
    logger.info('Old jobs cleaned up');
  }
}

// Export singleton instance
export const schedulerService = new SchedulerService();
