import { Request, Response } from "express";
import * as service from "../services/syllabus.service";
import { ok } from "../utils/response";
import { validatedBody, validatedParams, validatedQuery } from "../utils/validated";
import {
  AddTopicBody,
  GetSyllabusQuery,
  ImportSyllabusBody,
  SaveSyllabusBody
} from "../validations/syllabus.validation";
import { IdParams } from "../validations/common.validation";

class SyllabusController {
  async get(req: Request, res: Response): Promise<void> {
    const syl = await service.getSyllabus(req.ctx!, validatedQuery<GetSyllabusQuery>(req));
    ok(res, syl ? syl.toJSON() : null);
  }

  async save(req: Request, res: Response): Promise<void> {
    const syl = await service.saveSyllabus(req.ctx!, req.user!, validatedBody<SaveSyllabusBody>(req));
    ok(res, syl.toJSON(), "Syllabus saved");
  }

  async import(req: Request, res: Response): Promise<void> {
    const { syllabus, skippedRows } = await service.importSyllabus(
      req.ctx!, req.user!, validatedBody<ImportSyllabusBody>(req)
    );
    const note = skippedRows.length ? ` (${skippedRows.length} row(s) skipped – missing chapter or topic)` : "";
    ok(res, { ...syllabus.toJSON(), skippedRows }, `Syllabus imported${note}`);
  }

  async addTopic(req: Request, res: Response): Promise<void> {
    const { syllabus, topic } = await service.addTopic(
      req.ctx!, req.user!, validatedParams<IdParams>(req).id, validatedBody<AddTopicBody>(req)
    );
    ok(res, { syllabus: syllabus.toJSON(), topic }, "Topic added to the syllabus", 201);
  }
}

export default new SyllabusController();
