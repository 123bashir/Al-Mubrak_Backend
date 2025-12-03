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
import multer from "multer"; // <- multer added

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
dotenv.config({ path: localEnvPath });

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

// ##############################
// CLOUDINARY SETUP
// ##############################
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "almubarak_uploads", // Folder name in Cloudinary
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

const upload = multer({ storage: storage });

// ###############################################
//  IMAGE UPLOAD ROUTE — CLOUDINARY
// ###############################################
app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Multer with Cloudinary storage automatically uploads the file
    // and populates req.file with the Cloudinary response.

    return res.json({
      message: "Uploaded successfully",
      fileUrl: req.file.path, // Cloudinary URL
      // Keep telhost structure for compatibility if needed, though fileUrl is preferred
      telhost: { url: req.file.path }
    });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ message: "Upload failed", error: err.message });
  }
});

// ###############################################
// API ROUTES
// ###############################################
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
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
