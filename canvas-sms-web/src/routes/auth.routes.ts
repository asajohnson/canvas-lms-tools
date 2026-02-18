import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { encryptionService } from '../services/encryption.service';
import { generateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import logger from '../utils/logger';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().max(100).optional(),
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number (use E.164 format: +1234567890)').optional(),
  timezone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

/**
 * POST /auth/register
 * Register a new parent account
 */
router.post('/register', validate(registerSchema), async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, phoneNumber, timezone } = req.body;

    // Check if user already exists
    const existingParent = await prisma.parent.findUnique({
      where: { email },
    });

    if (existingParent) {
      res.status(400).json({ error: 'Email already registered' });
      return;
    }

    // Hash password
    const passwordHash = await encryptionService.hashPassword(password);

    // Create parent account
    const parent = await prisma.parent.create({
      data: {
        email,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        phoneNumber: phoneNumber || null,
        timezone: timezone || 'America/Los_Angeles',
      },
    });

    // Create default preferences
    await prisma.preference.create({
      data: {
        parentId: parent.id,
      },
    });

    // Generate JWT token
    const token = generateToken(parent.id, parent.email);

    logger.info(`New parent registered: ${parent.email}`);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: parent.id,
          email: parent.email,
          firstName: parent.firstName,
          lastName: parent.lastName,
        },
        token,
      },
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /auth/login
 * Login with email and password
 */
router.post('/login', validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Find parent by email
    const parent = await prisma.parent.findUnique({
      where: { email },
    });

    if (!parent) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Verify password
    const isValidPassword = await encryptionService.verifyPassword(
      password,
      parent.passwordHash
    );

    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Generate JWT token
    const token = generateToken(parent.id, parent.email);

    logger.info(`Parent logged in: ${parent.email}`);

    res.json({
      success: true,
      data: {
        user: {
          id: parent.id,
          email: parent.email,
          firstName: parent.firstName,
          lastName: parent.lastName,
        },
        token,
      },
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;
