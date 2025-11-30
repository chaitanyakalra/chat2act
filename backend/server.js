import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";

// Import routes
import uploadRoutes from "./routes/uploadRoutes.js";
import processingRoutes from "./routes/processingRoutes.js";
import chatbotRoutes from "./routes/chatbotRoutes.js";
import organizationRoutes from "./routes/organizationRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());

// Register routes
app.use("/api/upload-doc", uploadRoutes);
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
