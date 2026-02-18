import twilio from 'twilio';
import { prisma } from '../config/database';
import { encryptionService } from './encryption.service';
import { env } from '../config/env';
import logger from '../utils/logger';

/**
 * TwilioService - Handles SMS sending via Twilio API
 * Ports logic from bash script (lines 124-135)
 */
export class TwilioService {
  private twilioClient: twilio.Twilio | null = null;
  private fromPhoneNumber: string | null = null;

  /**
   * Initializes Twilio client with credentials from database or environment
   */
  private async initializeTwilioClient(): Promise<void> {
    if (this.twilioClient) {
      return; // Already initialized
    }

    try {
      // Try to get encrypted credentials from database first
      const config = await prisma.twilioConfig.findFirst({
        where: { isActive: true },
      });

      if (config) {
        // Decrypt credentials from database
        const accountSid = encryptionService.decrypt(
          config.accountSidEncrypted,
          config.encryptionIv,
          config.authTag
        );
        const authToken = encryptionService.decrypt(
          config.authTokenEncrypted,
          config.encryptionIv,
          config.authTag
        );

        this.twilioClient = twilio(accountSid, authToken);
        this.fromPhoneNumber = config.phoneNumber;
        logger.info('Twilio client initialized from database');
      } else if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
        // Fall back to environment variables (for initial setup)
        this.twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
        this.fromPhoneNumber = env.TWILIO_PHONE_NUMBER || null;
        logger.warn('Twilio client initialized from environment variables');
      } else {
        throw new Error('Twilio credentials not found in database or environment');
      }
    } catch (error) {
      logger.error('Failed to initialize Twilio client:', error);
      throw error;
    }
  }

  /**
   * Sends an SMS message via Twilio
   * Replicates bash script lines 124-135
   * @param toPhoneNumber - Recipient phone number (E.164 format)
   * @param messageBody - The message content
   * @returns Twilio message SID if successful
   */
  async sendSms(toPhoneNumber: string, messageBody: string): Promise<string> {
    try {
      // Ensure Twilio client is initialized
      await this.initializeTwilioClient();

      if (!this.twilioClient || !this.fromPhoneNumber) {
        throw new Error('Twilio client not properly initialized');
      }

      // Validate phone number format
      if (!this.validatePhoneNumber(toPhoneNumber)) {
        throw new Error('Invalid phone number format (must be E.164: +1234567890)');
      }

      logger.debug(`Sending SMS to ${toPhoneNumber}`);

      // Send SMS via Twilio (bash script lines 124-128)
      const message = await this.twilioClient.messages.create({
        body: messageBody,
        from: this.fromPhoneNumber,
        to: toPhoneNumber,
      });

      // Check if message was sent successfully (bash script lines 131-135)
      if (message.sid) {
        logger.info(`SMS sent successfully to ${toPhoneNumber}, SID: ${message.sid}`);
        return message.sid;
      } else {
        logger.error('Failed to send SMS: No SID returned');
        throw new Error('Failed to send SMS');
      }
    } catch (error: any) {
      logger.error('Twilio SMS error:', error);
      throw new Error(`Failed to send SMS: ${error.message}`);
    }
  }

  /**
   * Sends SMS to multiple recipients
   * @param phoneNumbers - Array of recipient phone numbers
   * @param messageBody - The message content
   * @returns Array of message SIDs
   */
  async sendBulkSms(
    phoneNumbers: string[],
    messageBody: string
  ): Promise<Array<{ phone: string; sid: string | null; success: boolean }>> {
    const results = [];

    for (const phoneNumber of phoneNumbers) {
      try {
        const sid = await this.sendSms(phoneNumber, messageBody);
        results.push({ phone: phoneNumber, sid, success: true });
      } catch (error) {
        logger.error(`Failed to send SMS to ${phoneNumber}:`, error);
        results.push({ phone: phoneNumber, sid: null, success: false });
      }
    }

    return results;
  }

  /**
   * Validates phone number format (E.164)
   * @param phoneNumber - Phone number to validate
   * @returns True if valid E.164 format
   */
  private validatePhoneNumber(phoneNumber: string): boolean {
    // E.164 format: +[country code][number]
    // Example: +15551234567
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phoneNumber);
  }

  /**
   * Stores Twilio credentials in database (encrypted)
   * Used during initial setup
   * @param accountSid - Twilio Account SID
   * @param authToken - Twilio Auth Token
   * @param phoneNumber - Twilio phone number
   */
  async storeTwilioCredentials(
    accountSid: string,
    authToken: string,
    phoneNumber: string
  ): Promise<void> {
    try {
      // Encrypt credentials
      const { encrypted: sidEncrypted, iv, authTag } = encryptionService.encrypt(accountSid);
      const { encrypted: tokenEncrypted } = encryptionService.encrypt(authToken);

      // Deactivate existing configs
      await prisma.twilioConfig.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });

      // Store new config
      await prisma.twilioConfig.create({
        data: {
          accountSidEncrypted: sidEncrypted,
          authTokenEncrypted: tokenEncrypted,
          encryptionIv: iv,
          authTag: authTag,
          phoneNumber: phoneNumber,
          isActive: true,
        },
      });

      // Reset client to force re-initialization with new credentials
      this.twilioClient = null;
      this.fromPhoneNumber = null;

      logger.info('Twilio credentials stored successfully');
    } catch (error) {
      logger.error('Failed to store Twilio credentials:', error);
      throw error;
    }
  }

  /**
   * Tests Twilio connection by sending a test message
   * @param toPhoneNumber - Test recipient phone number
   * @returns True if test successful
   */
  async testConnection(toPhoneNumber: string): Promise<boolean> {
    try {
      const testMessage = 'Test message from Canvas SMS Web App';
      await this.sendSms(toPhoneNumber, testMessage);
      return true;
    } catch (error) {
      logger.error('Twilio connection test failed:', error);
      return false;
    }
  }

  /**
   * Gets Twilio account balance (requires additional permissions)
   * Useful for monitoring costs
   */
  async getBalance(): Promise<{ balance: string; currency: string } | null> {
    try {
      await this.initializeTwilioClient();
      if (!this.twilioClient) {
        return null;
      }

      const balance = await this.twilioClient.balance.fetch();
      return {
        balance: balance.balance,
        currency: balance.currency,
      };
    } catch (error) {
      logger.error('Failed to fetch Twilio balance:', error);
      return null;
    }
  }
}

// Export singleton instance
export const twilioService = new TwilioService();
