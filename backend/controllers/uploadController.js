import { createRequire } from "module";
const require = createRequire(import.meta.url);

const pdfParse = require("pdf-parse");
import ApiDoc from "../models/ApiDoc.js";

export const uploadDoc = async (req, res) => {
    try {
        const file = req.file;

        if (!file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        let rawText = "";

        // 🔥 Extract text based on file type
        const ext = file.originalname.split('.').pop().toLowerCase();

        if (file.mimetype === "application/pdf" || ext === 'pdf') {
            const data = await pdfParse(file.buffer);
            rawText = data.text;
        } else if (
            file.mimetype === "application/json" ||
            ext === 'json' ||
            ext === 'yaml' ||
            ext === 'yml' ||
            ext === 'graphql' ||
            ext === 'md' ||
            ext === 'markdown'
        ) {
            rawText = file.buffer.toString("utf8");
        } else {
            return res.status(400).json({ message: "Unsupported file format" });
        }

        // 🔥 Save to MongoDB
        const doc = await ApiDoc.create({
            rawText,
            uploadedAt: new Date()
        });

        return res.json({
            message: "File uploaded successfully",
            docId: doc._id,
            status: "processing"
        });

    } catch (error) {
        console.error("Upload error:", error);
        return res.status(500).json({ message: "Upload error", error: error.message });
    }
};
