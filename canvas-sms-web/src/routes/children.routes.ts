import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { canvasService } from '../services/canvas.service';
import { formattingService } from '../services/formatting.service';
import { authenticateJwt } from '../middleware/auth';
import { validate } from '../middleware/validation';
import logger from '../utils/logger';

const router = Router();

// All routes require authentication
router.use(authenticateJwt as any);

// Validation schemas
const addChildSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/).optional(),
  canvasDomain: z.string().regex(/^[a-z0-9-]+\.instructure\.com$/, 'Invalid Canvas domain'),
  canvasToken: z.string().min(20).max(500),
});

/**
 * POST /children
 * Add a new child and validate Canvas token
 */
router.post('/', validate(addChildSchema), async (req: Request, res: Response) => {
  try {
    const parentId = (req as any).user!.userId;
    const { firstName, lastName, phoneNumber, canvasDomain, canvasToken } = req.body;

    // Validate Canvas token
    const canvasUser = await canvasService.validateToken(canvasDomain, canvasToken);

    // Create child record
    const child = await prisma.child.create({
      data: {
        firstName,
        lastName: lastName || null,
        phoneNumber: phoneNumber || null,
        canvasDomain,
        canvasUserId: canvasUser.id.toString(),
      },
    });

    // Store encrypted Canvas token
    await canvasService.storeToken(child.id, canvasToken);

    // Link parent to child
    await prisma.parentChild.create({
      data: {
        parentId,
        childId: child.id,
        isActive: true,
      },
    });

    // Sync courses from Canvas
    await canvasService.syncCourses(child.id);

    logger.info(`Child added: ${child.id} by parent ${parentId}`);

    res.status(201).json({
      success: true,
      data: {
        id: child.id,
        firstName: child.firstName,
        lastName: child.lastName,
        canvasDomain: child.canvasDomain,
      },
    });
  } catch (error: any) {
    logger.error('Add child error:', error);
    res.status(400).json({
      error: error.message || 'Failed to add child',
    });
  }
});

/**
 * GET /children
 * Get all children for authenticated parent
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const parentId = (req as any).user!.userId;

    const parentChildren = await prisma.parentChild.findMany({
      where: {
        parentId,
        isActive: true,
      },
      include: {
        child: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            canvasDomain: true,
            createdAt: true,
          },
        },
      },
    });

    const children = parentChildren.map((pc) => pc.child);

    res.json({
      success: true,
      data: children,
    });
  } catch (error) {
    logger.error('Get children error:', error);
    res.status(500).json({ error: 'Failed to retrieve children' });
  }
});

/**
 * GET /children/:childId/preview
 * Test Canvas connection and preview message for a child
 */
router.get('/:childId/preview', async (req: Request, res: Response) => {
  try {
    const parentId = (req as any).user!.userId;
    const { childId } = req.params;

    // Verify parent owns this child
    const relationship = await prisma.parentChild.findFirst({
      where: { parentId, childId, isActive: true },
    });

    if (!relationship) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Fetch Canvas TODO items
    const todos = await canvasService.fetchTodoItems(childId);

    // Format message
    const message = await formattingService.formatMessage(childId, todos);

    res.json({
      success: true,
      data: {
        assignmentCount: todos.length,
        message,
        assignments: todos,
      },
    });
  } catch (error: any) {
    logger.error('Preview error:', error);
    res.status(400).json({
      error: error.message || 'Failed to preview message',
    });
  }
});

/**
 * DELETE /children/:childId
 * Remove a child (deactivate relationship)
 */
router.delete('/:childId', async (req: Request, res: Response) => {
  try {
    const parentId = (req as any).user!.userId;
    const { childId } = req.params;

    // Deactivate relationship
    await prisma.parentChild.updateMany({
      where: { parentId, childId },
      data: { isActive: false },
    });

    logger.info(`Parent ${parentId} removed child ${childId}`);

    res.json({
      success: true,
      message: 'Child removed successfully',
    });
  } catch (error) {
    logger.error('Remove child error:', error);
    res.status(500).json({ error: 'Failed to remove child' });
  }
});

export default router;
