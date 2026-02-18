import { Router, Request, Response } from 'express';
import { messageService } from '../services/message.service';
import { authenticateJwt } from '../middleware/auth';
import logger from '../utils/logger';

const router = Router();

// All routes require authentication
router.use(authenticateJwt as any);

/**
 * GET /messages
 * Get message history for authenticated parent
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const parentId = (req as any).user!.userId;
    const limit = parseInt(req.query.limit as string) || 50;

    const messages = await messageService.getParentMessages(parentId, limit);

    res.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    logger.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to retrieve messages' });
  }
});

/**
 * GET /messages/child/:childId
 * Get message history for a specific child
 */
router.get('/child/:childId', async (req: Request, res: Response) => {
  try {
    const parentId = (req as any).user!.userId;
    const { childId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    // Verify parent owns this child
    const { prisma } = await import('../config/database');
    const relationship = await prisma.parentChild.findFirst({
      where: { parentId, childId, isActive: true },
    });

    if (!relationship) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const messages = await messageService.getChildMessages(childId, limit);

    res.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    logger.error('Get child messages error:', error);
    res.status(500).json({ error: 'Failed to retrieve messages' });
  }
});

export default router;
