import crypto from "crypto";
import { db } from "../db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendOTPEmail } from "../services/gmailService.js";

const resolvedJwtSecret =
  process.env.JWT_SECRET ||
  process.env.USER_JWT_SECRET ||
  process.env.ADMIN_JWT_SECRET;

if (!resolvedJwtSecret && process.env.NODE_ENV !== "production") {
  console.warn(
    "[user.controller] Missing JWT secret. Falling back to a development-only secret. Set JWT_SECRET in your .env file for production."
  );
}

const USER_JWT_SECRET = resolvedJwtSecret || "dev_admin_secret_change_me";

// ============================= REGISTER ==============================
// ============================= LOGIN ==============================
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Required fields validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Get user from database
    const [users] = await db.query(
      'SELECT id, email, password, first_name, last_name, name, phone, location, avatar, status, created_at FROM customers WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    // Check if user exists
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = users[0];

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Your account is inactive. Please contact support.'
      });
    }

    // Verify password
    if (!user.password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: 'customer' },
      USER_JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Format user data (exclude password and token)
    const userData = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      name: user.name || `${user.first_name} ${user.last_name}`,
      phoneNumber: user.phone,
      location: user.location,
      avatar: user.avatar,
      profile_image: user.avatar, // Include both for compatibility
      status: user.status,
      createdAt: user.created_at
    };

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: userData,
      token: token // Token sent separately, not in userData
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred during login. Please try again.'
    });
  }
};

// ============================= REGISTER ==============================
export const registerUser = async (req, res) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      address,
      city,
      state,
      zipCode,
      gender,
      dateOfBirth
    } = req.body;

    // Required fields validation
    const requiredFields = ['email', 'password', 'firstName', 'lastName'];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address"
      });
    }

    // Phone number validation (basic international format) - only if provided
    if (phoneNumber) {
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(phoneNumber)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid phone number"
        });
      }
    }

    // Password validation
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long"
      });
    }

    // Check password strength
    const hasUpperCase = /[A-Z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!hasUpperCase || !hasNumbers || !hasSpecialChars) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least one uppercase letter, one number, and one special character"
      });
    }


    try {
      const normalizedEmail = email.toLowerCase().trim();

      // Check if email already exists
      const [existingEmail] = await db.execute(
        "SELECT id FROM customers WHERE email = ?",
        [normalizedEmail]
      );

      if (existingEmail.length > 0) {
        return res.status(409).json({
          success: false,
          message: "This email is already registered. Please use a different email or try logging in."
        });
      }

      // Check if phone number already exists (if provided)
      if (phoneNumber) {
        const [existingPhone] = await db.execute(
          "SELECT id FROM customers WHERE phone = ?",
          [phoneNumber.trim()]
        );

        if (existingPhone.length > 0) {
          return res.status(409).json({
            success: false,
            message: "This phone number is already registered. Please use a different number or try logging in."
          });
        }
      }

      // Get database connection for transaction
      const connection = await db.getConnection();

      try {
        // Start transaction for user creation
        await connection.beginTransaction();

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Build name field
        const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

        // Build location from address, city, state, zipCode
        const locationParts = [address, city, state, zipCode].filter(Boolean);
        const location = locationParts.length > 0 ? locationParts.join(', ') : null;

        // Insert new user - matching the actual customers table schema
        const [result] = await connection.execute(
          `INSERT INTO customers (
            email, 
            password, 
            first_name, 
            last_name,
            name,
            phone, 
            location,
            status,
            join_date,
            total_spent,
            orders_count,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', CURDATE(), 0.00, 0, NOW(), NOW())`,
          [
            normalizedEmail,
            hashedPassword,
            firstName.trim(),
            lastName.trim(),
            fullName,
            phoneNumber ? phoneNumber.trim() : null,
            location
          ]
        );

        // Commit transaction
        await connection.commit();

        // Generate JWT token for immediate login
        const token = jwt.sign(
          {
            id: result.insertId,
            email: normalizedEmail,
            role: 'customer'
          },
          USER_JWT_SECRET,
          { expiresIn: '7d' }
        );

        // Set HTTP-only cookie
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        // Return success response with user data (excluding sensitive info)
        return res.status(201).json({
          success: true,
          message: 'Registration successful! Welcome to Almubarak Pharmacy.',
          data: {
            id: result.insertId,
            email: normalizedEmail,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            name: fullName,
            phoneNumber: phoneNumber ? phoneNumber.trim() : null,
            location: location,
            status: 'active',
            token: token
          }
        });
      } catch (transactionError) {
        // Rollback transaction in case of error
        await connection.rollback();
        throw transactionError;
      } finally {
        // Release connection
        connection.release();
      }

    } catch (error) {
      console.error('Registration error:', error);

      // Handle duplicate entry errors
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          success: false,
          message: 'This email or phone number is already registered.'
        });
      }

      // Handle other database errors
      return res.status(500).json({
        success: false,
        message: 'An error occurred during registration. Please try again.'
      });
    }

  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred during registration. Please try again.'
    });
  }
};




export const verifyForgotOtp = async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    const s = req.session.forgotPassword;
    if (!email || !otp) return res.status(400).json({ success: false, message: "email and otp are required" });
    if (!s || s.email !== email) return res.status(400).json({ success: false, message: "Invalid session" });
    if (Date.now() - (s.ts || 0) > 10 * 60 * 1000) {
      delete req.session.forgotPassword;
      return res.status(400).json({ success: false, message: "OTP expired" });
    }
    if (String(s.otp) !== String(otp)) return res.status(400).json({ success: false, message: "Invalid OTP" });

    req.session.forgotPassword.verified = true;
    return res.status(200).json({ success: true, message: "OTP verified" });
  } catch (err) {
    console.error("verifyForgotOtp error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body || {};
    if (!email || !newPassword) return res.status(400).json({ success: false, message: "email and newPassword are required" });

    const s = req.session.forgotPassword;
    if (!s || s.email !== email || s.verified !== true) {
      return res.status(400).json({ success: false, message: "OTP verification required" });
    }

    const saltRounds = 12;
    const hashed = await bcrypt.hash(String(newPassword), saltRounds);
    await db.execute("UPDATE customers SET password = ? WHERE email = ?", [hashed, email]);

    // Invalidate the session token for reset flow
    delete req.session.forgotPassword;

    return res.status(200).json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.error("resetPassword error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


export const logoutUser = async (req, res) => {
  res.clearCookie("token");
  res.status(200).json({ message: "Logout successful" });
};

export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const [users] = await db.query(
      "SELECT id, first_name, last_name FROM customers WHERE email = ? LIMIT 1",
      [normalizedEmail]
    );

    if (!users.length) {
      // Do not reveal whether the account exists
      return res.status(200).json({
        success: true,
        message: "If the email exists, a reset code has been sent.",
      });
    }

    const otp = generateOTP();
    req.session.forgotPassword = {
      email: normalizedEmail,
      otp,
      ts: Date.now(),
      verified: false,
    };


    // Try to send email, log error if it fails
    try {
      await sendOTPEmail({
        to: normalizedEmail,
        firstName: users[0].first_name || 'there',
        otp: otp
      });
    } catch (emailError) {
      // Continue anyway - OTP is stored in session
    }


    return res.status(200).json({
      success: true,
      message: "Verification code sent to your email.",
    });
  } catch (error) {
    console.error("requestPasswordReset error:", error);
    return res.status(500).json({ success: false, message: "Failed to send reset code" });
  }
};

// ... existing code ...
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

