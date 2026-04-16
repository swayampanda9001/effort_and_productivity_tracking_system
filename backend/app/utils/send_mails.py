import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from app.core.config import settings

logger = logging.getLogger(__name__)

otp_template = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verification Code</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
            padding: 20px;
            min-height: 100vh;
        }
        
        .email-container {
            width: 600px;
            margin: 0 auto;
            background: #242424;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }
        
        .header {
            background: linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%);
            padding: 40px 30px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }
        
        .header::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
            animation: pulse 3s ease-in-out infinite;
        }
        
        @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 0.5; }
            50% { transform: scale(1.1); opacity: 0.8; }
        }
        
        .logo {
            width: 60px;
            height: 60px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 50%;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            z-index: 2;
        }
        
        .logo::before {
            content: '🔐';
            font-size: 24px;
        }
        
        .header h1 {
            color: white;
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 10px;
            position: relative;
            z-index: 2;
        }
        
        .header p {
            color: rgba(255, 255, 255, 0.9);
            font-size: 16px;
            position: relative;
            z-index: 2;
        }
        
        .content {
            padding: 40px 30px;
            color: #e0e0e0;
        }
        
        .greeting {
            font-size: 18px;
            margin-bottom: 30px;
            line-height: 1.6;
            color: #b0b0b0;
        }
        
        .otp-section {
            background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
            border-radius: 12px;
            padding: 30px;
            text-align: center;
            margin: 30px 0;
            border: 2px solid #ff6b35;
            position: relative;
            overflow: hidden;
        }
        
        .otp-section::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 2px;
            background: linear-gradient(90deg, #ff6b35, #ff8c42, #ff6b35);
        }
        
        .otp-label {
            font-size: 14px;
            color: #ff8c42;
            margin-bottom: 15px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .otp-code {
            font-size: 48px;
            font-weight: 800;
            color: #ff6b35;
            margin: 20px 0;
            letter-spacing: 8px;
            font-family: 'Courier New', monospace;
        }
        
        .otp-note {
            font-size: 14px;
            color: #b0b0b0;
            margin-top: 20px;
            line-height: 1.5;
        }
        
        .warning {
            background: rgba(255, 193, 7, 0.1);
            border: 1px solid rgba(255, 193, 7, 0.3);
            border-radius: 8px;
            padding: 20px;
            margin: 30px 0;
            color: #ffc107;
        }
        
        .warning-icon {
            display: inline-block;
            margin-right: 10px;
            font-size: 18px;
        }
        
        .footer {
            background: #1a1a1a;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #333;
        }
        
        .footer p {
            color: #888;
            font-size: 14px;
            margin-bottom: 10px;
            line-height: 1.6;
        }
        
        .company-info {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #333;
        }
        
        .company-info h3 {
            color: #ff6b35;
            font-size: 16px;
            margin-bottom: 10px;
        }
        
        .social-links {
            margin-top: 20px;
        }
        
        .social-links a {
            display: inline-block;
            margin: 0 10px;
            color: #ff6b35;
            text-decoration: none;
            font-size: 14px;
            transition: color 0.3s ease;
        }
        
        .social-links a:hover {
            color: #ff8c42;
        }
        
        .divider {
            height: 2px;
            background: linear-gradient(90deg, transparent, #ff6b35, transparent);
            margin: 30px 0;
        }
        
        @media (max-width: 600px) {
            .email-container {
                margin: 10px;
                border-radius: 12px;
            }
            
            .header, .content, .footer {
                padding: 20px;
            }
            
            .otp-code {
                font-size: 36px;
                letter-spacing: 4px;
            }
            
            .header h1 {
                font-size: 24px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <div class="logo">
              <img src="https://raw.githubusercontent.com/blackTiles/Sprint-Sync/refs/heads/master/frontend/public/logo.png?token=GHSAT0AAAAAADEHLKXWKE3QC3BU5U7IWLXI2FUR53Q" width="100" height="100" alt="Logo">
            </div>
            <h1>Verification Required</h1>
            <p>Secure your account with this verification code</p>
        </div>
        
        <div class="content">
            <div class="greeting">
                Hello <strong>{full_name}</strong>,
                <br><br>
                We received a request to verify your account. Please use the verification code below to complete the process.
            </div>
            
            <div class="otp-section">
                <div class="otp-label">Your Verification Code</div>
                <div class="otp-code">{otp}</div>
                <div class="otp-note">
                    This code will expire in <strong>10 minutes</strong>
                </div>
            </div>
            
            <div class="warning">
                <span class="warning-icon">⚠️</span>
                <strong>Security Notice:</strong> Never share this code with anyone. Our team will never ask for your verification code via phone or email.
            </div>
            
            <div class="divider"></div>
            
            <p style="color: #b0b0b0; line-height: 1.6;">
                If you didn't request this verification code, please ignore this email. Your account remains secure.
                <br><br>
                Need help? Contact our support team at <a href="mailto:support@company.com" style="color: #ff6b35;">support@company.com</a>
            </p>
        </div>
        
        <div class="footer">
            <div class="company-info">
                <h3>SprintSync</h3>
                <p>123 Business Street, City, State 12345</p>
                <p>© 2025 SprintSync. All rights reserved.</p>
            </div>
            
            <div class="social-links">
                <a href="#">Privacy Policy</a>
                <a href="#">Terms of Service</a>
                <a href="#">Support</a>
            </div>
        </div>
    </div>
</body>
</html>
"""

async def send_otp(receiver_email: str, otp: str, full_name: str) -> str:
    """Send OTP email to the user"""
    try:
        # Here you would integrate with your email service
        logger.info(f"Sending OTP {otp} to {receiver_email}")
        
        # Create HTML content with a beautiful template
        html_body = otp_template.replace("{otp}", otp).replace("{full_name}", full_name)

        # Create plain text version for email clients that don't support HTML
        plain_body = f"Your OTP verification code is: {otp}. This code will expire in 10 minutes."
        
        message = MIMEMultipart("alternative")
        message["From"] = settings.EMAIL_USER
        message["To"] = receiver_email
        message["Subject"] = "Verify Your SprintSync Email Address"

        # Attach both plain text and HTML versions
        message.attach(MIMEText(plain_body, "plain"))
        message.attach(MIMEText(html_body, "html"))
        
        with smtplib.SMTP(settings.EMAIL_HOST, settings.EMAIL_PORT) as server:
            server.starttls()
            server.login(settings.EMAIL_USER, settings.EMAIL_PASSWORD)
            server.send_message(message)
        return "success"
    except Exception as e:
        logger.error(f"Failed to send OTP email to {receiver_email}: {e}")
        raise RuntimeError("Failed to send OTP email") from e
    

# send_otp("black4tiles@gmail.com", "123456", "Ram Singh")
