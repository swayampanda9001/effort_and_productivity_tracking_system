from datetime import date, datetime
from typing import Optional, List, Dict
from pydantic import BaseModel, Field
from app.models.enums import TaskStatus, TaskStage, TaskPriority

class TeamMemberAssignment(BaseModel):
    team_member_id: int
    assignment_type: str = "primary"  # primary, secondary, reviewer

class TaskBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    priority: TaskPriority = TaskPriority.MEDIUM
    estimated_effort_hours: float = Field(..., gt=0)
    due_date: date
    stage: TaskStage = TaskStage.ANALYSIS
    tags: Optional[List[str]] = []
    external_id: Optional[str] = Field(None, max_length=100)
    external_source: Optional[str] = Field(None, max_length=50)
    external_url: Optional[str] = None

class TaskCreate(TaskBase):
    sprint_id: Optional[int] = None  # Optional for backlog tasks created without sprint assignment
    start_date: Optional[date] = None
    assigned_to: Optional[int] = None  # single team_member_id for backward compatibility
    assignments: Optional[List[TeamMemberAssignment]] = []  # multiple assignments

class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    stage: Optional[TaskStage] = None
    priority: Optional[TaskPriority] = None
    estimated_effort_hours: Optional[float] = Field(None, gt=0)
    progress_percentage: Optional[int] = Field(None, ge=0, le=100)
    due_date: Optional[date] = None
    tags: Optional[List[str]] = []
    external_id: Optional[str] = Field(None, max_length=100)
    external_source: Optional[str] = Field(None, max_length=50)
    external_url: Optional[str] = None
    assignments: Optional[List[TeamMemberAssignment]] = None  # update assignments

class TaskResponse(TaskBase):
    id: int
    sprint_id: Optional[int] = None  # Optional for backlog tasks
    status: TaskStatus
    stage: TaskStage
    logged_effort_hours: float
    actual_effort_hours: float
    progress_percentage: int
    start_date: Optional[date]
    completion_date: Optional[date]
    blockers_count: int
    created_by: int
    created_at: datetime
    updated_at: datetime
    assigned_to: Optional[int] = None  # team_member_id (primary assignee for backward compatibility)
    assigned_to_name: Optional[str] = None  # team member name for display
    avatar_url: Optional[str] = None  # team member avatar URL for display
    assignments: List[Dict] = []  # all assignments with details