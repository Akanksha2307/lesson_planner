import { Request, Response } from "express";
import { suggestLesson } from "../services/plans.engine";
import { ok } from "../utils/response";
import { validatedBody } from "../utils/validated";
import { SuggestBody } from "../validations/ai.validation";

class AiController {
  async suggest(req: Request, res: Response): Promise<void> {
    const { topicTitle, minutes } = validatedBody<SuggestBody>(req);

    const suggestion = suggestLesson(topicTitle, minutes);

    ok(res, suggestion, "OK");
  }
}

export default new AiController();
