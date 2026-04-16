from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
import aiomysql
from pydantic import EmailStr
from app.core.database import get_db_connection
from app.core.security import verify_password, get_password_hash, create_access_token, verify_token
from app.core.config import settings
from app.models.user import UserCreate, UserPasswordReset, UserPasswordResetWithPassword, UserResponse, UserLogin
from app.models.auth import Token, OtpRequest
from app.api.dependencies import get_current_user
from app.utils.send_mails import send_otp
import logging
import random

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/register", response_model=Token)
async def register(
    user_data: UserCreate,
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Register a new user"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Check if username or email already exists
            await cursor.execute(
                "SELECT id FROM users WHERE username = %s OR email = %s",
                (user_data.username, user_data.email)
            )
            existing_user = await cursor.fetchone()
            
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Username or email already registered"
                )
            
            # Hash password and create user
            hashed_password = get_password_hash(user_data.password)

            otp = str(random.randint(100000, 999999))
            hashed_otp = create_access_token(
                data={"otp": otp, "verification_type": "email"},
                expires_delta=timedelta(minutes=settings.OTP_EXPIRATION_MINUTES)
            )
            
            await cursor.execute(
                """
                INSERT INTO users (username, email, password_hash, full_name, role, hashed_otp)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (user_data.username, user_data.email, hashed_password, 
                 user_data.full_name, user_data.role.value, hashed_otp)
            )
            
            user_id = cursor.lastrowid
            await conn.commit()

            # Send OTP email
            send_verification_code = await send_otp(user_data.email, otp, user_data.full_name)
            otp_sent_again = False
            if send_verification_code != "success" and otp_sent_again == False:
                otp_sent_again = True
                await send_otp(user_data.email, otp, user_data.full_name)

            await cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            user = await cursor.fetchone()

            access_token_expires = timedelta(days=settings.ACCESS_TOKEN_EXPIRE_DAYS)
            access_token = create_access_token(
                data={"sub": str(user_id)},
                expires_delta=access_token_expires
            )
            
            return Token(
                access_token=access_token,
                user=UserResponse(**user)
            )
    except HTTPException:
        # Re-raise HTTP exceptions to maintain the status code and detail
        raise
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to register user. Please try again later."
        )

@router.post("/login", response_model=Token)
async def login(
    user_credentials: UserLogin,
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Login user and return access token"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get user by username
            await cursor.execute(
                "SELECT * FROM users WHERE (username = %s OR email = %s) AND is_active = TRUE",
                (user_credentials.username, user_credentials.email)
            )
            user = await cursor.fetchone()
            
            if not user or not verify_password(user_credentials.password, user["password_hash"]):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Incorrect username or password",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            
            # Update last login
            await cursor.execute(
                "UPDATE users SET last_login = NOW() WHERE id = %s",
                (user["id"],)
            )
            await conn.commit()
            
            # Create access token
            access_token_expires = timedelta(days=settings.ACCESS_TOKEN_EXPIRE_DAYS)
            access_token = create_access_token(
                data={"sub": str(user["id"])},
                expires_delta=access_token_expires
            )
            print("Login successful")
            return Token(
                access_token=access_token,
                user=UserResponse(**user)
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed. Please try again later."
        )
    
@router.post("/verify-email-using-otp", response_model=UserResponse)
async def verify_email_using_otp(
    otp_data: OtpRequest,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Verify email using otp
            if not current_user["email_verified"] and current_user['hashed_otp']:
                decrypted_data = verify_token(current_user['hashed_otp'])
                if not decrypted_data or decrypted_data.get("otp") != otp_data.otp or decrypted_data.get("verification_type") != "email":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid or expired OTP"
                    )
                if decrypted_data.get("otp") == otp_data.otp:
                    # Mark email as verified
                    await cursor.execute(
                        "UPDATE users SET email_verified = TRUE, hashed_otp = NULL WHERE id = %s",
                        (current_user["id"],)
                    )
                    await conn.commit()
                    current_user["email_verified"] = True
                    current_user["hashed_otp"] = None
            return UserResponse(**current_user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Email verification error: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Email verification failed. Please try again later."
        )
    
@router.get("/resend-email-verification-otp", response_model=UserResponse)
async def resend_email_verification_otp(
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            if current_user["email_verified"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already verified"
                )
            
            # Generate new OTP
            otp = str(random.randint(100000, 999999))
            hashed_otp = create_access_token(
                data={"otp": otp, "verification_type": "email"},
                expires_delta=timedelta(minutes=settings.OTP_EXPIRATION_MINUTES)
            )
            
            # Update user with new OTP
            await cursor.execute(
                "UPDATE users SET hashed_otp = %s WHERE id = %s",
                (hashed_otp, current_user["id"])
            )
            await conn.commit()
            
            # Send OTP email
            send_verification_code = await send_otp(current_user["email"], otp, current_user["full_name"])
            if send_verification_code != "success":
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to send verification email"
                )
            
            return UserResponse(**current_user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Resend OTP error: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to resend OTP. Please try again later."
        )

@router.post("/send-password-reset-otp", response_model=dict)
async def send_password_reset_otp(
    data: dict,
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Handle forgot password request"""
    try:
        logger.info(f"Password reset requested for email: {data['email']}")
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get user by email
            await cursor.execute(
                "SELECT * FROM users WHERE email = %s AND is_active = TRUE",
                (data['email'],)
            )
            user = await cursor.fetchone()
            
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found"
                )
            
            # Generate OTP for password reset
            otp = str(random.randint(100000, 999999))
            hashed_otp = create_access_token(
                data={"otp": otp, "verification_type": "password_reset"},
                expires_delta=timedelta(minutes=settings.OTP_EXPIRATION_MINUTES)
            )
            
            # Update user with OTP
            await cursor.execute(
                "UPDATE users SET hashed_otp = %s WHERE id = %s",
                (hashed_otp, user["id"])
            )
            await conn.commit()
            
            # Send OTP email
            send_verification_code = await send_otp(user["email"], otp, user["full_name"])
            if send_verification_code != "success":
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to send verification email"
                )

            return {
                "success": True,
                "email": user["email"],
                "message": "OTP sent successfully. Please check your email."
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Forgot password error: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process forgot password request. Please try again later."
        )
    
