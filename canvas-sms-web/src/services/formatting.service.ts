import { prisma } from '../config/database';
import { ParsedTodoItem } from '../types/canvas.types';
import logger from '../utils/logger';

/**
 * FormattingService - Formats Canvas TODO items into SMS messages
 * Ports logic from bash script (lines 58-118)
 */
export class FormattingService {
  /**
   * Formats TODO items into an SMS message
   * Replicates bash script lines 58-118
   * @param childId - UUID of the child
   * @param todos - Array of parsed TODO items (already sorted)
   * @param currentDate - The date for the message header (optional, defaults to today)
   * @returns Formatted SMS message string
   */
  async formatMessage(
    childId: string,
    todos: ParsedTodoItem[],
    currentDate?: Date
  ): Promise<string> {
    try {
      // Get current date in YYYY-MM-DD format (bash script line 58)
      const date = currentDate || new Date();
      const formattedDate = this.formatDateYYYYMMDD(date);

      // Build message header
      let message = `Assignments for ${formattedDate}:\n\n`;

      // If no assignments, return early
      if (todos.length === 0) {
        message += 'No assignments due.\n';
        return message;
      }

      // Get course mappings from database
      const courseMap = await this.getCourseMap(childId);

      // Format each TODO item (bash script lines 63-117)
      for (const todo of todos) {
        const courseName = courseMap[todo.courseId] || `Course ${todo.courseId}`;

        // Bash script lines 111-117: Fixed format
        message += `Course: ${courseName}\n`;
        message += `Assignment: ${todo.assignmentName}\n`;
        message += `Type: ${todo.type}\n`;
        message += `Due: ${todo.dueDate}\n`;
        message += `\n`; // Empty line between assignments
      }

      logger.debug(`Formatted message with ${todos.length} assignments`);
      return message;
    } catch (error) {
      logger.error('Failed to format message:', error);
      throw error;
    }
  }

  /**
   * Retrieves course ID to course name mappings from database
   * Replaces hardcoded bash script course mappings (lines 87-108)
   * @param childId - UUID of the child
   * @returns Object mapping course IDs to course names
   */
  private async getCourseMap(childId: string): Promise<Record<string, string>> {
    const courses = await prisma.course.findMany({
      where: {
        childId: childId,
        isActive: true,
      },
    });

    // Convert to Record<courseId, courseName>
    const courseMap: Record<string, string> = {};
    for (const course of courses) {
      courseMap[course.canvasCourseId] = course.courseName;
    }

    return courseMap;
  }

  /**
   * Formats a Date object to YYYY-MM-DD string
   * @param date - Date object
   * @returns Formatted date string (e.g., "2026-02-18")
   */
  private formatDateYYYYMMDD(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Formats a message preview (truncated version for display)
   * @param message - Full message text
   * @param maxLength - Maximum length (default 160 characters)
   * @returns Truncated message with ellipsis if needed
   */
  formatPreview(message: string, maxLength: number = 160): string {
    if (message.length <= maxLength) {
      return message;
    }
    return message.substring(0, maxLength - 3) + '...';
  }

  /**
   * Counts the number of SMS segments required for a message
   * SMS segments are 160 characters (GSM-7) or 70 characters (Unicode)
   * @param message - The message text
   * @returns Number of SMS segments required
   */
  countSmsSegments(message: string): number {
    // Check if message contains Unicode characters
    const hasUnicode = /[^\x00-\x7F]/.test(message);
    const segmentLength = hasUnicode ? 70 : 160;

    if (message.length <= segmentLength) {
      return 1;
    }

    // Multi-part messages have lower segment limits
    const multiPartSegmentLength = hasUnicode ? 67 : 153;
    return Math.ceil(message.length / multiPartSegmentLength);
  }

  /**
   * Validates that a message meets SMS requirements
   * @param message - The message text
   * @param maxSegments - Maximum allowed SMS segments (default 5)
   * @returns Validation result with errors if any
   */
  validateMessage(message: string, maxSegments: number = 5): {
    valid: boolean;
    segments: number;
    errors: string[];
  } {
    const errors: string[] = [];
    const segments = this.countSmsSegments(message);

    if (message.trim().length === 0) {
      errors.push('Message cannot be empty');
    }

    if (segments > maxSegments) {
      errors.push(`Message exceeds maximum of ${maxSegments} SMS segments (currently ${segments})`);
    }

    return {
      valid: errors.length === 0,
      segments,
      errors,
    };
  }
}

// Export singleton instance
export const formattingService = new FormattingService();
