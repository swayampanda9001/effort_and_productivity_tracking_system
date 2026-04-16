from enum import Enum

class UserRole(str, Enum):
    TEAM_MEMBER = "team_member"
    PM = "pm"
    SM = "sm"
    ADMIN = "admin"

class TaskStatus(str, Enum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    ON_HOLD = "on_hold"
    COMPLETED = "completed"
    OVERDUE = "overdue"
    BLOCKED = "blocked"
    CANCELLED = "cancelled"

class TaskStage(str, Enum):
    ANALYSIS = "analysis"
    DEVELOPMENT = "development"
    TESTING = "testing"
    REVIEW = "review"
    DEPLOYMENT = "deployment"

class TaskPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class SprintStatus(str, Enum):
    PLANNING = "planning"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    ON_HOLD = "on_hold"