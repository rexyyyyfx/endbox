import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import requestsRouter from "./requests.js";
import conversationsRouter from "./conversations.js";
import messagesRouter from "./messages.js";
import uploadsRouter from "./uploads.js";
import profileRouter from "./profile.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(requestsRouter);
router.use(conversationsRouter);
router.use(messagesRouter);
router.use(uploadsRouter);
router.use(profileRouter);

export default router;
