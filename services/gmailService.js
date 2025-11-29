import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load OAuth2 credentials from myToken.json
const TOKEN_PATH = path.join(__dirname, '..', 'myToken.json');

let oauth2Client = null;

/**
 * Initialize OAuth2 client with stored credentials
 */
const initializeOAuth2Client = () => {
  if (oauth2Client) return oauth2Client;

  try {
    const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));

    oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/oauth2callback'
    );

    oauth2Client.setCredentials({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      scope: tokenData.scope,
      token_type: tokenData.token_type,
      expiry_date: tokenData.expiry_date || Date.now() + tokenData.expires_in * 1000
    });

    // Auto-refresh token when it expires
    oauth2Client.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        tokenData.refresh_token = tokens.refresh_token;
      }
      tokenData.access_token = tokens.access_token;
      tokenData.expiry_date = tokens.expiry_date;

      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2));
    });

    return oauth2Client;
  } catch (error) {
    throw new Error('Gmail API credentials not found. Please run the OAuth setup.');
  }
};

/**
 * Create a beautiful HTML email template
 */
const createEmailTemplate = ({ title, greeting, message, otpCode, footer }) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; background: #ffffff; border-radius: 24px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3); overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #312e81 0%, #1e3a8a 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">
                Al-Mubarak Cosmetics
              </h1>
              <p style="margin: 8px 0 0; color: #e0e7ff; font-size: 14px; font-weight: 500;">
                Premium Beauty & Wellness
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 50px 40px;">
              <h2 style="margin: 0 0 20px; color: #0f172a; font-size: 24px; font-weight: 600;">
                ${greeting}
              </h2>
              
              <p style="margin: 0 0 30px; color: #475569; font-size: 16px; line-height: 1.6;">
                ${message}
              </p>

              ${otpCode ? `
              <!-- OTP Code Box -->
              <table role="presentation" style="width: 100%; margin: 30px 0;">
                <tr>
                  <td style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border: 2px solid #0ea5e9; border-radius: 16px; padding: 30px; text-align: center;">
                    <p style="margin: 0 0 12px; color: #0c4a6e; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                      Your Verification Code
                    </p>
                    <div style="font-size: 48px; font-weight: 800; color: #0369a1; letter-spacing: 12px; font-family: 'Courier New', monospace;">
                      ${otpCode}
                    </div>
                    <p style="margin: 12px 0 0; color: #64748b; font-size: 13px;">
                      Valid for 10 minutes
                    </p>
                  </td>
                </tr>
              </table>
              ` : ''}

              <div style="margin: 30px 0; padding: 20px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px;">
                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                  <strong>🔒 Security Tip:</strong> Never share this code with anyone. Al-Mubarak staff will never ask for your verification code.
                </p>
              </div>

              ${footer ? `
              <p style="margin: 30px 0 0; color: #64748b; font-size: 14px; line-height: 1.6;">
                ${footer}
              </p>
              ` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f8fafc; padding: 30px 40px; border-top: 1px solid #e2e8f0;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td style="text-align: center;">
                    <p style="margin: 0 0 12px; color: #475569; font-size: 14px; font-weight: 600;">
                      Al-Mubarak Cosmetics
                    </p>
                    <p style="margin: 0 0 8px; color: #64748b; font-size: 13px;">
                      Sabuwar Gandu, Medile Road, Kano | Gwarzo Road, Bakin Asibiti, Kano
                    </p>
                    <p style="margin: 0 0 16px; color: #64748b; font-size: 13px;">
                      📞 +234 806 160 5271 | 📧 info@almubarakcosmetics.com.ng
                    </p>
                    <div style="margin: 20px 0 0; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                      <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                        © ${new Date().getFullYear()} Al-Mubarak Cosmetics. All rights reserved.
                      </p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

/**
 * Send email using Gmail API
 */
export const sendEmailMessage = async ({ to, subject, html, text }) => {
  try {
    const auth = initializeOAuth2Client();
    const gmail = google.gmail({ version: 'v1', auth });

    // Create email content
    const emailContent = [
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `To: ${to}`,
      `Subject: ${subject}`,
      '',
      html || text
    ].join('\n');

    // Encode email in base64
    const encodedMessage = Buffer.from(emailContent)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    return {
      success: true,
      messageId: result.data.id,
      message: 'Email sent successfully'
    };

  } catch (error) {

    if (error.code === 401) {
      throw new Error('Gmail authentication failed. Please re-authenticate.');
    } else if (error.code === 403) {
      throw new Error('Gmail API access denied. Check your API permissions.');
    } else if (error.code === 429) {
      throw new Error('Gmail API rate limit exceeded. Please try again later.');
    }

    throw new Error(`Failed to send email: ${error.message}`);
  }
};

/**
 * Send OTP email with beautiful template
 */
export const sendOTPEmail = async ({ to, firstName, otp }) => {
  // Validate email address
  if (!to || typeof to !== 'string' || !to.includes('@')) {
    console.error('[OTP Email] Invalid email address:', to);
    throw new Error('Invalid recipient email address');
  }

  // Validate OTP
  if (!otp) {
    console.error('[OTP Email] Missing OTP code');
    throw new Error('OTP code is required');
  }



  const html = createEmailTemplate({
    title: 'Password Reset - Al-Mubarak Cosmetics',
    greeting: `Hello ${firstName || 'there'}! `,
    message: 'We received a request to reset your password. Use the verification code below to complete the process. This code will expire in 10 minutes.',
    otpCode: otp,
    footer: 'If you didn\'t request a password reset, please ignore this email or contact our support team if you have concerns.'
  });

  try {
    const result = await sendEmailMessage({
      to,
      subject: 'Reset Your Al-Mubarak Password',
      html
    });
    console.log('[OTP Email] Email sent successfully:', result);
    return result;
  } catch (error) {
    console.error('[OTP Email] Failed to send email:', error.message);
    throw error;
  }
};

/**
 * Send welcome email
 */
export const sendWelcomeEmail = async ({ to, firstName }) => {
  const html = createEmailTemplate({
    title: 'Welcome to Al-Mubarak Cosmetics',
    greeting: `Welcome, ${firstName}! `,
    message: 'Thank you for joining Al-Mubarak Cosmetics! We\'re excited to have you as part of our community. Explore our premium collection of beauty and wellness products.',
    footer: 'Visit our stores in Medile and Bakin Asibiti, Kano, or shop online anytime!'
  });

  return await sendEmailMessage({
    to,
    subject: 'Welcome to Al-Mubarak Cosmetics!',
    html
  });
};

/**
 * Send order confirmation/payment verification email
 */
export const sendOrderConfirmationEmail = async ({ to, customerName, orderId, amount, items, paymentMethod }) => {
  const itemsHtml = items.map(item => `
        <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #333;">${item.name}</td>
            <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666; text-align: center;">x${item.quantity}</td>
            <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #333; text-align: right;">₦${(item.price * item.quantity).toLocaleString()}</td>
        </tr>
    `).join('');

  const html = createEmailTemplate({
    title: 'Payment Verification - Al-Mubarak Cosmetics',
    greeting: `Hello ${customerName || 'Valued Customer'},`,
    message: `Thank you for your order! We have received your payment confirmation request for Order #${orderId}. Our team will verify your payment of <strong>₦${amount.toLocaleString()}</strong> shortly.`,
    footer: 'Once verified, we will process your order immediately. You will receive another email when your order is shipped.',
    otpCode: null // No OTP for this email
  }).replace(
    '<!-- OTP Code Box -->',
    `<!-- Order Details -->
        <div style="margin: 30px 0; background: #f8fafc; border-radius: 12px; padding: 20px;">
            <h3 style="margin: 0 0 15px; color: #1e3a8a; font-size: 16px;">Order Summary</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                    <tr>
                        <th style="text-align: left; padding-bottom: 10px; color: #64748b; font-weight: 600;">Item</th>
                        <th style="text-align: center; padding-bottom: 10px; color: #64748b; font-weight: 600;">Qty</th>
                        <th style="text-align: right; padding-bottom: 10px; color: #64748b; font-weight: 600;">Price</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="2" style="padding-top: 15px; text-align: right; font-weight: 600; color: #333;">Total Amount:</td>
                        <td style="padding-top: 15px; text-align: right; font-weight: 700; color: #1e3a8a; font-size: 16px;">₦${amount.toLocaleString()}</td>
                    </tr>
                </tfoot>
            </table>
            <div style="margin-top: 20px; padding-top: 15px; border-top: 1px dashed #cbd5e1;">
                <p style="margin: 0; font-size: 13px; color: #64748b;">
                    <strong>Payment Method:</strong> ${paymentMethod}<br>
                    <strong>Status:</strong> Pending Verification
                </p>
            </div>
        </div>`
  );

  return await sendEmailMessage({
    to,
    subject: `📦 Order Confirmation #${orderId} - Payment Verification`,
    html
  });
};

/**
 * Send payment confirmation email for delivery orders
 */
export const sendPaymentConfirmationEmail = async ({
  to,
  customerName,
  orderId,
  amount,
  items,
  paymentMethod
}) => {
  console.log('[Payment Email] Sending delivery payment confirmation to:', to);

  // Build product list HTML with images
  const productsHtml = items.map(item => `
    <tr>
      <td style="padding: 15px 10px; border-bottom: 1px solid #e5e7eb;">
        <table style="width: 100%;">
          <tr>
            <td style="width: 80px;">
              <img src="${item.image || 'https://via.placeholder.com/80'}" 
                   alt="${item.name}" 
                   style="width: 70px; height: 70px; object-fit: cover; border-radius: 8px; border: 2px solid #e5e7eb;" />
            </td>
            <td style="padding-left: 15px;">
              <div style="font-weight: 600; color: #1f2937; font-size: 15px; margin-bottom: 4px;">${item.name}</div>
              <div style="color: #6b7280; font-size: 13px;">Quantity: ${item.quantity}</div>
              <div style="color: #667eea; font-weight: 600; font-size: 14px; margin-top: 4px;">₦${(item.price).toLocaleString()} each</div>
            </td>
            <td style="text-align: right; vertical-align: top; white-space: nowrap;">
              <div style="font-weight: 700; color: #1e3a8a; font-size: 16px;">₦${(item.price * item.quantity).toLocaleString()}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Confirmation - Al-Mubarak Cosmetics</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
  <table role="presentation" style="width: 100%; border-collapse: collapse; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width: 650px; width: 100%; background: #ffffff; border-radius: 24px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3); overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #312e81 0%, #1e3a8a 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Payment Received!</h1>
              <p style="margin: 12px 0 0; color: #e0e7ff; font-size: 15px;">Thank you for your order</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 35px;">
              <p style="margin: 0 0 8px; color: #1f2937; font-size: 18px; font-weight: 600;">Hello ${customerName},</p>
              
              <p style="margin: 0 0 25px; color: #4b5563; font-size: 15px; line-height: 1.6;">
                We've received your payment confirmation for your delivery order. Our admin team will review and verify your payment shortly. You'll receive a confirmation email once it's approved, and we'll immediately prepare your items for delivery!
              </p>

              <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-left: 4px solid #0ea5e9; border-radius: 12px; padding: 20px; margin: 25px 0;">
                <table style="width: 100%;">
                  <tr>
                    <td style="color: #0c4a6e; font-size: 13px; font-weight: 600; padding-bottom: 8px;">ORDER ID</td>
                    <td style="text-align: right; color: #0369a1; font-size: 15px; font-weight: 700; padding-bottom: 8px;">#${orderId}</td>
                  </tr>
                  <tr>
                    <td style="color: #0c4a6e; font-size: 13px; font-weight: 600; padding-bottom: 8px;">PAYMENT METHOD</td>
                    <td style="text-align: right; color: #0369a1; font-size: 14px; font-weight: 600; padding-bottom: 8px;">${paymentMethod}</td>
                  </tr>
                  <tr>
                    <td style="color: #0c4a6e; font-size: 13px; font-weight: 600;">TOTAL AMOUNT</td>
                    <td style="text-align: right; color: #0369a1; font-size: 18px; font-weight: 700;">₦${amount.toLocaleString()}</td>
                  </tr>
                </table>
              </div>

              <!-- Products Section -->
              <div style="margin: 30px 0;">
                <h3 style="margin: 0 0 20px; color: #1e3a8a; font-size: 18px; font-weight: 600; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px;">Your Order Items</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  ${productsHtml}
                </table>
                <div style="margin-top: 20px; padding: 20px; background: #f8fafc; border-radius: 12px; text-align: right;">
                  <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">Subtotal: ₦${amount.toLocaleString()}</div>
                  <div style="font-size: 14px; color: #10b981; font-weight: 600; margin-bottom: 12px;">Delivery: FREE</div>
                  <div style="font-size: 20px; color: #1e3a8a; font-weight: 700; padding-top: 12px; border-top: 2px solid #cbd5e1;">Total: ₦${amount.toLocaleString()}</div>
                </div>
              </div>

              <!-- Timeline Box -->
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 12px; padding: 20px; margin: 25px 0;">
                <p style="margin: 0 0 12px; color: #92400e; font-size: 14px; font-weight: 700;">What Happens Next?</p>
                <p style="margin: 0; color: #78350f; font-size: 13px; line-height: 1.7;">
                  <strong>Step 1:</strong> Our admin verifies your payment (usually within 30 minutes)<br/>
                  <strong>Step 2:</strong> We prepare and package your items<br/>
                  <strong>Step 3:</strong> Your order is dispatched for delivery<br/>
                  <strong>Step 4:</strong> You receive your products at your doorstep!
                </p>
              </div>

              <p style="margin: 25px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6; text-align: center;">
                If you have any questions, feel free to reach out to us at<br/>
                Phone: +234 806 160 5271 | Email: info@almubarakcosmetics.com.ng
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f8fafc; padding: 30px 35px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 12px; color: #475569; font-size: 15px; font-weight: 600;">Al-Mubarak Cosmetics</p>
              <p style="margin: 0 0 8px; color: #64748b; font-size: 13px;">Sabuwar Gandu, Medile Road, Kano | Gwarzo Road, Bakin Asibiti, Kano</p>
              <p style="margin: 0 0 16px; color: #64748b; font-size: 13px;">Phone: +234 806 160 5271 | Email: info@almubarakcosmetics.com.ng</p>
              <p style="margin: 0; color: #94a3b8; font-size: 12px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
                © ${new Date().getFullYear()} Al-Mubarak Cosmetics. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return await sendEmailMessage({
    to,
    subject: `Payment Received - Order #${orderId}`,
    html
  });
};

