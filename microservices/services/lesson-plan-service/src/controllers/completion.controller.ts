import { Request, Response } from "express";
import { completeItem } from "../services/completion.service";
import { ok } from "../utils/response";
import { validatedBody, validatedParams } from "../utils/validated";
import { CompleteItemBody } from "../validations/completion.validation";
import { IdParams } from "../validations/common.validation";

class CompletionController {
  async complete(req: Request, res: Response): Promise<void> {
    const result = await completeItem(
      req.ctx!,
      req.user!,
      validatedParams<IdParams>(req).id,
      validatedBody<CompleteItemBody>(req)
    );

    ok(
      res,
      result,
      (result as any).isEdit
        ? "Marking updated"
        : "Lesson marked"
    );
  }
}

export default new CompletionController();
