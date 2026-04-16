from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from datetime import date, datetime
import aiomysql
from app.core.database import get_db_connection
from app.models.effort_log import (
    EffortLogCreate, EffortLogUpdate, EffortLogResponse, 
    EffortLogApproval, TaskStage
)
from app.api.dependencies import get_current_user, get_current_team_member, require_manager
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

def validate_log_date(log_date, sprint_start_date):
    """
    Validate that log date is within allowed range.
    
    Rules:
    - Log date cannot be in the future (must be today or earlier)
    - Log date cannot be before the sprint start date
    
    Args:
        log_date: The date to validate (date object or string in YYYY-MM-DD format)
        sprint_start_date: The sprint start date (date or datetime object)
        
    Returns:
        date: The validated log date as a date object
        
    Raises:
        HTTPException: If log date is invalid
    """
    # Convert log_date to date object if it's a string
    if isinstance(log_date, str):
        log_date = datetime.strptime(log_date, "%Y-%m-%d").date()
    elif isinstance(log_date, datetime):
        log_date = log_date.date()
    
    # Check if log date is not in the future
    today = date.today()
    if log_date > today:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot log effort for future dates. Please select today or an earlier date."
        )
    
    # Check if log date is not before sprint start date
    if isinstance(sprint_start_date, datetime):
        sprint_start_date = sprint_start_date.date()
    
    if log_date < sprint_start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot log effort before sprint start date ({sprint_start_date}). Please select a date from {sprint_start_date} onwards."
        )
    
    return log_date