@router.post("/verify-password-reset-otp")
async def verify_password_reset_otp(
    otp_data: UserPasswordReset,
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Verify password reset OTP"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get user by email
            await cursor.execute(
                "SELECT * FROM users WHERE email = %s AND is_active = TRUE",
                (otp_data.email,)
            )
            user = await cursor.fetchone()

            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found"
                )

            if not user["hashed_otp"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No OTP found for password reset"
                )
            
            decrypted_data = verify_token(user["hashed_otp"])
            if not decrypted_data or decrypted_data.get("otp") != otp_data.otp or decrypted_data.get("verification_type") != "password_reset":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid or expired OTP"
                )
            
            logger.info(f"OTP verified for password reset for user {user['id']}")
            
            return {
                "message": "OTP verified successfully. You can now reset your password.",
                "success": True
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Verify OTP error: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify OTP. Please try again later."
        )

@router.post("/reset-password")
async def reset_password(
    reset_data: UserPasswordResetWithPassword,
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Reset password with verified OTP"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get user by email
            await cursor.execute(
                "SELECT * FROM users WHERE email = %s AND is_active = TRUE",
                (reset_data.email,)
            )
            user = await cursor.fetchone()

            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found"
                )

            # Verify OTP one more time before password reset
            if not user["hashed_otp"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No valid OTP found for password reset"
                )
            
            decrypted_data = verify_token(user["hashed_otp"])
            if not decrypted_data or decrypted_data.get("otp") != reset_data.otp or decrypted_data.get("verification_type") != "password_reset":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid or expired OTP"
                )

            # Hash the new password
            new_hashed_password = get_password_hash(reset_data.new_password)
            
            # Update password and clear OTP
            await cursor.execute(
                "UPDATE users SET password_hash = %s, hashed_otp = NULL WHERE id = %s",
                (new_hashed_password, user["id"])
            )
            await conn.commit()
            
            logger.info(f"Password reset successfully for user {user['id']}")
            
            return {
                "message": "Password reset successfully",
                "success": True
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reset password error: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reset password. Please try again later."
        )
    

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Get current user information"""
    try:
        return UserResponse(**current_user)
    except Exception as e:
        logger.error(f"Error getting user info: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve user information."
        )

@router.post("/logout")
async def logout():
    """Logout user (client should remove token)"""
    try:
        return {"message": "Successfully logged out"}
    except Exception as e:
        logger.error(f"Logout error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Logout failed. Please try again."
        )