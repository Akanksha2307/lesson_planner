import { Router } from "express";
import calendarController from "../controllers/calendar.controller";
import { registerRoute } from "./registerRoute";

const router = Router();

registerRoute(router, "getCalendar", calendarController.get);

export default router;
