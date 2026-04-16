from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
import aiomysql
import json
from app.core.database import get_db_connection
from app.models.task_comment import TaskCommentCreate, TaskCommentResponse
from app.api.dependencies import get_current_user
from app.services.notification_service import NotificationService
from app.core.websocket_manager import NotificationWebSocketHandler
from app.models.notification import NotificationType, NotificationCreate
import logging

# Setup logging
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/", response_model=TaskCommentResponse)
async def create_comment(
    comment_data: TaskCommentCreate,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Create a new task comment"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            try:
                # Check if task exists and user has access
                await cursor.execute("SELECT id FROM tasks WHERE id = %s", (comment_data.task_id,))
                task = await cursor.fetchone()
                
                if not task:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Task not found"
                    )
                
                # Check if team member has access to task
                if current_user["role"] == "team_member":
                    # Get user's team member ID
                    await cursor.execute(
                        "SELECT id FROM team_members WHERE user_id = %s",
                        (current_user["id"],)
                    )
                    team_member_record = await cursor.fetchone()
                    
                    if team_member_record:
                        team_member_id = team_member_record["id"]
                        
                        # Check if team member is assigned to this task
                        await cursor.execute(
                            """
                            SELECT 1 FROM task_assignments ta
                            WHERE ta.task_id = %s AND ta.team_members IS NOT NULL 
                            AND ta.team_members != '{}'
                            AND (
                                JSON_CONTAINS(ta.team_members, %s, '$.developer') 
                                OR JSON_CONTAINS(ta.team_members, %s, '$.tester')
                                OR JSON_CONTAINS(ta.team_members, %s, '$.reviewer')
                                OR JSON_CONTAINS(ta.team_members, %s, '$.project_manager')
                                OR JSON_CONTAINS(ta.team_members, %s, '$.team_lead')
                            )
                            """,
                            (comment_data.task_id, str(team_member_id), str(team_member_id), str(team_member_id), str(team_member_id), str(team_member_id))
                        )
                        assignment = await cursor.fetchone()
                    else:
                        assignment = None
                    
                    if not assignment:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Not assigned to this task"
                        )
                
                await cursor.execute(
                    """
                    INSERT INTO task_comments (task_id, user_id, comment_type, comment_text, is_internal)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (comment_data.task_id, current_user["id"], comment_data.comment_type,
                     comment_data.comment_text, comment_data.is_internal)
                )
                
                comment_id = cursor.lastrowid
                
                # Get task details for notifications
                await cursor.execute(
                    """
                    SELECT t.title, t.sprint_id, t.created_by
                    FROM tasks t
                    WHERE t.id = %s
                    """,
                    (comment_data.task_id,)
                )
                task_info = await cursor.fetchone()
                
                # Get assigned users from task_assignments JSON structure
                assigned_user_ids = set()
                await cursor.execute(
                    """
                    SELECT ta.team_members
                    FROM task_assignments ta
                    WHERE ta.task_id = %s AND ta.team_members IS NOT NULL
                    """,
                    (comment_data.task_id,)
                )
                assignment_result = await cursor.fetchone()
                
                if assignment_result and assignment_result['team_members']:
                    team_assignments = json.loads(assignment_result['team_members'])
                    
                    # Get all team member IDs from all roles
                    all_team_member_ids = set()
                    for role_members in team_assignments.values():
                        if isinstance(role_members, list):
                            all_team_member_ids.update(role_members)
                    
                    # Get user IDs for these team members
                    if all_team_member_ids:
                        placeholders = ','.join(['%s'] * len(all_team_member_ids))
                        await cursor.execute(
                            f"SELECT user_id FROM team_members WHERE id IN ({placeholders})",
                            list(all_team_member_ids)
                        )
                        user_results = await cursor.fetchall()
                        assigned_user_ids = {user['user_id'] for user in user_results}
                
                await conn.commit()
                
                # Send notifications to relevant users (not including the comment author)
                if task_info:
                    task_title = task_info["title"]
                    task_sprint_id = task_info["sprint_id"]
                    task_creator = task_info["created_by"]
                    notification_service = NotificationService()
                    
                    # Collect unique user IDs to notify (excluding the comment author)
                    users_to_notify = set()
                    
                    # Add task creator if different from comment author
                    if task_creator and task_creator != current_user["id"]:
                        users_to_notify.add(task_creator)
                    
                    # Add assigned team members if different from comment author
                    for user_id in assigned_user_ids:
                        if user_id != current_user["id"]:
                            users_to_notify.add(user_id)
                    
                    # Send notifications to all relevant users
                    for user_id in users_to_notify:
                        # Create notification data
                        notification_data = NotificationCreate(
                            recipient_id=user_id,
                            sender_id=current_user["id"],
                            type=NotificationType.TASK_COMMENT,
                            title="New Comment on Task",
                            message=f"New comment on task: {task_title}",
                            data={
                                "task_id": comment_data.task_id, 
                                "comment_id": comment_id,
                                "sprint_id": task_sprint_id
                            }
                        )
                        
                        created_notification = await notification_service.create_notification(notification_data, conn)
                        
                        # Send real-time notification using the created notification
                        await NotificationWebSocketHandler.send_notification(created_notification)
                
                # Get created comment with author name
                await cursor.execute(
                    """
                    SELECT tc.*, u.full_name as author_name
                    FROM task_comments tc
                    JOIN users u ON tc.user_id = u.id
                    WHERE tc.id = %s
                    """, 
                    (comment_id,)
                )
                comment = await cursor.fetchone()
                
                return TaskCommentResponse(**comment)
            except HTTPException:
                raise
            except Exception as e:
                await conn.rollback()
                logger.error(f"Database error in create_comment: {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="An error occurred while creating the comment"
                )
    except aiomysql.Error as e:
        logger.error(f"MySQL connection error in create_comment: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection error"
        )

@router.get("/task/{task_id}", response_model=List[TaskCommentResponse])
async def get_task_comments(
    task_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get comments for a task"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            try:
                # Check if task exists and user has access
                await cursor.execute("SELECT id FROM tasks WHERE id = %s", (task_id,))
                task = await cursor.fetchone()
                
                if not task:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Task not found"
                    )
                
                # Check if team member has access to task
                if current_user["role"] == "team_member":
                    # Get user's team member ID
                    await cursor.execute(
                        "SELECT id FROM team_members WHERE user_id = %s",
                        (current_user["id"],)
                    )
                    team_member_record = await cursor.fetchone()
                    
                    if team_member_record:
                        team_member_id = team_member_record["id"]
                        
                        # Check if team member is assigned to this task
                        await cursor.execute(
                            """
                            SELECT 1 FROM task_assignments ta
                            WHERE ta.task_id = %s AND ta.team_members IS NOT NULL 
                            AND ta.team_members != '{}'
                            AND (
                                JSON_CONTAINS(ta.team_members, %s, '$.developer') 
                                OR JSON_CONTAINS(ta.team_members, %s, '$.tester')
                                OR JSON_CONTAINS(ta.team_members, %s, '$.reviewer')
                                OR JSON_CONTAINS(ta.team_members, %s, '$.project_manager')
                                OR JSON_CONTAINS(ta.team_members, %s, '$.team_lead')
                            )
                            """,
                            (task_id, str(team_member_id), str(team_member_id), str(team_member_id), str(team_member_id), str(team_member_id))
                        )
                        assignment = await cursor.fetchone()
                    else:
                        assignment = None
                    
                    if not assignment:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Not assigned to this task"
                        )
                
                await cursor.execute(
                    """
                    SELECT tc.*, u.full_name as author_name, u.avatar_url
                    FROM task_comments tc
                    JOIN users u ON tc.user_id = u.id
                    WHERE tc.task_id = %s
                    ORDER BY tc.created_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    (task_id, limit, skip)
                )
                comments = await cursor.fetchall()
                
                return [TaskCommentResponse(**comment) for comment in comments]
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Database error in get_task_comments: {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="An error occurred while retrieving task comments"
                )
    except aiomysql.Error as e:
        logger.error(f"MySQL connection error in get_task_comments: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection error"
        )
