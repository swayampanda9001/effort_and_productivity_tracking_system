from pydantic import BaseModel
from typing import Optional
from app.models.user import UserResponse

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class TokenData(BaseModel):
    user_id: Optional[int] = None

class OtpRequest(BaseModel):
    email: Optional[str] = None
    otp: str