from datetime import date, datetime
from typing import Optional, List, Dict
from pydantic import BaseModel, Field
from app.models.enums import SprintStatus

class SprintMember(BaseModel):
    team_member_id: int
    team_member_name: Optional[str] = None
    role: str = "developer"
    avatar_url: Optional[str] = None
    team_member_productivity_score: Optional[int] = None
    sprint_productivity_score: Optional[int] = None


class SprintMemberDetail(BaseModel):
    """Detailed sprint member information with user details"""
    id: int
    user_id: int
    full_name: str
    avatar_url: Optional[str] = None
    email: str
    role: str
    skills: Optional[str] = None
    team_member_productivity_score: Optional[int] = None
    sprint_productivity_score: Optional[int] = None
    

class SprintBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    start_date: date
    end_date: date
    duration: int  # Duration in weeks
    status: Optional[SprintStatus] = None

class SprintCreate(SprintBase):
    sprint_members: Optional[List[SprintMember]] = []

class SprintUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    duration: Optional[int] = None
    status: Optional[SprintStatus] = None
    sprint_members: Optional[List[SprintMember]] = None

class SprintResponse(SprintBase):
    id: int
    duration: int
    status: SprintStatus
    estimated_effort_hours: float
    planned_effort_hours: Optional[float] = None
    actual_effort_hours: float
    logged_effort_hours: float
    total_tasks: int
    completed_tasks: int
    progress_percentage: float
    velocity: float
    burndown_rate: float
    created_by: int
    created_at: datetime
    updated_at: datetime
    sprint_members: Optional[List[SprintMember]] = []