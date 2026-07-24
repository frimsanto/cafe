import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { authService } from '../services/auth.service';
import { parseLoginInput, parseRegisterInput } from '../validation/auth.validation';

export const authRouter = Router();

// POST /api/auth/register — daftarkan kafe baru + akun pemilik (publik).
authRouter.post(
  '/auth/register',
  asyncHandler(async (req, res) => {
    const input = parseRegisterInput(req.body);
    const session = await authService.register(input);
    res.status(201).json({ data: session });
  }),
);

// POST /api/auth/login — masuk & terima JWT (publik).
authRouter.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const input = parseLoginInput(req.body);
    const session = await authService.login(input);
    res.json({ data: session });
  }),
);
