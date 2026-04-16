from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
import aiomysql
from datetime import datetime
from pydantic import BaseModel
from app.core.database import get_db_connection
from app.api.dependencies import get_current_user, require_manager
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class AlertCreate(BaseModel):
    user_id: int
    task_id: Optional[int] = None
    alert_type: str  # 'task_due', 'task_overdue', 'custom', 'sprint_update', 'assignment', etc.
    alert_message: str
    priority: str = 'medium'  # 'low', 'medium', 'high', 'urgent'

class AlertResponse(BaseModel):
    id: int
    manager_id: Optional[int]
    user_id: int
    task_id: Optional[int]
    alert_type: str
    alert_message: str
    is_read: bool
    is_dismissed: bool
    priority: str
    created_at: datetime
    updated_at: datetime

@router.post("/", response_model=AlertResponse)
async def create_alert(
    alert_data: AlertCreate,
    current_user: dict = Depends(require_manager),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Create a new alert for a team member"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Verify the target user exists
            await cursor.execute("SELECT id FROM users WHERE id = %s", (alert_data.user_id,))
            user = await cursor.fetchone()
            
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Target user not found"
                )
            
            # If task_id is provided, verify the task exists
            if alert_data.task_id:
                await cursor.execute("SELECT id FROM tasks WHERE id = %s", (alert_data.task_id,))
                task = await cursor.fetchone()
                
                if not task:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Task not found"
                    )
            
            # Insert the alert
            await cursor.execute(
                """
                INSERT INTO alerts (manager_id, user_id, task_id, alert_type, alert_message, priority)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (current_user["id"], alert_data.user_id, alert_data.task_id, 
                 alert_data.alert_type, alert_data.alert_message, alert_data.priority)
            )
            
            alert_id = cursor.lastrowid
            await conn.commit()
            
            # Fetch the created alert
            await cursor.execute(
                """
                SELECT * FROM alerts WHERE id = %s
                """,
                (alert_id,)
            )
            alert = await cursor.fetchone()
            
            return AlertResponse(**alert)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating alert: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create alert"
        )

@router.get("/", response_model=List[AlertResponse])
async def get_user_alerts(
    is_read: Optional[bool] = None,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get alerts for the current user"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Build query based on filters
            where_clause = "WHERE user_id = %s AND is_dismissed = FALSE"
            params = [current_user["id"]]
            
            if is_read is not None:
                where_clause += " AND is_read = %s"
                params.append(is_read)
            
            query = f"""
                SELECT * FROM alerts 
                {where_clause}
                ORDER BY created_at DESC
            """
            
            await cursor.execute(query, params)
            alerts = await cursor.fetchall()
            
            return [AlertResponse(**alert) for alert in alerts]
            
    except Exception as e:
        logger.error(f"Error fetching user alerts: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch alerts"
        )

@router.put("/{alert_id}/read")
async def mark_alert_as_read(
    alert_id: int,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Mark an alert as read"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Verify the alert belongs to the current user
            await cursor.execute(
                "SELECT id FROM alerts WHERE id = %s AND user_id = %s",
                (alert_id, current_user["id"])
            )
            alert = await cursor.fetchone()
            
            if not alert:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Alert not found"
                )
            
            # Mark as read
            await cursor.execute(
                "UPDATE alerts SET is_read = TRUE, updated_at = NOW() WHERE id = %s",
                (alert_id,)
            )
            await conn.commit()
            
            return {"message": "Alert marked as read"}
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error marking alert as read: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to mark alert as read"
        )

@router.delete("/{alert_id}")
async def dismiss_alert(
    alert_id: int,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Dismiss an alert"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Verify the alert belongs to the current user
            await cursor.execute(
                "SELECT id FROM alerts WHERE id = %s AND user_id = %s",
                (alert_id, current_user["id"])
            )
            alert = await cursor.fetchone()
            
            if not alert:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Alert not found"
                )
            
            # Mark as dismissed
            await cursor.execute(
                "UPDATE alerts SET is_dismissed = TRUE, updated_at = NOW() WHERE id = %s",
                (alert_id,)
            )
            await conn.commit()
            
            return {"message": "Alert dismissed"}
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error dismissing alert: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to dismiss alert"
        )

@router.get("/reminder-counts/{task_id}")
async def get_task_reminder_count(
    task_id: int,
    current_user: dict = Depends(require_manager),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get the number of reminders sent for a specific task"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Count reminders sent for this task
            await cursor.execute(
                """
                SELECT COUNT(*) as reminder_count
                FROM alerts 
                WHERE task_id = %s AND alert_type = 'task_overdue' AND manager_id = %s
                """,
                (task_id, current_user["id"])
            )
            result = await cursor.fetchone()
            
            # Get the most recent reminder info
            await cursor.execute(
                """
                SELECT created_at, alert_message
                FROM alerts 
                WHERE task_id = %s AND alert_type = 'task_overdue' AND manager_id = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (task_id, current_user["id"])
            )
            latest_reminder = await cursor.fetchone()
            
            return {
                "task_id": task_id,
                "reminder_count": result["reminder_count"] if result else 0,
                "last_reminder_sent": latest_reminder["created_at"] if latest_reminder else None,
                "last_reminder_message": latest_reminder["alert_message"] if latest_reminder else None
            }
            
    except Exception as e:
        logger.error(f"Error getting reminder count for task {task_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get reminder count"
        )

