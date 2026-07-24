import { Router } from 'express';
import { menuRouter } from './menu.routes';
import { tableRouter } from './table.routes';
import { cashierRouter } from './cashier.routes';
import { orderRouter } from './order.routes';
import { paymentRouter } from './payment.routes';
import { receiptRouter } from './receipt.routes';
import { kitchenRouter } from './kitchen.routes';
import { pushRouter } from './push.routes';
import { dashboardRouter } from './dashboard.routes';
import { authRouter } from './auth.routes';

/** Router utama API — semua endpoint domain dipasang di bawah `/api`. */
export const apiRouter = Router();

apiRouter.use(menuRouter);
apiRouter.use(tableRouter);
apiRouter.use(cashierRouter);
apiRouter.use(orderRouter);
apiRouter.use(paymentRouter);
apiRouter.use(receiptRouter);
apiRouter.use(kitchenRouter);
apiRouter.use(pushRouter);
apiRouter.use(authRouter);
apiRouter.use(dashboardRouter);
