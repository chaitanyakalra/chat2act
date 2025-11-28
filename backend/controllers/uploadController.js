import { createRequire } from "module";
const require = createRequire(import.meta.url);

const pdfParse = require("pdf-parse");
import ApiDoc from "../models/ApiDoc.js";
import { ProcessingPipeline } from "../services/processingPipeline.js";

let pipeline = null;

function getPipeline() {
  if (!pipeline) {
    pipeline = new ProcessingPipeline();
  }
  return pipeline;
}

export const uploadDoc = async (req, res) => {
  try {
    const file = req.file;
    const { autoProcess } = req.body; // Optional: auto-process after upload

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    let rawText = "";
    let mimeType = file.mimetype;

    // 🔥 Extract text based on file type
    const ext = file.originalname.split(".").pop().toLowerCase();

    if (file.mimetype === "application/pdf" || ext === "pdf") {
      const data = await pdfParse(file.buffer);
      rawText = data.text;
    } else if (
      file.mimetype === "application/json" ||
      ext === "json" ||
      ext === "yaml" ||
      ext === "yml" ||
      ext === "graphql" ||
      ext === "md" ||
      ext === "markdown"
    ) {
      rawText = file.buffer.toString("utf8");
    } else {
      return res
        .status(400)
        .json({
          message: "Unsupported file format. Supported: JSON, YAML, PDF",
        });
    }

    // 🔥 Save to MongoDB
    const doc = await ApiDoc.create({
      rawText,
      uploadedAt: new Date(),
    });

    const response = {
      message: "File uploaded successfully",
      docId: doc._id,
      status: "uploaded",
    };

    // Auto-process if requested
    if (autoProcess === "true" || autoProcess === true) {
      try {
        const result = await getPipeline().process(doc._id, rawText, mimeType);
        response.status = "processed";
        response.processingResult = result;
      } catch (processError) {
        console.error("Auto-processing error:", processError);
        response.status = "uploaded_processing_failed";
        response.processingError = processError.message || String(processError);
      }
    }

    return res.json(response);
  } catch (error) {
    console.error("Upload error:", error);
    return res
      .status(500)
      .json({ message: "Upload error", error: error.message });
  }
};
