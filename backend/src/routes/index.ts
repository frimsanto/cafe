import { Router } from 'express';
import { menuRouter } from './menu.routes';
import { tableRouter } from './table.routes';
import { cashierRouter } from './cashier.routes';
import { orderRouter } from './order.routes';
import { pembayaranRouter } from './pembayaran.routes';
import { cafePaymentRouter } from './cafePayment.routes';
import { receiptRouter } from './receipt.routes';
import { kitchenRouter } from './kitchen.routes';
import { pushRouter } from './push.routes';
import { dashboardRouter } from './dashboard.routes';
import { authRouter } from './auth.routes';
import { publikRouter } from './publik.routes';
import { uploadRouter } from './upload.routes';

/** Router utama API — semua endpoint domain dipasang di bawah `/api`. */
export const apiRouter = Router();

apiRouter.use(menuRouter);
apiRouter.use(tableRouter);
apiRouter.use(cashierRouter);
apiRouter.use(orderRouter);
apiRouter.use(pembayaranRouter);
apiRouter.use(cafePaymentRouter);
apiRouter.use(receiptRouter);
apiRouter.use(kitchenRouter);
apiRouter.use(pushRouter);
apiRouter.use(authRouter);
apiRouter.use(publikRouter);
apiRouter.use(dashboardRouter);
apiRouter.use(uploadRouter);
