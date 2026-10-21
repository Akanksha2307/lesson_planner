import { Router } from "express";
import aiController from "../controllers/ai.controller";
import { registerRoute } from "./registerRoute";

const router = Router();

registerRoute(router, "aiSuggest", aiController.suggest);

export default router;
