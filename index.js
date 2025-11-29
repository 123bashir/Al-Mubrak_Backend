import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import FormData from "form-data";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localEnvPath = path.resolve(__dirname, ".env");
const envResult = dotenv.config({ path: localEnvPath });
if (envResult.error) {
  dotenv.config();
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[env] No .env file found at ${localEnvPath}. Falling back to default environment resolution.`
    );
  }
}

import express from "express";
import session from "express-session";
import { db } from "./db.js";
import cors from "cors";
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
import uploadRouter from "./routes/upload.route.js"; // will wrap for Telhost
import staffRouter from "./routes/staff.route.js";
import cartRouter from "./routes/cart.route.js";
import cookieParser from "cookie-parser";

const app = express();

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || "dev_secret_change_me",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// CORS setup
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://almubarakcosmetics.com.ng",
    "https://admin.almubarakcosmetics.com.ng"
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// Serve static files from public folder
app.use(express.static(path.join(__dirname, "public")));

// Uploads folder
const uploadsPath = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

// Serve /api/upload as static
app.use('/api/upload', express.static(uploadsPath));

// Wrap uploadRouter to push files to Telhost
app.use("/api/upload", async (req, res, next) => {
  uploadRouter(req, res, async (err) => {
    if (err) return next(err);

    try {
      // Expecting { fileName, fileData } in base64
      if (req.body?.fileName && req.body?.fileData) {
        const localFilePath = path.join(uploadsPath, req.body.fileName);
        const buffer = Buffer.from(req.body.fileData, "base64");

        // Save locally (if uploadRouter hasn't already)
        if (!fs.existsSync(localFilePath)) {
          fs.writeFileSync(localFilePath, buffer);
        }

        // Push to Telhost
        const formData = new FormData();
        formData.append("image", fs.createReadStream(localFilePath));

        const telhostResponse = await axios.post(
          "https://api.almubarakcosmetics.com.ng/uploads.php",
          formData,
          { headers: formData.getHeaders() }
        );

        console.log("Sent to Telhost:", telhostResponse.data);
      }

      // Continue normal response
      next();
    } catch (uploadErr) {
      console.error("Telhost upload failed:", uploadErr.message);
      next(); // Don't break main upload flow
    }
  });
});

// API routes
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

// Error handling
app.use((error, req, res, next) => {
  res.status(error.status || 500).json({
    message: error.message || "Something went wrong!",
    status: error.status,
    stack: error.stack,
  });
});

// Start server
app.listen(3000, () => {
  console.log("🚀 Server is running on port 3000!");
});

