// api/sendOtp.js
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { to_name, to_email, otp_code } = req.body;

  // Package the data exactly how the EmailJS REST API expects it
  const data = {
    service_id: process.env.EMAILJS_SERVICE_ID,
    template_id: process.env.EMAILJS_TEMPLATE_ID,
    user_id: process.env.EMAILJS_PUBLIC_KEY,
    accessToken: process.env.EMAILJS_PRIVATE_KEY,
    template_params: {
      to_name: to_name,
      to_email: to_email,
      otp_code: otp_code
    }
  };

  try {
    // Send the secure request from the server, not the browser
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      return res.status(200).json({ message: 'OTP sent successfully!' });
    } else {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}