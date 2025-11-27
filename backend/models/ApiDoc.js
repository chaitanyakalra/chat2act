import mongoose from "mongoose";

const apiDocSchema = new mongoose.Schema({
    rawText: String,
    uploadedAt: Date
});

export default mongoose.model("ApiDoc", apiDocSchema);