/**
 * Send payment confirmation email for pickup orders
 */
export const sendPickupPaymentConfirmationEmail = async ({
  to,
  customerName,
  orderId,
  amount,
  items,
  paymentMethod,
  pickupDate,
  pickupBranch
}) => {

  // Build product list HTML with images
  const productsHtml = items.map(item => `
    <tr>
      <td style="padding: 15px 10px; border-bottom: 1px solid #e5e7eb;">
        <table style="width: 100%;">
          <tr>
            <td style="width: 80px;">
              <img src="${item.image || 'https://via.placeholder.com/80'}" 
                   alt="${item.name}" 
                   style="width: 70px; height: 70px; object-fit: cover; border-radius: 8px; border: 2px solid #e5e7eb;" />
            </td>
            <td style="padding-left: 15px;">
              <div style="font-weight: 600; color: #1f2937; font-size: 15px; margin-bottom: 4px;">${item.name}</div>
              <div style="color: #6b7280; font-size: 13px;">Quantity: ${item.quantity}</div>
              <div style="color: #667eea; font-weight: 600; font-size: 14px; margin-top: 4px;">₦${(item.price).toLocaleString()} each</div>
            </td>
            <td style="text-align: right; vertical-align: top; white-space: nowrap;">
              <div style="font-weight: 700; color: #1e3a8a; font-size: 16px;">₦${(item.price * item.quantity).toLocaleString()}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pickup Payment Confirmation - Al-Mubarak Cosmetics</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
  <table role="presentation" style="width: 100%; border-collapse: collapse; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width: 650px; width: 100%; background: #ffffff; border-radius: 24px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3); overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #065f46 0%, #047857 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Pickup Order Confirmed!</h1>
              <p style="margin: 12px 0 0; color: #d1fae5; font-size: 15px;">We'll prepare your items for collection</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 35px;">
              <p style="margin: 0 0 8px; color: #1f2937; font-size: 18px; font-weight: 600;">Hello ${customerName},</p>
              
              <p style="margin: 0 0 25px; color: #4b5563; font-size: 15px; line-height: 1.6;">
                Wonderful news! We've received your payment confirmation. Our admin team will review and verify your payment shortly. Once approved, we'll prepare your items and have them ready for pickup at your selected branch!
              </p>

              <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-left: 4px solid #10b981; border-radius: 12px; padding: 20px; margin: 25px 0;">
                <table style="width: 100%;">
                  <tr>
                    <td style="color: #065f46; font-size: 13px; font-weight: 600; padding-bottom: 8px;">ORDER ID</td>
                    <td style="text-align: right; color: #047857; font-size: 15px; font-weight: 700; padding-bottom: 8px;">#${orderId}</td>
                  </tr>
                  <tr>
                    <td style="color: #065f46; font-size: 13px; font-weight: 600; padding-bottom: 8px;">PICKUP BRANCH</td>
                    <td style="text-align: right; color: #047857; font-size: 14px; font-weight: 600; padding-bottom: 8px;">${pickupBranch || 'Medile Branch'}</td>
                  </tr>
                  <tr>
                    <td style="color: #065f46; font-size: 13px; font-weight: 600; padding-bottom: 8px;">SCHEDULED DATE</td>
                    <td style="text-align: right; color: #047857; font-size: 14px; font-weight: 600; padding-bottom: 8px;">${pickupDate ? new Date(pickupDate).toLocaleString() : 'TBD'}</td>
                  </tr>
                  <tr>
                    <td style="color: #065f46; font-size: 13px; font-weight: 600;">TOTAL AMOUNT</td>
                    <td style="text-align: right; color: #047857; font-size: 18px; font-weight: 700;">₦${amount.toLocaleString()}</td>
                  </tr>
                </table>
              </div>

              <!-- Products Section -->
              <div style="margin: 30px 0;">
                <h3 style="margin: 0 0 20px; color: #047857; font-size: 18px; font-weight: 600; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px;">Items to Collect</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  ${productsHtml}
                </table>
                <div style="margin-top: 20px; padding: 20px; background: #f8fafc; border-radius: 12px; text-align: right;">
                  <div style="font-size: 20px; color: #047857; font-weight: 700; padding-top: 12px; border-top: 2px solid #cbd5e1;">Total: ₦${amount.toLocaleString()}</div>
                </div>
              </div>

              <!-- Timeline Box -->
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 12px; padding: 20px; margin: 25px 0;">
                <p style="margin: 0 0 12px; color: #92400e; font-size: 14px; font-weight: 700;">Next Steps</p>
                <p style="margin: 0; color: #78350f; font-size: 13px; line-height: 1.7;">
                  <strong>Step 1:</strong> Admin verifies your payment (usually within 30 minutes)<br/>
                  <strong>Step 2:</strong> We prepare and package your items<br/>
                  <strong>Step 3:</strong> You'll receive a pickup code via email<br/>
                  <strong>Step 4:</strong> Visit the branch with your code to collect your items!
                </p>
              </div>

              <div style="background: #dbeafe; border: 2px dashed #3b82f6; border-radius: 12px; padding: 20px; margin: 25px 0; text-align: center;">
                <p style="margin: 0 0 8px; color: #1e40af; font-size: 13px; font-weight: 600; text-transform: uppercase;">Pickup Location</p>
                <p style="margin: 0; color: #1e3a8a; font-size: 16px; font-weight: 700;">${pickupBranch || 'Medile Branch'}</p>
                <p style="margin: 8px 0 0; color: #3b82f6; font-size: 13px;">
                  ${pickupBranch?.includes('Medile') ? 'Sabuwar Gandu, Medile Road, Kano' : 'Gwarzo Road, Bakin Asibiti, Kano'}
                </p>
              </div>

              <p style="margin: 25px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6; text-align: center;">
                Questions? We're here to help!<br/>
                Phone: +234 806 160 5271 | Email: info@almubarakcosmetics.com.ng
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f8fafc; padding: 30px 35px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 12px; color: #475569; font-size: 15px; font-weight: 600;">Al-Mubarak Cosmetics</p>
              <p style="margin: 0 0 8px; color: #64748b; font-size: 13px;">Sabuwar Gandu, Medile Road, Kano | Gwarzo Road, Bakin Asibiti, Kano</p>
              <p style="margin: 0 0 16px; color: #64748b; font-size: 13px;">Phone: +234 806 160 5271 | Email: info@almubarakcosmetics.com.ng</p>
              <p style="margin: 0; color: #94a3b8; font-size: 12px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
                © ${new Date().getFullYear()} Al-Mubarak Cosmetics. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return await sendEmailMessage({
    to,
    subject: `Pickup Confirmed - Order #${orderId}`,
    html
  });
};

export default {
  sendEmailMessage,
  sendOTPEmail,
  sendWelcomeEmail,
  sendOrderConfirmationEmail,
  sendPaymentConfirmationEmail,
  sendPickupPaymentConfirmationEmail
};
