import { Router } from "express";
import libraryController from "../controllers/library.controller";
import { registerRoute } from "./registerRoute";

const router = Router();

registerRoute(router, "listLibrary", libraryController.list);

export default router;
