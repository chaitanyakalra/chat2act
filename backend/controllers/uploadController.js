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
        const { autoProcess, zohoOrgId, organizationName } = req.body; // Added zohoOrgId and organizationName

        if (!file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        // Validate required fields for multi-tenancy
        if (!zohoOrgId) {
            return res.status(400).json({
                message: "zohoOrgId is required for multi-tenancy support",
                hint: "Please provide the Zoho organization ID in the request body"
            });
        }

        let rawText = "";
        let mimeType = file.mimetype;

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
            return res.status(400).json({ message: "Unsupported file format. Supported: JSON, YAML, PDF" });
        }

        // Extract title from the API spec if possible
        let title = null;
        try {
            const parsed = JSON.parse(rawText);
            title = parsed.info?.title || null;
        } catch (e) {
            // If not JSON or parsing fails, title remains null
        }

        // 🔥 Save to MongoDB with namespace support
        const doc = await ApiDoc.create({
            zohoOrgId,
            organizationName: organizationName || null,
            namespace: zohoOrgId, // Use zohoOrgId as namespace
            rawText,
            title,
            processingStatus: "pending",
            uploadedAt: new Date()
        });

        const response = {
            message: "File uploaded successfully",
            docId: doc._id,
            zohoOrgId: doc.zohoOrgId,
            namespace: doc.namespace,
            status: "uploaded"
        };

        // Auto-process if requested
        if (autoProcess === "true" || autoProcess === true) {
            try {
                // Update status to processing
                doc.processingStatus = "processing";
                await doc.save();

                const result = await getPipeline().process(
                    doc._id,
                    rawText,
                    mimeType,
                    zohoOrgId,
                    organizationName
                );

                // Update status to completed
                doc.processingStatus = "completed";
                doc.processedAt = new Date();
                await doc.save();

                response.status = "processed";
                response.processingResult = result;
            } catch (processError) {
                console.error("Auto-processing error:", processError);

                // Update status to failed
                doc.processingStatus = "failed";
                doc.processingError = processError.message || String(processError);
                await doc.save();

                response.status = "uploaded_processing_failed";
                response.processingError = processError.message || String(processError);
            }
        }

        return res.json(response);

    } catch (error) {
        console.error("Upload error:", error);

        // Check if it's a duplicate zohoOrgId error
        if (error.code === 11000 && error.keyPattern?.zohoOrgId) {
            return res.status(400).json({
                message: "Organization already exists",
                error: `An API specification for zohoOrgId '${error.keyValue.zohoOrgId}' already exists. Each organization can only have one API spec.`
            });
        }

        return res.status(500).json({ message: "Upload error", error: error.message });
    }
};
