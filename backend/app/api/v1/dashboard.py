# ```python file="backend/app/api/v1/dashboard.py"
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any
import aiomysql
from app.core.database import get_db_connection
from app.models.dashboard import DashboardStats, SprintDashboard
from app.api.dependencies import get_current_user, get_current_team_member
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/stats")
async def get_dashboard_stats(
    current_user: dict = Depends(get_current_user),
    team_member: dict = Depends(get_current_team_member),
    conn: aiomysql.Connection = Depends(get_db_connection)
) -> DashboardStats:
    """Get dashboard statistics for current user"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get active tasks count
            await cursor.execute(
                """
                SELECT COUNT(DISTINCT t.id) as count FROM tasks t
                JOIN task_assignments ta ON t.id = ta.task_id
                WHERE ta.team_members IS NOT NULL 
                AND (
                    JSON_CONTAINS(ta.team_members, %s, '$.developer') 
                    OR JSON_CONTAINS(ta.team_members, %s, '$.tester')
                    OR JSON_CONTAINS(ta.team_members, %s, '$.reviewer')
                    OR JSON_CONTAINS(ta.team_members, %s, '$.project_manager')
                    OR JSON_CONTAINS(ta.team_members, %s, '$.team_lead')
                )
                AND t.status NOT IN ('completed', 'cancelled')
                """,
                (str(team_member["id"]), str(team_member["id"]), str(team_member["id"]), str(team_member["id"]), str(team_member["id"]))
            )
            active_tasks = await cursor.fetchone()
            
            # Get completed tasks count
            await cursor.execute(
                """
                SELECT COUNT(DISTINCT t.id) as count FROM tasks t
                JOIN task_assignments ta ON t.id = ta.task_id
                WHERE ta.team_members IS NOT NULL 
                AND (
                    JSON_CONTAINS(ta.team_members, %s, '$.developer') 
                    OR JSON_CONTAINS(ta.team_members, %s, '$.tester')
                    OR JSON_CONTAINS(ta.team_members, %s, '$.reviewer')
                    OR JSON_CONTAINS(ta.team_members, %s, '$.project_manager')
                    OR JSON_CONTAINS(ta.team_members, %s, '$.team_lead')
                )
                AND t.status = 'completed'
                """,
                (str(team_member["id"]), str(team_member["id"]), str(team_member["id"]), str(team_member["id"]), str(team_member["id"]))
            )
            completed_tasks = await cursor.fetchone()
            
            # Get total logged hours
            await cursor.execute(
                "SELECT COALESCE(SUM(time_spent_hours), 0) as total FROM effort_logs WHERE team_member_id = %s",
                (team_member["id"],)
            )
            total_hours = await cursor.fetchone()
            
            # Get current sprint progress
            await cursor.execute(
                """
                SELECT s.progress_percentage
                FROM sprints s
                JOIN sprint_members sm ON s.id = sm.sprint_id
                WHERE sm.team_member_id = %s AND s.status = 'active'
                ORDER BY s.start_date DESC
                LIMIT 1
                """,
                (team_member["id"],)
            )
            sprint_progress = await cursor.fetchone()
            
            return DashboardStats(
                active_tasks=active_tasks["count"],
                completed_tasks=completed_tasks["count"],
                total_logged_hours=float(total_hours["total"]),
                productivity_score=team_member["productivity_score"],
                sprint_progress=float(sprint_progress["progress_percentage"]) if sprint_progress else 0.0
            )
    except Exception as e:
        logger.error(f"Error fetching dashboard stats for user {current_user['id']}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.get("/manager-stats")
async def get_manager_dashboard_stats(
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
) -> Dict[str, Any]:
    """Get manager dashboard statistics"""
    if current_user["role"] not in ["pm", "sm", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Manager access required"
        )
    
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get total tasks
            await cursor.execute("SELECT COUNT(*) as count FROM tasks")
            total_tasks = await cursor.fetchone()
            
            # Get completed tasks
            await cursor.execute("SELECT COUNT(*) as count FROM tasks WHERE status = 'completed'")
            completed_tasks = await cursor.fetchone()
            
            # Get active team members
            await cursor.execute(
                """
                SELECT COUNT(DISTINCT tm.id) as count 
                FROM team_members tm
                JOIN users u ON tm.user_id = u.id
                WHERE u.is_active = TRUE
                """
            )
            active_members = await cursor.fetchone()
            
            # Get average productivity
            await cursor.execute(
                """
                SELECT AVG(tm.productivity_score) as avg_score
                FROM team_members tm
                JOIN users u ON tm.user_id = u.id
                WHERE u.is_active = TRUE
                """
            )
            avg_productivity = await cursor.fetchone()
            
            # Get delay alerts (pending approvals + overdue tasks)
            await cursor.execute("SELECT COUNT(*) as count FROM effort_logs WHERE is_approved = FALSE")
            pending_approvals = await cursor.fetchone()
            
            await cursor.execute(
                "SELECT COUNT(*) as count FROM tasks WHERE due_date < CURDATE() AND status NOT IN ('completed', 'cancelled')"
            )
            overdue_tasks = await cursor.fetchone()
            
            return {
                "total_tasks": total_tasks["count"],
                "completed_tasks": completed_tasks["count"],
                "active_members": active_members["count"],
                "avg_productivity": round(float(avg_productivity["avg_score"] or 0)),
                "delay_alerts": pending_approvals["count"] + overdue_tasks["count"],
                "pending_approvals": pending_approvals["count"],
                "overdue_tasks": overdue_tasks["count"]
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching manager dashboard stats: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )