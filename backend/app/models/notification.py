from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator
from enum import Enum


class NotificationType(str, Enum):
    """Notification types for different events"""
    TASK_ASSIGNED = "task_assigned"
    TASK_COMPLETED = "task_completed"
    TASK_COMMENT = "task_comment"
    TASK_STATUS_CHANGED = "task_status_changed"
    SPRINT_ASSIGNED = "sprint_assigned"
    SPRINT_STATUS_CHANGED = "sprint_status_changed"
    SYSTEM_ALERT = "system_alert"
    DEADLINE_WARNING = "deadline_warning"
    EFFORT_LOG_REMINDER = "effort_log_reminder"
    TEAM_JOINING_REQUEST = "team_joining_request"
    TEAM_REQUEST_ACCEPTED = "team_request_accepted"
    TEAM_REQUEST_REJECTED = "team_request_rejected"


# Pydantic Models for API

class NotificationBase(BaseModel):
    """Base notification model"""
    type: NotificationType
    title: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)
    data: Optional[Dict[str, Any]] = None

    @field_validator('title')
    @classmethod
    def validate_title(cls, value: str) -> str:
        """Validate notification title"""
        if not value or not value.strip():
            raise ValueError('Title cannot be empty')
        return value.strip()

    @field_validator('message')
    @classmethod
    def validate_message(cls, value: str) -> str:
        """Validate notification message"""
        if not value or not value.strip():
            raise ValueError('Message cannot be empty')
        return value.strip()


class NotificationCreate(NotificationBase):
    """Model for creating notifications"""
    recipient_id: int
    sender_id: Optional[int] = None


class NotificationUpdate(BaseModel):
    """Model for updating notifications"""
    is_read: Optional[bool] = None
    read_at: Optional[datetime] = None


class NotificationResponse(NotificationBase):
    """Model for notification responses"""
    id: int
    recipient_id: int
    sender_id: Optional[int]
    is_read: bool
    created_at: datetime
    read_at: Optional[datetime]
    
    # Optional sender info
    sender_name: Optional[str] = None
    sender_email: Optional[str] = None

    class Config:
        from_attributes = True


class NotificationStats(BaseModel):
    """Model for notification statistics"""
    total_count: int
    unread_count: int
    read_count: int


class BulkNotificationCreate(BaseModel):
    """Model for creating bulk notifications"""
    recipient_ids: list[int]
    type: NotificationType
    title: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)
    data: Optional[Dict[str, Any]] = None
    sender_id: Optional[int] = None


class WebSocketMessage(BaseModel):
    """Model for WebSocket messages"""
    type: str = "notification"
    notification: NotificationResponse