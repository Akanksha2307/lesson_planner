import { Request, Response } from "express";
import * as mastersService from "../services/masters.service";
import { ok } from "../utils/response";
import { validatedBody, validatedParams } from "../utils/validated";
import { SettingsBody, TemplateBody } from "../validations/masters.validation";
import { IdParams } from "../validations/common.validation";

class MastersController {
  // GET /masters – classes, staff, timetable, holidays, … (same as the mock)
  async getMasters(req: Request, res: Response): Promise<void> {
    ok(res, await mastersService.getMasters(req.ctx!));
  }

  // PUT /settings – admin, principal
  async saveSettings(req: Request, res: Response): Promise<void> {
    const changes = validatedBody<SettingsBody>(req);
    ok(res, await mastersService.saveSettings(req.ctx!, changes), "Settings saved");
  }

  // PUT /templates/:id – admin, principal
  async saveTemplate(req: Request, res: Response): Promise<void> {
    const body = validatedBody<TemplateBody>(req);
    ok(res, await mastersService.saveTemplate(req.ctx!, validatedParams<IdParams>(req).id, body), "Template saved");
  }
}

export default new MastersController();
