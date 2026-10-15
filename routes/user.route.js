import express from "express";
import {
  registerUser,
  loginUser,
  logoutUser,
  verifyForgotOtp,
  resetPassword,
  requestPasswordReset,
} from "../controllers/user.controller.js";

const router = express.Router();

router.post("/auth/register", registerUser);
router.post("/auth/login", loginUser);
router.post("/auth/logout", logoutUser);
router.post("/auth/forgot-password", requestPasswordReset);
router.post("/auth/verify-otp", verifyForgotOtp);
router.post("/auth/reset-password", resetPassword);

export default router;

