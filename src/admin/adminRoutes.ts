import { Router } from 'express';
import type { PayoutRepository, CustomerRepository } from '../repositories/interfaces.js';
import { requireAdminApiKey } from '../middleware/adminAuth.js';
import { adminRateLimiter } from '../middleware/rateLimiter.js';
import { z } from 'zod';

export function createAdminRouter(deps: {
  customers: CustomerRepository;
  payouts: PayoutRepository;
}): Router {
  const router = Router();
  router.use(adminRateLimiter);
  router.use(requireAdminApiKey);

  router.get('/health/detailed', async (_req, res, next) => {
    try {
      res.json({
        status: 'ok',
        storage: 'google_sheets_or_memory',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/customers/:customerId', async (req, res, next) => {
    try {
      const customer = await deps.customers.getById(String(req.params.customerId));
      if (!customer) {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }
      res.json({
        customerId: customer.customerId,
        customerName: customer.customerName,
        active: customer.active,
        payoutEnabled: customer.payoutEnabled,
        maximumPayout: customer.maximumPayout,
        // Do not expose full WhatsApp number in admin list responses unnecessarily;
        // include masked form only.
        whatsappNumberMasked: customer.whatsappNumber.slice(-4).padStart(customer.whatsappNumber.length, '*'),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/payouts/:requestCode', async (req, res, next) => {
    try {
      const request = await deps.payouts.getByCode(String(req.params.requestCode));
      if (!request) {
        res.status(404).json({ error: 'Payout request not found' });
        return;
      }
      res.json(request);
    } catch (error) {
      next(error);
    }
  });

  const statusSchema = z.object({
    status: z.enum(['Pending', 'Processing', 'Completed', 'Cancelled', 'Failed', 'Rejected']),
  });

  router.patch('/payouts/:requestCode/status', async (req, res, next) => {
    try {
      const body = statusSchema.parse(req.body);
      const updated = await deps.payouts.updateStatus(String(req.params.requestCode), body.status);
      if (!updated) {
        res.status(404).json({ error: 'Payout request not found' });
        return;
      }
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