@router.post("/", response_model=EffortLogResponse)
async def create_effort_log(
    effort_log_data: EffortLogCreate,
    current_user: dict = Depends(get_current_user),
    team_member: dict = Depends(get_current_team_member),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Create a new effort log"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Check if task exists and user is assigned, also fetch sprint information
            await cursor.execute(
                """
                SELECT t.id, t.status, t.created_at, s.start_date as sprint_start_date, s.created_at as sprint_created_at
                FROM tasks t
                JOIN sprints s ON t.sprint_id = s.id
                WHERE t.id = %s
                """,
                (effort_log_data.task_id,)
            )
            task = await cursor.fetchone()
            
            if not task:
                logger.error(f"Task {effort_log_data.task_id} not found")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Task not found"
                )
            
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
                (effort_log_data.task_id, str(team_member["id"]), str(team_member["id"]), str(team_member["id"]), str(team_member["id"]), str(team_member["id"]))
            )
            assignment = await cursor.fetchone()
            
            if not assignment:
                logger.error(f"Team member {team_member['id']} not assigned to task {effort_log_data.task_id}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Task not found or not assigned to you"
                )
            
            # Check if task status allows effort logging
            if task["status"] in ["completed", "blocked", "cancelled"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot log effort for task with status '{task['status']}'. Effort logging is not allowed for completed, blocked, or cancelled tasks."
                )
            
            # Validate log date using sprint start date
            sprint_start_date = task["sprint_start_date"] or task["sprint_created_at"]
            validated_log_date = validate_log_date(effort_log_data.log_date, sprint_start_date)
            
            # Check if effort log already exists for this date
            await cursor.execute(
                """
                SELECT id FROM effort_logs 
                WHERE task_id = %s AND team_member_id = %s AND log_date = %s
                """,
                (effort_log_data.task_id, team_member["id"], validated_log_date)
            )
            existing_log = await cursor.fetchone()
            
            if existing_log:
                logger.error(f"Effort log already exists for task {effort_log_data.task_id} on {validated_log_date}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Effort log already exists for this date"
                )
            
            await cursor.execute(
                """
                INSERT INTO effort_logs (
                    task_id, team_member_id, log_date, time_spent_hours, stage, daily_update, blockers, next_day_plan
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (effort_log_data.task_id, team_member["id"], validated_log_date,
                 effort_log_data.time_spent_hours, effort_log_data.stage.value, effort_log_data.daily_update,
                 effort_log_data.blockers, effort_log_data.next_day_plan)
            )
            
            effort_log_id = cursor.lastrowid
            
            # Update the logged_effort_hours in the tasks table
            await cursor.execute(
                """
                UPDATE tasks 
                SET logged_effort_hours = (
                    SELECT COALESCE(SUM(time_spent_hours), 0) 
                    FROM effort_logs 
                    WHERE task_id = %s
                ),
                updated_at = NOW()
                WHERE id = %s
                """,
                (effort_log_data.task_id, effort_log_data.task_id)
            )
            
            await conn.commit()
            
            # Get created effort log
            await cursor.execute("SELECT * FROM effort_logs WHERE id = %s", (effort_log_id,))
            effort_log = await cursor.fetchone()
            
            return EffortLogResponse(**effort_log)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating effort log: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.get("/", response_model=List[EffortLogResponse])
async def get_effort_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    task_id: Optional[int] = None,
    team_member_id: Optional[int] = None,
    stage: Optional[TaskStage] = None,
    is_approved: Optional[bool] = None,
    log_date_from: Optional[date] = None,
    log_date_to: Optional[date] = None,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get effort logs with filters"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            query = "SELECT * FROM effort_logs WHERE 1=1"
            params = []
            
            # If user is team member, only show logs for tasks they are assigned to
            if current_user["role"] == "team_member":
                await cursor.execute(
                    "SELECT id FROM team_members WHERE user_id = %s",
                    (current_user["id"],)
                )
                user_team_member = await cursor.fetchone()
                
                if user_team_member:
                    team_member_id = user_team_member["id"]
                    # Show effort logs for all tasks where the user is assigned (any role)
                    query += """
                        AND task_id IN (
                            SELECT DISTINCT ta.task_id 
                            FROM task_assignments ta
                            WHERE ta.is_active = TRUE 
                            AND ta.team_members IS NOT NULL 
                            AND ta.team_members != '{}'
                            AND (
                                JSON_CONTAINS(ta.team_members, %s, '$.developer') 
                                OR JSON_CONTAINS(ta.team_members, %s, '$.tester')
                                OR JSON_CONTAINS(ta.team_members, %s, '$.reviewer')
                                OR JSON_CONTAINS(ta.team_members, %s, '$.project_manager')
                                OR JSON_CONTAINS(ta.team_members, %s, '$.team_lead')
                            )
                        )
                    """
                    params.extend([str(team_member_id)] * 5)
                else:
                    # User has no team member record, return empty
                    query += " AND 1=0"  # This will return no results
            
            if task_id:
                query += " AND task_id = %s"
                params.append(task_id)
            
            if team_member_id and current_user["role"] in ["pm", "sm", "admin"]:
                query += " AND team_member_id = %s"
                params.append(team_member_id)
            
            if stage:
                query += " AND stage = %s"
                params.append(stage.value)
            
            if is_approved is not None:
                query += " AND is_approved = %s"
                params.append(is_approved)
            
            if log_date_from:
                query += " AND log_date >= %s"
                params.append(log_date_from)
            
            if log_date_to:
                query += " AND log_date <= %s"
                params.append(log_date_to)
            
            query += " ORDER BY log_date DESC LIMIT %s OFFSET %s"
            params.extend([limit, skip])
            
            await cursor.execute(query, params)
            effort_logs = await cursor.fetchall()
            
            return [EffortLogResponse(**log) for log in effort_logs]
    except Exception as e:
        logger.error(f"Error fetching effort logs: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.get("/{effort_log_id}", response_model=EffortLogResponse)
async def get_effort_log(
    effort_log_id: int,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get effort log by ID"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute("SELECT * FROM effort_logs WHERE id = %s", (effort_log_id,))
            effort_log = await cursor.fetchone()
            
            if not effort_log:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Effort log not found"
                )
            
            # Check permissions for team members
            if current_user["role"] == "team_member":
                await cursor.execute(
                    """
                    SELECT 1 FROM effort_logs el
                    JOIN team_members tm ON el.team_member_id = tm.id
                    WHERE el.id = %s AND tm.user_id = %s
                    """,
                    (effort_log_id, current_user["id"])
                )
                ownership = await cursor.fetchone()
                
                if not ownership:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Not authorized to view this effort log"
                    )
            
            return EffortLogResponse(**effort_log)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching effort log {effort_log_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.put("/{effort_log_id}", response_model=EffortLogResponse)
async def update_effort_log(
    effort_log_id: int,
    effort_log_update: EffortLogUpdate,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Update effort log (only if not approved)"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get effort log with ownership check
            await cursor.execute(
                """
                SELECT el.* FROM effort_logs el
                JOIN team_members tm ON el.team_member_id = tm.id
                WHERE el.id = %s AND tm.user_id = %s
                """,
                (effort_log_id, current_user["id"])
            )
            effort_log = await cursor.fetchone()
            
            if not effort_log:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Effort log not found or not authorized"
                )
            
            # Check if already approved
            if effort_log["is_approved"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot update approved effort log"
                )
            
            # Build update query
            update_fields = []
            params = []
            
            for field, value in effort_log_update.dict(exclude_unset=True).items():
                update_fields.append(f"{field} = %s")
                params.append(value.value if hasattr(value, 'value') else value)
            
            if not update_fields:
                return EffortLogResponse(**effort_log)
            
            params.append(effort_log_id)
            query = f"UPDATE effort_logs SET {', '.join(update_fields)}, updated_at = NOW() WHERE id = %s"
            
            await cursor.execute(query, params)
            
            # Update the logged_effort_hours in the tasks table if time_spent_hours was modified
            if 'time_spent_hours' in effort_log_update.dict(exclude_unset=True):
                await cursor.execute(
                    """
                    UPDATE tasks 
                    SET logged_effort_hours = (
                        SELECT COALESCE(SUM(time_spent_hours), 0) 
                        FROM effort_logs 
                        WHERE task_id = %s
                    ),
                    updated_at = NOW()
                    WHERE id = %s
                    """,
                    (effort_log["task_id"], effort_log["task_id"])
                )
            
            await conn.commit()
            
            # Get updated effort log
            await cursor.execute("SELECT * FROM effort_logs WHERE id = %s", (effort_log_id,))
            updated_log = await cursor.fetchone()
            
            return EffortLogResponse(**updated_log)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating effort log {effort_log_id}: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.post("/{effort_log_id}/approve")
async def approve_effort_log(
    effort_log_id: int,
    approval_data: EffortLogApproval,
    current_user: dict = Depends(require_manager),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Approve or reject effort log"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Check if effort log exists
            await cursor.execute("SELECT * FROM effort_logs WHERE id = %s", (effort_log_id,))
            effort_log = await cursor.fetchone()
            
            if not effort_log:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Effort log not found"
                )
            
            # Update approval status
            if approval_data.is_approved:
                await cursor.execute(
                    """
                    UPDATE effort_logs 
                    SET is_approved = TRUE, approved_by = %s, approved_at = NOW(), updated_at = NOW()
                    WHERE id = %s
                    """,
                    (current_user["id"], effort_log_id)
                )
            else:
                # For rejection, we might want to add a comments system
                await cursor.execute(
                    """
                    UPDATE effort_logs 
                    SET is_approved = FALSE, approved_by = NULL, approved_at = NULL, updated_at = NOW()
                    WHERE id = %s
                    """,
                    (effort_log_id,)
                )
            
            await conn.commit()
            
            status_text = "approved" if approval_data.is_approved else "rejected"
            return {"message": f"Effort log {status_text} successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving effort log {effort_log_id}: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.get("/pending-approvals/")
async def get_pending_approvals(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    current_user: dict = Depends(require_manager),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get effort logs pending approval"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(
                """
                SELECT 
                    el.*,
                    t.title as task_title,
                    u.full_name as team_member_name,
                    u.email as team_member_email
                FROM effort_logs el
                JOIN tasks t ON el.task_id = t.id
                JOIN team_members tm ON el.team_member_id = tm.id
                JOIN users u ON tm.user_id = u.id
                WHERE el.is_approved = FALSE
                ORDER BY el.created_at ASC
                LIMIT %s OFFSET %s
                """,
                (limit, skip)
            )
            pending_logs = await cursor.fetchall()
            
            return pending_logs
    except Exception as e:
        logger.error(f"Error fetching pending approvals: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )
