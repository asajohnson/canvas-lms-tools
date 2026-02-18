import { prisma } from '../config/database';
import logger from '../utils/logger';

export interface LogMessageParams {
  childId: string;
  parentId?: string;
  messageBody: string;
  recipientPhone: string;
  recipientType: 'parent' | 'child';
  twilioSid?: string;
  status: 'pending' | 'sent' | 'failed' | 'delivered';
  assignmentCount?: number;
}

/**
 * MessageService - Handles message history and logging
 */
export class MessageService {
  /**
   * Logs a sent message to the database
   * @param params - Message details
   * @returns Created message record
   */
  async logMessage(params: LogMessageParams) {
    try {
      const message = await prisma.message.create({
        data: {
          childId: params.childId,
          parentId: params.parentId || undefined,
          messageBody: params.messageBody,
          recipientPhone: params.recipientPhone,
          recipientType: params.recipientType,
          twilioSid: params.twilioSid,
          status: params.status,
          assignmentCount: params.assignmentCount || 0,
          sentAt: new Date(),
        },
      });

      logger.info(`Message logged: ${message.id} to ${params.recipientPhone}`);
      return message;
    } catch (error) {
      logger.error('Failed to log message:', error);
      throw error;
    }
  }

  /**
   * Gets message history for a parent
   * @param parentId - Parent UUID
   * @param limit - Maximum number of messages to return
   * @returns Array of messages
   */
  async getParentMessages(parentId: string, limit: number = 50) {
    return prisma.message.findMany({
      where: { parentId },
      orderBy: { sentAt: 'desc' },
      take: limit,
      include: {
        child: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  /**
   * Gets message history for a specific child
   * @param childId - Child UUID
   * @param limit - Maximum number of messages to return
   * @returns Array of messages
   */
  async getChildMessages(childId: string, limit: number = 50) {
    return prisma.message.findMany({
      where: { childId },
      orderBy: { sentAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Updates message status (e.g., when delivery status is received from Twilio)
   * @param twilioSid - Twilio message SID
   * @param status - New status
   */
  async updateMessageStatus(twilioSid: string, status: string) {
    return prisma.message.updateMany({
      where: { twilioSid },
      data: { status },
    });
  }
}

export const messageService = new MessageService();
