import { Request, Response } from "express";
import { listLibrary } from "../services/library.service";
import { ok } from "../utils/response";
import { validatedQuery } from "../utils/validated";
import { LibraryQuery } from "../validations/library.validation";

class LibraryController {
  async list(req: Request, res: Response): Promise<void> {
    const result = await listLibrary(req.ctx!, validatedQuery<LibraryQuery>(req));
    ok(res, result);
  }
}

export default new LibraryController();
