import { Request, Response } from "express";
import * as service from "../services/plans.service";
import { ok } from "../utils/response";
import { validatedBody, validatedParams, validatedQuery } from "../utils/validated";
import { ExtendBody, GenerateBody, ListPlansQuery, UpdateItemBody } from "../validations/plans.validation";
import { IdParams } from "../validations/common.validation";

class PlansController {
  async list(req: Request, res: Response): Promise<void> {
    ok(res, await service.listPlans(req.ctx!, req.user!, validatedQuery<ListPlansQuery>(req)));
  }

  async getOne(req: Request, res: Response): Promise<void> {
    ok(res, await service.getPlan(req.ctx!, req.user!, validatedParams<IdParams>(req).id));
  }

  async generate(req: Request, res: Response): Promise<void> {
    const result = await service.generatePlan(req.ctx!, req.user!, validatedBody<GenerateBody>(req));
    ok(res, result, "Plan created", 201);
  }
  async preview(req: Request, res: Response): Promise<void> {
    ok(res, await service.previewPlan(req.ctx!, req.user!, validatedBody<GenerateBody>(req)));
  }

  async remove(req: Request, res: Response): Promise<void> {
    await service.deletePlan(req.ctx!, req.user!, validatedParams<IdParams>(req).id);
    ok(res, true, "Plan deleted");
  }

  async extend(req: Request, res: Response): Promise<void> {
    const r = await service.extendPlan(
      req.ctx!, req.user!, validatedParams<IdParams>(req).id, validatedBody<ExtendBody>(req)
    );
    ok(res, r, `${r.added} lesson${r.added === 1 ? "" : "s"} added – plan now ends on ${r.endDate}`);
  }

  async updateItem(req: Request, res: Response): Promise<void> {
    ok(
      res,
      await service.updateItem(
        req.ctx!, req.user!, validatedParams<IdParams>(req).id, validatedBody<UpdateItemBody>(req)
      ),
      "Lesson saved"
    );
  }

  async submit(req: Request, res: Response): Promise<void> {
    const result = await service.submitPlan(req.ctx!, req.user!, validatedParams<IdParams>(req).id);
    ok(res, result, "Plan submitted for approval");
  }
}

export default new PlansController();
