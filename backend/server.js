import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";

// Import routes
import uploadRoutes from "./routes/uploadRoutes.js";
import knowledgeRoutes from "./routes/knowledgeRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import agentRoutes from "./routes/agentRoutes.js";
import processingRoutes from "./routes/processingRoutes.js";
import orgRoutes from "./routes/orgRoutes.js";
import chatbotRoutes from "./routes/chatbotRoutes.js";
import organizationRoutes from "./routes/organizationRoutes.js";

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

// Register routes
app.use("/api/upload-doc", uploadRoutes);
app.use("/api/knowledge", knowledgeRoutes);
app.use("/api", knowledgeRoutes); // Also mount /api/skills directly
app.use("/api/auth", authRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/org", orgRoutes);
app.use("/api/processing", processingRoutes);
app.use("/chatbot", chatbotRoutes);
app.use("/api/organization", organizationRoutes);

// Legacy SalesIQ webhook endpoint
app.post("/salesiq-webhook", (req, res, next) => {
  req.url = "/chatbot/webhook";
  chatbotRoutes(req, res, next);
});

// Connect to MongoDB and start server
mongoose.connect(process.env.MONGO_URI, {
  tls: true,
  tlsAllowInvalidCertificates: true,
  serverSelectionTimeoutMS: 10000,
})
  .then(() => {
    console.log("✅ MongoDB Connected");
    app.listen(5000, () => console.log("🚀 Server running on port 5000"));
  })
  .catch(err => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });
