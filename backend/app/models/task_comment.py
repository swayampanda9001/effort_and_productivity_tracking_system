from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

class TaskCommentBase(BaseModel):
    comment_text: str = Field(..., min_length=1)
    comment_type: str = "general"
    is_internal: bool = False

class TaskCommentCreate(TaskCommentBase):
    task_id: int

class TaskCommentResponse(TaskCommentBase):
    id: int
    task_id: int
    user_id: int
    parent_comment_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    author_name: Optional[str] = None
    avatar_url: Optional[str] = None