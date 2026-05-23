import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  // 1. Handle CORS Preflight (Required for some Vercel setups)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. Block anything that isn't a POST request
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  // 3. Extract the data sent from your frontend
  const { to_name, to_email, otp_code } = req.body;

  if (!to_email || !otp_code) {
    return res.status(400).json({ error: 'Missing target email or OTP code.' });
  }

  try {
    // 4. Configure the Email Transporter (Connecting to Gmail)
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER, // Your Gmail address (set in Vercel)
        pass: process.env.EMAIL_PASS, // Your Gmail App Password (set in Vercel)
      },
    });

    // 5. Design the Email Content
    const mailOptions = {
      from: `"Chit-Chat Security" <${process.env.EMAIL_USER}>`,
      to: to_email,
      subject: 'Your Chit-Chat Verification Code',
      html: `
        <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #2d2d2d; border-radius: 12px; background-color: #0a0a0f; color: #f8fafc;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #8b5cf6; margin: 0;">Chit-Chat</h2>
            <p style="color: #94a3b8; font-size: 14px;">Secure E2EE Messaging</p>
          </div>
          
          <p>Hello <b>${to_name || 'there'}</b>,</p>
          <p>Thank you for creating an account. Please use the following 6-digit code to verify your email address and secure your account:</p>
          
          <div style="background-color: #191923; padding: 20px; text-align: center; border-radius: 8px; margin: 30px 0; border: 1px solid #333;">
            <h1 style="margin: 0; letter-spacing: 8px; color: #10b981; font-size: 32px;">${otp_code}</h1>
          </div>
          
          <p style="color: #94a3b8; font-size: 13px;">If you did not request this code, please ignore this email. No account will be created without this verification step.</p>
          
          <hr style="border-color: #333; margin-top: 30px;">
          <p style="color: #64748b; font-size: 12px; text-align: center;">Securely yours,<br/>Aryan Verma & The Chit-Chat Team</p>
        </div>
      `,
    };

    // 6. Send the Email
    await transporter.sendMail(mailOptions);

    // 7. Tell the frontend it worked
    return res.status(200).json({ success: true, message: 'OTP sent successfully!' });

  } catch (error) {
    console.error("OTP Email Error:", error);
    return res.status(500).json({ error: 'Internal Server Error. Could not send email.' });
  }
}
