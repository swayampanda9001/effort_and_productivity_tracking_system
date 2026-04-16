from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator
from app.models.enums import TaskStage
import logging

logger = logging.getLogger(__name__)

class EffortLogBase(BaseModel):
    log_date: date
    time_spent_hours: float = Field(..., gt=0, le=24)
    stage: TaskStage
    daily_update: str = Field(..., min_length=1)
    blockers: Optional[str] = None
    next_day_plan: str = Field(..., min_length=1)
    
    @field_validator('log_date')
    @classmethod
    def validate_log_date(cls, value: date) -> date:
        """Basic validation: log date cannot be in the future"""
        if value > date.today():
            raise ValueError('Log date cannot be in the future')
        return value
    
    @field_validator('time_spent_hours')
    @classmethod
    def validate_time_spent(cls, value: float) -> float:
        """Validate time spent is reasonable"""
        if value <= 0:
            raise ValueError('Time spent must be greater than 0')
        if value > 24:
            raise ValueError('Time spent cannot exceed 24 hours per day')
        return value
    
    @field_validator('daily_update', 'next_day_plan')
    @classmethod
    def validate_required_text_fields(cls, value: str) -> str:
        """Validate required text fields are not empty"""
        if not value or not value.strip():
            raise ValueError('This field cannot be empty')
        if len(value.strip()) < 1:
            raise ValueError('This field must contain at least 1 character')
        return value.strip()

class EffortLogCreate(EffortLogBase):
    task_id: int

class EffortLogUpdate(BaseModel):
    time_spent_hours: Optional[float] = Field(None, gt=0, le=24)
    stage: Optional[TaskStage] = None
    daily_update: Optional[str] = Field(None, min_length=1)
    blockers: Optional[str] = None
    next_day_plan: Optional[str] = Field(None, min_length=1)
    
    @field_validator('time_spent_hours')
    @classmethod
    def validate_time_spent(cls, value: Optional[float]) -> Optional[float]:
        """Validate time spent is reasonable"""
        if value is not None:
            if value <= 0:
                raise ValueError('Time spent must be greater than 0')
            if value > 24:
                raise ValueError('Time spent cannot exceed 24 hours per day')
        return value
    
    @field_validator('daily_update', 'next_day_plan')
    @classmethod
    def validate_text_fields(cls, value: Optional[str]) -> Optional[str]:
        """Validate text fields are not empty when provided"""
        if value is not None:
            if not value.strip():
                raise ValueError('This field cannot be empty')
            if len(value.strip()) < 1:
                raise ValueError('This field must contain at least 1 character')
            return value.strip()
        return value

class EffortLogResponse(EffortLogBase):
    id: int
    task_id: int
    team_member_id: int
    is_approved: Optional[bool] = False
    approved_by: Optional[int]
    approved_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

class EffortLogApproval(BaseModel):
    is_approved: bool
    comments: Optional[str] = None