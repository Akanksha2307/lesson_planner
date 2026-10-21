import { Router } from "express";
import todayController from "../controllers/today.controller";
import { registerRoute } from "./registerRoute";

const router = Router();

registerRoute(router, "getToday", todayController.get);

export default router;
