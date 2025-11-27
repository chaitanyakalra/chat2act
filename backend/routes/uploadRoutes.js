import express from "express";
import multer from "multer";
import { uploadDoc } from "../controllers/uploadController.js";

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post("/", upload.single("file"), uploadDoc);

export default router;
