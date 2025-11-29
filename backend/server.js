import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import uploadRoutes from "./routes/uploadRoutes.js";
import knowledgeRoutes from "./routes/knowledgeRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import agentRoutes from "./routes/agentRoutes.js";
import processingRoutes from "./routes/processingRoutes.js";
import orgRoutes from "./routes/orgRoutes.js";
import mongoose from "mongoose";

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI,{
    tls: true,

})

  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// Log mode
const USE_MOCK_MODE = process.env.USE_MOCK_MODE === 'true';
console.log(`🚀 Running in ${USE_MOCK_MODE ? 'MOCK' : 'PRODUCTION'} mode`);

// Routes
app.use("/api/upload-doc", uploadRoutes);
app.use("/api/knowledge", knowledgeRoutes);
app.use("/api", knowledgeRoutes); // Also mount /api/skills directly
app.use("/api/auth", authRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/org", orgRoutes);
app.use("/api/processing", processingRoutes);

mongoose.connect(process.env.MONGO_URI, {
  tls: true,
  tlsAllowInvalidCertificates: true,
  serverSelectionTimeoutMS: 10000,
})
  .then(() => {
    console.log("MongoDB Connected");
    app.listen(5000, () => console.log("Server running on port 5000"));
  })
  .catch(err => {
    console.error("MongoDB Connection Error:", err);
    process.exit(1);
  });
