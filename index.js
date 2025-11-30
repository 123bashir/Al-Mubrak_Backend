import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import FormData from "form-data";

import express from "express";
import session from "express-session";
import cors from "cors";
import cookieParser from "cookie-parser";

// Routers
import userRouter from "./routes/user.route.js";
import categoryRouter from "./routes/category.route.js";
import customerRouter from "./routes/customer.route.js";
import emailRouter from "./routes/email.route.js";
import ordersRouter from "./routes/orders.route.js";
import pickUpRouter from "./routes/pick-up.route.js";
import productRouter from "./routes/product.route.js";
import adminRouter from "./routes/admin.route.js";
import paymentRouter from "./routes/payment.route.js";
import shippingRouter from "./routes/shipping.route.js";
import staffRouter from "./routes/staff.route.js";
import cartRouter from "./routes/cart.route.js";

// Init paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
const localEnvPath = path.resolve(__dirname, ".env");
const envResult = dotenv.config({ path: localEnvPath });

if (envResult.error) {
  dotenv.config();
}

// Init express
const app = express();

// Sessions
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 },
  })
);

// CORS
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://almubarakcosmetics.com.ng",
      "https://admin.almubarakcosmetics.com.ng",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());

// Create uploads temporary folder
const uploadsPath = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

// ###############################################
//  IMAGE UPLOAD ROUTE — SEND TO TELHOST
// ###############################################
app.post("/api/upload", async (req, res) => {
  try {
    const { fileName, fileData } = req.body;

    if (!fileName || !fileData) {
      return res.status(400).json({ message: "fileName or fileData missing" });
    }

    const localFilePath = path.join(uploadsPath, fileName);

    // Save file temporarily
    const buffer = Buffer.from(fileData, "base64");
    fs.writeFileSync(localFilePath, buffer);

    // Prepare FormData for Telhost
    const formData = new FormData();
    formData.append("image", fs.createReadStream(localFilePath));

    // SEND TO TELHOST upload.php
    const telhostResponse = await axios.post(
      "https://api.almubarakcosmetics.com.ng/uploads.php",
      formData,
      { headers: formData.getHeaders() }
    );

    // Delete local temp file after upload
    fs.unlinkSync(localFilePath);

    return res.json({
      message: "Uploaded successfully",
      telhost: telhostResponse.data,
    });
  } catch (err) {
    console.error("Upload error:", err.message);
    return res.status(500).json({ message: "Upload failed", error: err.message });
  }
});

// ###############################################
// API ROUTES
// ###############################################

/*
 DO NOT wrap upload router anymore — it's handled above cleanly
*/

app.use("/api/users", userRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/customers", customerRouter);
app.use("/api/emails", emailRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/pickup", pickUpRouter);
app.use("/api/products", productRouter);
app.use("/api/admin", adminRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/shipping", shippingRouter);
app.use("/api", staffRouter);
app.use("/api/cart", cartRouter);

// Error handler
app.use((error, req, res, next) => {
  res.status(error.status || 500).json({
    message: error.message || "Something went wrong!",
    status: error.status,
    stack: error.stack,
  });
});

// Start server
app.listen(3000, () => {
  console.log("🚀 Server is running on port 3000");
});


