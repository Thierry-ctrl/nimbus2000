import { Router, type IRouter } from "express";
import healthRouter from "./health";
import catalogRouter from "./catalog";
import invitesRouter from "./invites";
import profileRouter from "./profile";
import tripsRouter from "./trips";
import requestsRouter from "./requests";
import ratingsRouter from "./ratings";
import dashboardRouter from "./dashboard";
import adminRouter from "./admin";
import notificationsRouter from "./notifications";
import reportsRouter from "./reports";
import paymentsRouter from "./payments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(catalogRouter);
router.use(invitesRouter);
router.use(profileRouter);
router.use(tripsRouter);
router.use(requestsRouter);
router.use(ratingsRouter);
router.use(dashboardRouter);
router.use(notificationsRouter);
router.use(reportsRouter);
router.use(paymentsRouter);
router.use(adminRouter);

export default router;
