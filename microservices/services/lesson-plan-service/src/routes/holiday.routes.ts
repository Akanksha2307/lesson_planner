import { Router } from "express";
import holidayController from "../controllers/holiday.controller";
import { registerRoute } from "./registerRoute";

const router = Router();

registerRoute(router, "getHolidayImpact", holidayController.impact);
registerRoute(router, "listHolidays", holidayController.list);
registerRoute(router, "createHoliday", holidayController.create);
registerRoute(router, "updateHoliday", holidayController.update);
registerRoute(router, "deleteHoliday", holidayController.remove);

export default router;
