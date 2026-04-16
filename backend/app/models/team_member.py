from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from app.models.user import UserResponse

class TeamMemberBase(BaseModel):
    employee_id: Optional[str] = Field(None, max_length=20)
    manager_id: Optional[int] = None
    department: Optional[str] = Field(None, max_length=50)
    position: Optional[str] = Field(None, max_length=100)
    hire_date: Optional[date] = None
    skills: Optional[List[str]] = []

class TeamMemberCreate(TeamMemberBase):
    user_id: int

class TeamMemberUpdate(TeamMemberBase):
    pass

class TeamMemberResponse(TeamMemberBase):
    id: int
    user_id: int
    productivity_score: int
    total_logged_hours: float
    total_completed_tasks: int
    active_tasks: Optional[int] = 0
    completed_tasks: Optional[int] = 0
    skills: Optional[List[str]] = []
    created_at: datetime
    updated_at: datetime
    user: Optional[UserResponse] = None
    manager_name: Optional[str] = None