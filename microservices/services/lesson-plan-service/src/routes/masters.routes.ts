import { Router } from "express";
import mastersController from "../controllers/masters.controller";
import { registerRoute } from "./registerRoute";

const router = Router();

registerRoute(router, "getMasters", mastersController.getMasters);
registerRoute(router, "saveSettings", mastersController.saveSettings);
registerRoute(router, "saveTemplate", mastersController.saveTemplate);

export default router;
