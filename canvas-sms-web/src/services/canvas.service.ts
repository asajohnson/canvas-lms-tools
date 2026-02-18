import axios, { AxiosError } from 'axios';
import { prisma } from '../config/database';
import { encryptionService } from './encryption.service';
import logger from '../utils/logger';
import {
  CanvasTodoItem,
  ParsedTodoItem,
  CanvasCourse,
  CanvasUser,
  CanvasApiError,
} from '../types/canvas.types';

/**
 * CanvasService - Integrates with Canvas LMS API
 * Ports logic from bash script (lines 24-42)
 */
export class CanvasService {
  /**
   * Fetches TODO items from Canvas for a specific child
   * Replicates bash script lines 24-42
   * @param childId - UUID of the child
   * @returns Array of parsed TODO items, sorted by due date
   */
  async fetchTodoItems(childId: string): Promise<ParsedTodoItem[]> {
    try {
      // Get child's Canvas configuration
      const child = await prisma.child.findUnique({
        where: { id: childId },
        include: { canvasToken: true },
      });

      if (!child) {
        throw new Error('Child not found');
      }

      if (!child.canvasToken) {
        throw new Error('Canvas token not found for child');
      }

      // Decrypt Canvas API token
      const token = encryptionService.decrypt(
        child.canvasToken.encryptedToken,
        child.canvasToken.encryptionIv,
        child.canvasToken.authTag
      );

      // Call Canvas API (bash script line 24)
      const apiUrl = `https://${child.canvasDomain}/api/v1/users/self/todo`;
      logger.debug(`Fetching Canvas TODO from: ${apiUrl}`);

      const response = await axios.get<CanvasTodoItem[]>(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 10000,
      });

      logger.info(`Fetched ${response.data.length} TODO items for child ${childId}`);

      // Parse and sort (bash script lines 32-42)
      const parsed = this.parseTodoItems(response.data);
      const sorted = this.sortByDueDate(parsed);

      return sorted;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<CanvasApiError>;
        if (axiosError.response?.status === 401) {
          logger.error('Canvas API authentication failed - token may be invalid');
          // Mark token as invalid in database
          await this.markTokenInvalid(childId);
          throw new Error('Canvas token is invalid or expired');
        }
        logger.error('Canvas API error:', axiosError.response?.data);
        throw new Error(`Canvas API error: ${axiosError.message}`);
      }
      logger.error('Failed to fetch Canvas TODO items:', error);
      throw error;
    }
  }

  /**
   * Parses raw Canvas TODO items into our internal format
   * Replicates bash script lines 32-33 (jq parsing)
   * @param items - Raw Canvas TODO items
   * @returns Parsed TODO items
   */
  private parseTodoItems(items: CanvasTodoItem[]): ParsedTodoItem[] {
    return items
      .filter((item) => item.assignment && item.assignment.due_at) // Only items with due dates
      .map((item) => ({
        type: item.type,
        assignmentName: item.assignment.name,
        dueAt: item.assignment.due_at || '',
        dueDate: this.formatDueDate(item.assignment.due_at || ''),
        courseId: item.assignment.course_id.toString(),
      }));
  }

  /**
   * Sorts TODO items by due date (chronological order)
   * Replicates bash script lines 40-42
   * @param items - Parsed TODO items
   * @returns Sorted items (earliest due date first)
   */
  private sortByDueDate(items: ParsedTodoItem[]): ParsedTodoItem[] {
    return items.sort((a, b) => {
      const dateA = new Date(a.dueAt);
      const dateB = new Date(b.dueAt);
      return dateA.getTime() - dateB.getTime();
    });
  }

  /**
   * Formats ISO 8601 due date to YYYY-MM-DD
   * Replicates bash script lines 45-51
   * @param isoDateString - ISO 8601 date (e.g., "2026-02-17T23:59:00Z")
   * @returns Formatted date (e.g., "2026-02-17")
   */
  private formatDueDate(isoDateString: string): string {
    if (!isoDateString) return '';
    // Extract date portion before 'T'
    return isoDateString.split('T')[0];
  }

  /**
   * Validates a Canvas token by making a test API call
   * @param canvasDomain - Canvas domain (e.g., "example.instructure.com")
   * @param token - Canvas API token
   * @returns Canvas user info if valid, throws error if invalid
   */
  async validateToken(canvasDomain: string, token: string): Promise<CanvasUser> {
    try {
      const apiUrl = `https://${canvasDomain}/api/v1/users/self`;
      const response = await axios.get<CanvasUser>(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 10000,
      });

      logger.info(`Canvas token validated for user: ${response.data.name}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response?.status === 401) {
          throw new Error('Invalid Canvas token');
        }
      }
      throw new Error('Failed to validate Canvas token');
    }
  }

  /**
   * Syncs course mappings from Canvas (replaces hardcoded bash script mappings)
   * Fetches active courses and stores course ID -> name mappings in database
   * @param childId - UUID of the child
   */
  async syncCourses(childId: string): Promise<void> {
    try {
      const child = await prisma.child.findUnique({
        where: { id: childId },
        include: { canvasToken: true },
      });

      if (!child || !child.canvasToken) {
        throw new Error('Child or Canvas token not found');
      }

      // Decrypt token
      const token = encryptionService.decrypt(
        child.canvasToken.encryptedToken,
        child.canvasToken.encryptionIv,
        child.canvasToken.authTag
      );

      // Fetch courses from Canvas
      const apiUrl = `https://${child.canvasDomain}/api/v1/courses`;
      const response = await axios.get<CanvasCourse[]>(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          enrollment_state: 'active',
          per_page: 100,
        },
        timeout: 10000,
      });

      logger.info(`Fetched ${response.data.length} courses for child ${childId}`);

      // Upsert courses into database
      for (const course of response.data) {
        await prisma.course.upsert({
          where: {
            childId_canvasCourseId: {
              childId: childId,
              canvasCourseId: course.id.toString(),
            },
          },
          create: {
            childId: childId,
            canvasCourseId: course.id.toString(),
            courseName: course.name,
            isActive: true,
          },
          update: {
            courseName: course.name,
            isActive: true,
          },
        });
      }

      logger.info(`Synced ${response.data.length} courses for child ${childId}`);
    } catch (error) {
      logger.error('Failed to sync courses:', error);
      throw error;
    }
  }

  /**
   * Marks a Canvas token as invalid in the database
   * @param childId - UUID of the child
   */
  private async markTokenInvalid(childId: string): Promise<void> {
    await prisma.canvasToken.update({
      where: { childId },
      data: { isValid: false },
    });
  }

  /**
   * Stores an encrypted Canvas token for a child
   * @param childId - UUID of the child
   * @param token - Plain text Canvas API token
   */
  async storeToken(childId: string, token: string): Promise<void> {
    const { encrypted, iv, authTag } = encryptionService.encrypt(token);

    await prisma.canvasToken.upsert({
      where: { childId },
      create: {
        childId,
        encryptedToken: encrypted,
        encryptionIv: iv,
        authTag: authTag,
        tokenCreatedAt: new Date(),
        lastVerifiedAt: new Date(),
        isValid: true,
      },
      update: {
        encryptedToken: encrypted,
        encryptionIv: iv,
        authTag: authTag,
        lastVerifiedAt: new Date(),
        isValid: true,
      },
    });

    logger.info(`Canvas token stored for child ${childId}`);
  }
}

// Export singleton instance
export const canvasService = new CanvasService();
