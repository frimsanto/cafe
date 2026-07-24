import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { attachUser, requireAuth, requireRole, requireSameCafe } from '../middleware/auth';
import { tenantScope } from '../middleware/tenant';
import { ApiError } from '../lib/ApiError';
import { REVENUE_PERIODS, type RevenuePeriod } from '../lib/period';
import { dashboardService } from '../services/dashboard.service';
import { parsePreferencesInput } from '../validation/dashboard.validation';

export const dashboardRouter = Router();

/** Baca & validasi query `period` (default: today). */
function parsePeriod(value: unknown): RevenuePeriod {
  if (value === undefined) return 'today';
  if (typeof value !== 'string' || !REVENUE_PERIODS.includes(value as RevenuePeriod)) {
    throw ApiError.badRequest(
      `Parameter "period" harus salah satu dari: ${REVENUE_PERIODS.join(', ')}`,
    );
  }
  return value as RevenuePeriod;
}

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

/** Baca & validasi query `limit` (default 5, maksimal 20). */
function parseLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    throw ApiError.badRequest(`Parameter "limit" harus bilangan bulat 1–${MAX_LIMIT}`);
  }
  return parsed;
}

// GET /api/cafes/:cafeId/dashboard/revenue?period=today|week|month
// Terlindungi: wajib token, hanya OWNER, dan hanya untuk kafenya sendiri.
dashboardRouter.get(
  '/cafes/:cafeId/dashboard/revenue',
  requireAuth,
  requireRole('OWNER'),
  requireSameCafe,
  attachUser,
  tenantScope,
  asyncHandler(async (req, res) => {
    const period = parsePeriod(req.query.period);
    const data = await dashboardService.getRevenueSummary(req.params.cafeId, period);
    res.json({ data });
  }),
);

// GET /api/cafes/:cafeId/dashboard/top-menu?period=…&limit=…
// Terlindungi: wajib token, hanya OWNER, dan hanya untuk kafenya sendiri.
dashboardRouter.get(
  '/cafes/:cafeId/dashboard/top-menu',
  requireAuth,
  requireRole('OWNER'),
  requireSameCafe,
  attachUser,
  tenantScope,
  asyncHandler(async (req, res) => {
    const period = parsePeriod(req.query.period);
    const limit = parseLimit(req.query.limit);
    const data = await dashboardService.getTopMenu(req.params.cafeId, period, limit);
    res.json({ data });
  }),
);

// GET /api/cafes/:cafeId/dashboard/preferences — preferensi milik pengguna token.
dashboardRouter.get(
  '/cafes/:cafeId/dashboard/preferences',
  requireAuth,
  requireSameCafe,
  attachUser,
  tenantScope,
  asyncHandler(async (req, res) => {
    const widgets = await dashboardService.getPreferences(
      req.params.cafeId,
      req.auth!.userId,
    );
    res.json({ data: { widgets } });
  }),
);

// PUT /api/cafes/:cafeId/dashboard/preferences — simpan preferensi pengguna.
dashboardRouter.put(
  '/cafes/:cafeId/dashboard/preferences',
  requireAuth,
  requireSameCafe,
  attachUser,
  tenantScope,
  asyncHandler(async (req, res) => {
    const widgets = parsePreferencesInput(req.body);
    const saved = await dashboardService.savePreferences(
      req.params.cafeId,
      req.auth!.userId,
      widgets,
    );
    res.json({ data: { widgets: saved } });
  }),
);
