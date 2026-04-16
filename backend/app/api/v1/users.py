from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
import aiomysql
import json
import random
from datetime import datetime, timedelta
from app.core.database import get_db_connection
from app.core.security import get_password_hash, verify_password, create_access_token, verify_token
from app.core.config import settings
from app.models.user import (
    UserLogin, UserResponse, UserUpdate, UserPasswordUpdate,
    EmailChangeOtpRequest, EmailChangeOtpVerification,
    EmailChangeWithPassword, UsernameChangeRequest, AvatarUpdateRequest
)
from app.api.v1.r2storage import delete_file_from_r2
from app.models.enums import UserRole
from app.utils.send_mails import send_otp
import random
from datetime import datetime, timedelta
from app.models.team_member import TeamMemberResponse, TeamMemberUpdate
from app.api.dependencies import get_current_user, require_manager, require_admin
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/search", response_model=List[UserResponse])
async def search_users(
    q: str = Query(..., description="Search query for username or email"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    role: Optional[UserRole] = None,
    current_user: dict = Depends(require_manager),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Search users by name or email (managers only)"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Search in username, email, and full_name if it exists
            query = """
                SELECT * FROM users 
                WHERE is_active = TRUE AND role = 'team_member'
                AND (username LIKE %s OR email LIKE %s OR COALESCE(full_name, '') LIKE %s)
            """
            search_pattern = f"%{q}%"
            params = [search_pattern, search_pattern, search_pattern]
            
            logger.info(f"Searching users with query: {q}")
            
            if role:
                query += " AND role = %s"
                params.append(role.value)
            
            query += " ORDER BY created_at DESC LIMIT %s OFFSET %s"
            params.extend([limit, skip])
            
            await cursor.execute(query, params)
            users = await cursor.fetchall()
            
            logger.info(f"Found {len(users)} users matching query: {q}")
            return [UserResponse(**user) for user in users]
            
    except Exception as e:
        logger.error(f"Error searching users: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get user by ID"""
    # Users can only view their own profile unless they're managers
    if (current_user["id"] != user_id and 
        current_user["role"] not in ["pm", "sm", "admin"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(
                "SELECT * FROM users WHERE id = %s AND is_active = TRUE",
                (user_id,)
            )
            user = await cursor.fetchone()
            
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found"
                )
            
            return UserResponse(**user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Update user"""
    # Users can only update their own profile unless they're admins
    if (current_user["id"] != user_id and current_user["role"] != "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Check if user exists
            await cursor.execute(
                "SELECT * FROM users WHERE id = %s",
                (user_id,)
            )
            user = await cursor.fetchone()
            
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found"
                )
            
            # Build update query
            update_fields = []
            params = []
            
            for field, value in user_update.dict(exclude_unset=True).items():
                if field == "role" and current_user["role"] != "admin":
                    continue  # Only admins can change roles
                
                update_fields.append(f"{field} = %s")
                params.append(value.value if hasattr(value, 'value') else value)
            
            if not update_fields:
                return UserResponse(**user)
            
            params.append(user_id)
            query = f"UPDATE users SET {', '.join(update_fields)}, updated_at = NOW() WHERE id = %s"
            
            await cursor.execute(query, params)
            await conn.commit()
            
            # Get updated user
            await cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            updated_user = await cursor.fetchone()
            
            return UserResponse(**updated_user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.get("/{user_id}/team-member", response_model=TeamMemberResponse)
async def get_team_member(
    user_id: int,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get team member details"""
    # Users can only view their own profile unless they're managers
    if (current_user["id"] != user_id and 
        current_user["role"] not in ["pm", "sm", "admin"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(
                """
                SELECT tm.*, u.username, u.email, u.full_name, u.role, u.is_active,
                       manager.full_name as manager_name
                FROM team_members tm
                JOIN users u ON tm.user_id = u.id
                LEFT JOIN users manager ON tm.manager_id = manager.id
                WHERE tm.user_id = %s
                """,
                (user_id,)
            )
            team_member = await cursor.fetchone()
            
            if not team_member:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Team member not found"
                )
            
            # Parse skills JSON string to list
            if team_member and team_member.get("skills"):
                if isinstance(team_member["skills"], str):
                    try:
                        team_member["skills"] = json.loads(team_member["skills"])
                    except json.JSONDecodeError:
                        team_member["skills"] = []
            
            return TeamMemberResponse(**team_member)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching team member for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.put("/{user_id}/team-member", response_model=TeamMemberResponse)
async def update_team_member(
    user_id: int,
    team_member_update: TeamMemberUpdate,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Update team member details"""
    # Users can only update their own profile unless they're managers
    if (current_user["id"] != user_id and 
        current_user["role"] not in ["pm", "sm", "admin"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Check if team member exists
            await cursor.execute(
                "SELECT * FROM team_members WHERE user_id = %s",
                (user_id,)
            )
            team_member = await cursor.fetchone()

            if not team_member:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Team member not found"
                )
            
            # Build update query
            update_fields = []
            params = []
            
            for field, value in team_member_update.dict(exclude_unset=True).items():
                if field == "skills" and value is not None:
                    value = json.dumps(value)

                if value is not None:
                    update_fields.append(f"{field} = %s")
                    params.append(value)

            if not update_fields:
                # Parse skills JSON string to list even if no updates
                if team_member and team_member.get("skills"):
                    if isinstance(team_member["skills"], str):
                        try:
                            team_member["skills"] = json.loads(team_member["skills"])
                        except json.JSONDecodeError:
                            team_member["skills"] = []
                return TeamMemberResponse(**team_member)
            
            params.append(user_id)
            query = f"UPDATE team_members SET {', '.join(update_fields)}, updated_at = NOW() WHERE user_id = %s"
            
            await cursor.execute(query, params)
            await conn.commit()
            
            # Get updated team member with user info
            await cursor.execute(
                """
                SELECT tm.*, u.username, u.email, u.full_name, u.role, u.is_active,
                       manager.full_name as manager_name
                FROM team_members tm
                JOIN users u ON tm.user_id = u.id
                LEFT JOIN users manager ON tm.manager_id = manager.id
                WHERE tm.user_id = %s
                """,
                (user_id,)
            )
            updated_team_member = await cursor.fetchone()
            
            # Parse skills JSON string to list
            if updated_team_member and updated_team_member.get("skills"):
                if isinstance(updated_team_member["skills"], str):
                    try:
                        updated_team_member["skills"] = json.loads(updated_team_member["skills"])
                    except json.JSONDecodeError:
                        updated_team_member["skills"] = []
            
            return TeamMemberResponse(**updated_team_member)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating team member for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )
    
@router.patch("/change-password", response_model=UserResponse)
async def change_password(
    password_data: UserPasswordUpdate,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Change user password"""

    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get user by ID first
            await cursor.execute(
                "SELECT * FROM users WHERE id = %s",
                (current_user["id"],)
            )
            user = await cursor.fetchone()

            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found"
                )

            # Verify current password
            if not verify_password(password_data.current_password, user["password_hash"]):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Current password is incorrect"
                )

            # Update password
            new_hashed_password = get_password_hash(password_data.new_password)
            await cursor.execute(
                "UPDATE users SET password_hash = %s WHERE id = %s",
                (new_hashed_password, current_user["id"])
            )
            await conn.commit()

            return UserResponse(**user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error changing password for user {current_user['id']}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.post("/request-email-change")
async def request_email_change(
    email_data: EmailChangeOtpRequest,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Request email change with OTP verification"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Verify current password
            if not verify_password(email_data.password, current_user["password_hash"]):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Current password is incorrect"
                )
            
            # Check if the new email is already in use
            await cursor.execute(
                "SELECT id FROM users WHERE email = %s AND id != %s",
                (email_data.new_email, current_user["id"])
            )
            existing_user = await cursor.fetchone()
            
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already in use by another account"
                )
            
            # Generate OTP
            otp = str(random.randint(100000, 999999))
            hashed_otp = create_access_token(
                data={
                    "otp": otp, 
                    "verification_type": "email_change",
                    "new_email": email_data.new_email
                },
                expires_delta=timedelta(minutes=settings.OTP_EXPIRATION_MINUTES)
            )
            
            # Update user with OTP for email change
            await cursor.execute(
                "UPDATE users SET hashed_otp = %s WHERE id = %s",
                (hashed_otp, current_user["id"])
            )
            await conn.commit()
            
            # Send OTP to the new email
            send_verification_code = await send_otp(email_data.new_email, otp, current_user["full_name"])
            if send_verification_code != "success":
                # Retry once
                await send_otp(email_data.new_email, otp, current_user["full_name"])
            
            return {
                "message": "OTP sent to your new email address. Please verify to complete the email change.",
                "success": True
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Request email change error: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to request email change. Please try again later."
        )

@router.post("/verify-email-change", response_model=UserResponse)
async def verify_email_change(
    verification_data: EmailChangeOtpVerification,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Verify OTP and change email"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Check if user has OTP for email change
            if not current_user["hashed_otp"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No email change request found"
                )
            
            # Verify OTP
            decrypted_data = verify_token(current_user["hashed_otp"])
            if (not decrypted_data or 
                decrypted_data.get("otp") != verification_data.otp or 
                decrypted_data.get("verification_type") != "email_change" or
                decrypted_data.get("new_email") != verification_data.new_email):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid or expired OTP"
                )
            
            # Check if the new email is still available
            await cursor.execute(
                "SELECT id FROM users WHERE email = %s AND id != %s",
                (verification_data.new_email, current_user["id"])
            )
            existing_user = await cursor.fetchone()
            
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email address is no longer available"
                )
            
            # Update user email and clear OTP
            await cursor.execute(
                "UPDATE users SET email = %s, hashed_otp = NULL, updated_at = NOW() WHERE id = %s",
                (verification_data.new_email, current_user["id"])
            )
            await conn.commit()
            
            # Get updated user
            await cursor.execute(
                "SELECT * FROM users WHERE id = %s",
                (current_user["id"],)
            )
            updated_user = await cursor.fetchone()
            
            return UserResponse(**updated_user)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Verify email change error: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify email change. Please try again later."
        )

@router.post("/change-username", response_model=UserResponse)
async def change_username(
    username_data: UsernameChangeRequest,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Change username without password verification"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Check if the new username is already in use
            await cursor.execute(
                "SELECT id FROM users WHERE username = %s AND id != %s",
                (username_data.new_username, current_user["id"])
            )
            existing_user = await cursor.fetchone()
            
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Username already exists"
                )
            
            # Update username
            await cursor.execute(
                "UPDATE users SET username = %s, updated_at = NOW() WHERE id = %s",
                (username_data.new_username, current_user["id"])
            )
            await conn.commit()
            
            # Get updated user
            await cursor.execute(
                "SELECT * FROM users WHERE id = %s",
                (current_user["id"],)
            )
            updated_user = await cursor.fetchone()
            
            return UserResponse(**updated_user)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Change username error: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to change username. Please try again later."
        )

@router.patch("/update-avatar-url", response_model=UserResponse)
async def update_avatar_url(
    avatar_data: AvatarUpdateRequest,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Update user avatar URL"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Update avatar URL
            await cursor.execute(
                "UPDATE users SET avatar_url = %s, updated_at = NOW() WHERE id = %s",
                (avatar_data.avatar_url, current_user["id"])
            )
            await conn.commit()
            if current_user["avatar_url"]:
                delete_file_from_r2(current_user["avatar_url"])
            # Get updated user
            await cursor.execute(
                "SELECT * FROM users WHERE id = %s",
                (current_user["id"],)
            )
            updated_user = await cursor.fetchone()

            return UserResponse(**updated_user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update avatar URL error: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update avatar URL. Please try again later."
        )