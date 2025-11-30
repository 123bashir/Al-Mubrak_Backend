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
// MULTER SETUP
// ##############################
const tempUpload = multer({ dest: "temp_uploads/" }); // temp folder for local uploads

// ###############################################
//  IMAGE UPLOAD ROUTE — RECEIVE FILE & SEND TO TELHOST
// ###############################################
app.post("/api/upload", tempUpload.single("image"), async (req, res) => {
  try {
    let tempPath;
    let originalName = "image.jpg";

    if (req.file) {
      // Handle Multer upload
      tempPath = req.file.path;
      originalName = req.file.originalname;
    } else if (req.body.fileData) {
      // Handle Base64 JSON upload
      const base64Data = req.body.fileData;
      originalName = req.body.fileName || "image.jpg";

      // Create a unique temp file path
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      tempPath = path.join("temp_uploads", uniqueSuffix + '-' + originalName);

      // Ensure temp_uploads directory exists
      if (!fs.existsSync("temp_uploads")) {
        fs.mkdirSync("temp_uploads");
      }

      // Write Base64 data to file
      fs.writeFileSync(tempPath, Buffer.from(base64Data, 'base64'));
    } else {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Prepare FormData for Telhost
    const formData = new FormData();
    formData.append("image", fs.createReadStream(tempPath));

    // Send to Telhost
    const telhostResponse = await axios.post(
      "https://api.almubarakcosmetics.com.ng/uploads.php",
      formData,
      { headers: formData.getHeaders() }
    );

    // Delete local temp file
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }

    return res.json({
      message: "Uploaded successfully",
      telhost: telhostResponse.data,
      // Fallback for older frontend code expecting fileUrl
      fileUrl: telhostResponse.data?.url
    });
  } catch (err) {
    console.error("Upload error:", err);
    // Clean up temp file if it exists
    // Note: tempPath might be undefined if error occurred before assignment
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
