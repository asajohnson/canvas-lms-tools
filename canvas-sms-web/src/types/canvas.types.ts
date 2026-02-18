/**
 * Canvas LMS API Type Definitions
 * Based on Canvas REST API documentation and bash script analysis
 */

// Canvas TODO item (from /api/v1/users/self/todo)
export interface CanvasTodoItem {
  type: 'grading' | 'submitting';
  assignment: {
    id: number;
    name: string;
    due_at: string | null; // ISO 8601 format
    course_id: number;
    points_possible?: number;
    html_url?: string;
  };
  course_id: number;
  context_type: string;
}

// Parsed TODO item (after processing)
export interface ParsedTodoItem {
  type: string;
  assignmentName: string;
  dueAt: string; // ISO 8601 format
  dueDate: string; // YYYY-MM-DD format
  courseId: string;
  courseName?: string;
}

// Canvas Course (from /api/v1/courses)
export interface CanvasCourse {
  id: number;
  name: string;
  course_code?: string;
  enrollment_state?: string;
  workflow_state?: string;
}

// Canvas User (from /api/v1/users/self)
export interface CanvasUser {
  id: number;
  name: string;
  short_name?: string;
  sortable_name?: string;
  avatar_url?: string;
  primary_email?: string;
}

// Canvas API Error
export interface CanvasApiError {
  errors: Array<{
    message: string;
  }>;
  error_report_id?: number;
}
