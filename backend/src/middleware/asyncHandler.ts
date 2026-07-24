import type { NextFunction, Request, Response } from 'express';

type AsyncRoute = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/**
 * Membungkus handler async agar error yang dilempar diteruskan ke error
 * middleware (Express 4 tidak menangkap rejected promise secara otomatis).
 */
export function asyncHandler(fn: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
