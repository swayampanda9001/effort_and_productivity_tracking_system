from typing import List
from pydantic import BaseModel
from app.models.sprint import SprintResponse
from app.models.task import TaskResponse
from app.models.team_member import TeamMemberResponse

class DashboardStats(BaseModel):
    active_tasks: int
    completed_tasks: int
    total_logged_hours: float
    productivity_score: int
    sprint_progress: float

class SprintDashboard(BaseModel):
    sprint: SprintResponse
    tasks: List[TaskResponse]
    team_members: List[TeamMemberResponse]
    pending_approvals: int