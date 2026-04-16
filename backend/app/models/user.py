from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, field_validator
from app.models.enums import UserRole
import logging

logger = logging.getLogger(__name__)

# User Schemas
class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=100)
    role: UserRole

class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=50)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not (any(c.islower() for c in value) and any(c.isupper() for c in value) and any(c.isdigit() for c in value) and any(c in "!@#$%^&*()-_=+[]{}|;:,.<>?/" for c in value)):
            raise ValueError("Password must contain at least one lowercase letter, one uppercase letter, one number, and at least one special character")
        return value
    

class UserUpdate(BaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    email: Optional[EmailStr] = None
    full_name: Optional[str] = Field(None, min_length=1, max_length=100)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    avatar_url: Optional[str] = None
    email_verified: Optional[bool] = None

class UserResponse(UserBase):
    id: int
    avatar_url: Optional[str] = None
    is_active: bool
    email_verified: bool
    last_login: Optional[datetime]
    created_at: datetime
    updated_at: datetime

class UserLogin(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(..., min_length=8, max_length=50)

class UserPasswordReset(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6)

class UserPasswordUpdate(BaseModel):
    current_password: str = Field(..., min_length=8, max_length=50)
    new_password: str = Field(..., min_length=8, max_length=50)

class UserPasswordResetWithPassword(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=8, max_length=50)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not (any(c.islower() for c in value) and any(c.isupper() for c in value) and any(c.isdigit() for c in value) and any(c in "!@#$%^&*()-_=+[]{}|;:,.<>?/" for c in value)):
            raise ValueError("Password must contain at least one lowercase letter, one uppercase letter, one number, and at least one special character")
        return value

class EmailChangeRequest(BaseModel):
    new_email: EmailStr

class EmailChangeOtpRequest(BaseModel):
    new_email: EmailStr
    password: str
    
class EmailChangeOtpVerification(BaseModel):
    new_email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6)

class EmailChangeWithPassword(BaseModel):
    new_email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6)
    current_password: str = Field(..., min_length=8, max_length=50)

class UsernameChangeRequest(BaseModel):
    new_username: str = Field(..., min_length=3, max_length=50)
    
    @field_validator("new_username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        import re
        if not re.match(r'^[a-zA-Z0-9_]+$', value):
            raise ValueError("Username can only contain letters, numbers, and underscores")
        return value

class AvatarUpdateRequest(BaseModel):
    avatar_url: str = Field(..., max_length=500)