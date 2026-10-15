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
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";

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
import inventoryRouter from "./routes/inventory.route.js";

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
    secret: process.env.SESSION_SECRET || "3885485484htreheh43u84#@@#$#$r4",
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
      "http://localhost:5175",
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

// ##############################
// CLOUDINARY STORAGE SETUP
// #################-------------
cloudinary.config({
  cloud_name: "du4laiwmj",
  api_key: "567859429173318",
  api_secret: "csPinc3oHfZcXzyEU0rHNrQD9z4",
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "almubarak_uploads",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

const upload = multer({ storage: storage });

// #################------------------------------
//  IMAGE UPLOAD ROUTE — CLOUDINARY
// #################------------------------------
app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    return res.json({
      message: "Uploaded successfully",
      fileUrl: req.file.path, // Cloudinary secure URL
      fileName: req.file.filename,
      path: req.file.path,
      telhost: { url: req.file.path } // Maintained for legacy compatibility
    });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ message: "Upload failed", error: err.message });
  }
});


// #################------------------------------
// API ROUTES
// #################------------------------------
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
app.use("/api/inventory", inventoryRouter);

// Error handler
app.use((error, req, res, next) => {
  res.status(error.status || 500).json({
    message: error.message || "Something went wrong!",
    status: error.status,
    stack: error.stack,
  });
});

// Export for Vercel Serverless

app.listen("3000", () => {
  console.log("alhamdulillahi...")
})
