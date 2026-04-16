from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
import aiomysql
from app.core.database import get_db_connection
from app.core.security import verify_token
from app.models.user import UserRole

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get current authenticated user"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Verify token
    payload = verify_token(credentials.credentials)
    if payload is None:
        raise credentials_exception
    
    user_id: int = payload.get("sub")
    if user_id is None:
        raise credentials_exception
    
    # Get user from database
    async with conn.cursor(aiomysql.DictCursor) as cursor:
        await cursor.execute(
            "SELECT * FROM users WHERE id = %s AND is_active = TRUE",
            (user_id,)
        )
        user = await cursor.fetchone()
        
        if user is None:
            raise credentials_exception
        
        return user

async def get_current_team_member(
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get current user's team member record"""
    async with conn.cursor(aiomysql.DictCursor) as cursor:
        await cursor.execute(
            """
            SELECT tm.*, u.full_name, u.email, u.role 
            FROM team_members tm
            JOIN users u ON tm.user_id = u.id
            WHERE tm.user_id = %s
            """,
            (current_user["id"],)
        )
        team_member = await cursor.fetchone()
        
        if team_member is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team member record not found"
            )
        
        return team_member

def require_role(allowed_roles: list[UserRole]):
    """Dependency to check user role"""
    def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in [role.value for role in allowed_roles]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        return current_user
    return role_checker

# Role-specific dependencies
require_manager = require_role([UserRole.PM, UserRole.SM, UserRole.ADMIN])
require_admin = require_role([UserRole.ADMIN])

# Flexible assignment permission for team members who can manage assignments
def require_assignment_permission():
    """
    Allow task assignment for:
    - Managers (PM, SM, ADMIN)  
    - Team members (for unassigned tasks or when they are team leads)
    """
    def assignment_checker(current_user: dict = Depends(get_current_user)):
        # Managers have full permission
        if current_user["role"] in [UserRole.PM.value, UserRole.SM.value, UserRole.ADMIN.value]:
            return current_user
        
        # Team members have limited permission (checked at endpoint level)
        if current_user["role"] == UserRole.TEAM_MEMBER.value:
            return current_user
        
        # No other roles allowed
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions to assign tasks"
        )
    return assignment_checker
