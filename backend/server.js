import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import uploadRoutes from "./routes/uploadRoutes.js";
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


app.use("/api/upload-doc", uploadRoutes);

app.listen(5000, () => console.log("Server running on port 5000"));