@router.get("/reminder-counts/sprint/{sprint_id}")
async def get_sprint_reminder_counts(
    sprint_id: int,
    current_user: dict = Depends(require_manager),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get reminder counts for all tasks in a sprint"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get reminder counts for all tasks in the sprint
            await cursor.execute(
                """
                SELECT 
                    t.id as task_id,
                    t.title,
                    COUNT(a.id) as reminder_count,
                    MAX(a.created_at) as last_reminder_sent
                FROM tasks t
                LEFT JOIN alerts a ON t.id = a.task_id 
                    AND a.alert_type = 'task_overdue' 
                    AND a.manager_id = %s
                WHERE t.sprint_id = %s
                GROUP BY t.id, t.title
                ORDER BY reminder_count DESC, last_reminder_sent DESC
                """,
                (current_user["id"], sprint_id)
            )
            results = await cursor.fetchall()
            
            return [
                {
                    "task_id": row["task_id"],
                    "task_title": row["title"],
                    "reminder_count": row["reminder_count"],
                    "last_reminder_sent": row["last_reminder_sent"]
                }
                for row in results
            ]
            
    except Exception as e:
        logger.error(f"Error getting reminder counts for sprint {sprint_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get sprint reminder counts"
        )

@router.post("/overdue-task-reminder")
async def send_overdue_task_reminder(
    task_id: int,
    current_user: dict = Depends(require_manager),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Send an overdue task reminder to the assigned team member"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get task details and assigned team member
            await cursor.execute(
                """
                SELECT t.id, t.title, t.due_date, t.status, ta.team_member_id, 
                       tm.user_id, u.full_name
                FROM tasks t
                JOIN task_assignments ta ON t.id = ta.task_id AND ta.is_active = TRUE
                JOIN team_members tm ON ta.team_member_id = tm.id
                JOIN users u ON tm.user_id = u.id
                WHERE t.id = %s
                """,
                (task_id,)
            )
            task_info = await cursor.fetchone()
            
            if not task_info:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Task not found or not assigned to any team member"
                )
            
            # Calculate overdue days
            due_date = task_info["due_date"]
            today = datetime.now().date()
            overdue_days = (today - due_date).days
            
            if overdue_days <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Task is not overdue"
                )
            
            # Create alert message
            alert_message = f"Reminder: Task '{task_info['title']}' is {overdue_days} day(s) overdue. Due date was {due_date}. Please provide an update on the current status."
            
            # Determine priority based on overdue days
            if overdue_days > 7:
                priority = "urgent"
            elif overdue_days > 3:
                priority = "high"
            else:
                priority = "medium"
            
            # Insert the alert
            await cursor.execute(
                """
                INSERT INTO alerts (manager_id, user_id, task_id, alert_type, alert_message, priority)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (current_user["id"], task_info["user_id"], task_id, 
                 "task_overdue", alert_message, priority)
            )
            
            await conn.commit()
            
            # Get updated reminder count for this task
            await cursor.execute(
                """
                SELECT COUNT(*) as reminder_count
                FROM alerts 
                WHERE task_id = %s AND alert_type = 'task_overdue' AND manager_id = %s
                """,
                (task_id, current_user["id"])
            )
            count_result = await cursor.fetchone()
            
            return {
                "message": f"Overdue task reminder sent to {task_info['full_name']}",
                "task_title": task_info["title"],
                "overdue_days": overdue_days,
                "assignee": task_info["full_name"],
                "reminder_count": count_result["reminder_count"] if count_result else 1
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending overdue task reminder: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send overdue task reminder"
        )
