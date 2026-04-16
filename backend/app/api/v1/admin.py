from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any
import aiomysql
from datetime import datetime, timedelta
from app.core.database import get_db_connection
from app.api.dependencies import get_current_user, require_admin
from app.services.productivity_service import ProductivityScoreCalculator
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/dashboard/stats")
async def get_admin_dashboard_stats(
    current_user: dict = Depends(require_admin),
    conn: aiomysql.Connection = Depends(get_db_connection)
) -> Dict[str, Any]:
    """Get comprehensive dashboard statistics for admin panel"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get total sprints
            await cursor.execute("SELECT COUNT(*) as count FROM sprints")
            total_sprints = (await cursor.fetchone())["count"]
            
            # Get total tasks
            await cursor.execute("SELECT COUNT(*) as count FROM tasks")
            total_tasks = (await cursor.fetchone())["count"]
            
            # Get completed tasks
            await cursor.execute("SELECT COUNT(*) as count FROM tasks WHERE status = 'completed'")
            completed_tasks = (await cursor.fetchone())["count"]
            
            # Get in-progress tasks
            await cursor.execute("SELECT COUNT(*) as count FROM tasks WHERE status = 'in_progress'")
            in_progress_tasks = (await cursor.fetchone())["count"]
            
            # Get total users
            await cursor.execute("SELECT COUNT(*) as count FROM users WHERE is_active = TRUE")
            total_users = (await cursor.fetchone())["count"]
            
            # Get active users (logged in within last 30 days)
            thirty_days_ago = datetime.now() - timedelta(days=30)
            await cursor.execute(
                "SELECT COUNT(*) as count FROM users WHERE is_active = TRUE AND last_login > %s",
                (thirty_days_ago,)
            )
            active_users = (await cursor.fetchone())["count"]
            
            return {
                "totalSprints": total_sprints,
                "totalTasks": total_tasks,
                "completedTasks": completed_tasks,
                "inProgressTasks": in_progress_tasks,
                "totalUsers": total_users,
                "activeUsers": active_users
            }
            
    except Exception as e:
        logger.error(f"Error fetching admin dashboard stats: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch dashboard statistics"
        )

@router.get("/sprints")
async def get_all_sprints_admin(
    current_user: dict = Depends(require_admin),
    conn: aiomysql.Connection = Depends(get_db_connection)
) -> List[Dict[str, Any]]:
    """Get all sprints with detailed information for admin panel"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            query = """
                SELECT 
                    s.*,
                    u.full_name as manager_name,
                    u.email as manager_email,
                    DATEDIFF(s.end_date, s.start_date) + 1 as duration,
                    (SELECT COUNT(*) FROM tasks WHERE sprint_id = s.id) as total_tasks,
                    (SELECT COUNT(*) FROM tasks WHERE sprint_id = s.id AND status = 'completed') as completed_tasks,
                    (SELECT COUNT(*) FROM sprint_members WHERE sprint_id = s.id) as total_members,
                    (SELECT COALESCE(SUM(time_spent_hours), 0) FROM effort_logs el 
                     JOIN tasks t ON el.task_id = t.id 
                     WHERE t.sprint_id = s.id) as logged_effort_hours
                FROM sprints s
                LEFT JOIN users u ON s.created_by = u.id
                ORDER BY s.created_at DESC
            """
            
            await cursor.execute(query)
            sprints = await cursor.fetchall()
            
            # Debug: Log what we're getting from database
            logger.info(f"Found {len(sprints)} sprints")
            for sprint in sprints[:2]:  # Log first 2 sprints for debugging
                logger.info(f"Sprint {sprint['id']}: name={sprint['name']}, "
                          f"start={sprint['start_date']}, end={sprint['end_date']}, "
                          f"duration={sprint.get('duration')}, "
                          f"total_tasks={sprint['total_tasks']}, "
                          f"completed_tasks={sprint['completed_tasks']}")
            
            # Calculate progress percentage for each sprint
            for sprint in sprints:
                # Ensure we have valid task counts
                sprint["total_tasks"] = sprint["total_tasks"] or 0
                sprint["completed_tasks"] = sprint["completed_tasks"] or 0
                
                if sprint["total_tasks"] > 0:
                    sprint["progress_percentage"] = round((sprint["completed_tasks"] / sprint["total_tasks"]) * 100, 2)
                else:
                    sprint["progress_percentage"] = 0
                
                # Fix duration if it's null or incorrect
                if not sprint.get("duration") or sprint["duration"] <= 0:
                    try:
                        start_date = sprint["start_date"]
                        end_date = sprint["end_date"]
                        if start_date and end_date:
                            # Ensure dates are date objects
                            if isinstance(start_date, str):
                                start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
                            if isinstance(end_date, str):
                                end_date = datetime.strptime(end_date, "%Y-%m-%d").date()
                            
                            sprint["duration"] = (end_date - start_date).days + 1
                        else:
                            sprint["duration"] = 1
                    except Exception as e:
                        logger.warning(f"Error calculating duration for sprint {sprint['id']}: {e}")
                        sprint["duration"] = 1
                
                # Calculate velocity (tasks completed per day) with better date handling
                try:
                    start_date = sprint["start_date"]
                    if isinstance(start_date, str):
                        start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
                    
                    current_date = min(datetime.now().date(), sprint["end_date"]) if sprint["end_date"] else datetime.now().date()
                    if isinstance(current_date, str):
                        current_date = datetime.strptime(current_date, "%Y-%m-%d").date()
                    
                    days_elapsed = max((current_date - start_date).days, 1)
                    sprint["velocity"] = round(sprint["completed_tasks"] / days_elapsed, 2)
                except Exception as e:
                    logger.warning(f"Error calculating velocity for sprint {sprint['id']}: {e}")
                    sprint["velocity"] = 0
                
                # Calculate burndown rate (remaining tasks per remaining days)
                try:
                    if sprint["end_date"]:
                        end_date = sprint["end_date"]
                        if isinstance(end_date, str):
                            end_date = datetime.strptime(end_date, "%Y-%m-%d").date()
                        
                        current_date = datetime.now().date()
                        remaining_days = max((end_date - current_date).days, 1)
                        remaining_tasks = sprint["total_tasks"] - sprint["completed_tasks"]
                        sprint["burndown_rate"] = round(remaining_tasks / remaining_days, 2) if remaining_days > 0 else 0
                    else:
                        sprint["burndown_rate"] = 0
                except Exception as e:
                    logger.warning(f"Error calculating burndown for sprint {sprint['id']}: {e}")
                    sprint["burndown_rate"] = 0
            
            return sprints
            
    except Exception as e:
        logger.error(f"Error fetching admin sprints: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch sprints data"
        )

@router.get("/sprints/{sprint_id}")
async def get_sprint_detail_admin(
    sprint_id: int,
    current_user: dict = Depends(require_admin),
    conn: aiomysql.Connection = Depends(get_db_connection)
) -> Dict[str, Any]:
    """Get detailed sprint information including members and tasks"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get sprint details
            await cursor.execute(
                """
                SELECT s.*, u.full_name as manager_name, u.email as manager_email
                FROM sprints s
                LEFT JOIN users u ON s.created_by = u.id
                WHERE s.id = %s
                """,
                (sprint_id,)
            )
            sprint = await cursor.fetchone()
            
            if not sprint:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Sprint not found"
                )
            
            # Get sprint members
            await cursor.execute(
                """
                SELECT 
                    sm.*,
                    u.username as user_name,
                    u.email as user_email,
                    u.full_name,
                    tm.position,
                    tm.department,
                    (SELECT COALESCE(SUM(time_spent_hours), 0) FROM effort_logs el 
                     JOIN tasks t ON el.task_id = t.id 
                     WHERE t.sprint_id = %s AND el.team_member_id = sm.team_member_id) as logged_hours
                FROM sprint_members sm
                JOIN team_members tm ON sm.team_member_id = tm.id
                JOIN users u ON tm.user_id = u.id
                WHERE sm.sprint_id = %s
                """,
                (sprint_id, sprint_id)
            )
            members = await cursor.fetchall()
            
            # Get sprint tasks
            await cursor.execute(
                """
                SELECT t.*, 
                       (SELECT u.full_name 
                        FROM task_assignments ta
                        LEFT JOIN team_members tm ON (
                            JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.developer'), CAST(tm.id AS JSON))
                            OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.tester'), CAST(tm.id AS JSON))
                            OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.reviewer'), CAST(tm.id AS JSON))
                            OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.project_manager'), CAST(tm.id AS JSON))
                            OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.team_lead'), CAST(tm.id AS JSON))
                        )
                        LEFT JOIN users u ON tm.user_id = u.id
                        WHERE ta.task_id = t.id AND ta.is_active = TRUE
                        LIMIT 1) as assigned_to_name
                FROM tasks t
                WHERE t.sprint_id = %s
                ORDER BY t.priority DESC, t.created_at ASC
                """,
                (sprint_id,)
            )
            tasks = await cursor.fetchall()
            
            return {
                "sprint": sprint,
                "members": members,
                "tasks": tasks
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching admin sprint detail: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch sprint details"
        )

@router.get("/tasks")
async def get_all_tasks_admin(
    current_user: dict = Depends(require_admin),
    conn: aiomysql.Connection = Depends(get_db_connection),
    status_filter: str = None,
    priority_filter: str = None,
    sprint_id: int = None
) -> List[Dict[str, Any]]:
    """Get all tasks with detailed information for admin panel"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Build query with filters
            where_conditions = []
            params = []
            
            if status_filter:
                where_conditions.append("t.status = %s")
                params.append(status_filter)
            
            if priority_filter:
                where_conditions.append("t.priority = %s")
                params.append(priority_filter)
            
            if sprint_id:
                where_conditions.append("t.sprint_id = %s")
                params.append(sprint_id)
            
            where_clause = " AND ".join(where_conditions)
            if where_clause:
                where_clause = "WHERE " + where_clause
            
            query = f"""
                SELECT 
                    t.*,
                    s.name as sprint_name,
                    ta.team_members as task_assignments,
                    (SELECT COALESCE(SUM(time_spent_hours), 0) FROM effort_logs WHERE task_id = t.id) as actual_hours
                FROM tasks t
                LEFT JOIN sprints s ON t.sprint_id = s.id
                LEFT JOIN task_assignments ta ON t.id = ta.task_id AND ta.is_active = TRUE
                {where_clause}
                ORDER BY t.created_at DESC
            """
            
            await cursor.execute(query, params)
            tasks = await cursor.fetchall()
            
            # Process tasks to extract assignee information from JSON assignments
            processed_tasks = []
            for task in tasks:
                task_dict = dict(task)
                
                # Extract assignee information from JSON assignments
                if task_dict.get('task_assignments'):
                    try:
                        import json
                        assignments = json.loads(task_dict['task_assignments']) if isinstance(task_dict['task_assignments'], str) else task_dict['task_assignments']
                        
                        # Get primary assignee (first developer or any first assignee)
                        assignee_id = None
                        if assignments and isinstance(assignments, dict):
                            # Try to get developer first, then any role
                            if 'developer' in assignments and assignments['developer']:
                                assignee_id = assignments['developer'][0]
                            else:
                                # Get first assignee from any role
                                for role, members in assignments.items():
                                    if members and isinstance(members, list):
                                        assignee_id = members[0]
                                        break
                        
                        # Get assignee details if we have an ID
                        if assignee_id:
                            await cursor.execute("""
                                SELECT u.id, u.full_name, u.email 
                                FROM team_members tm 
                                JOIN users u ON tm.user_id = u.id 
                                WHERE tm.id = %s
                            """, (assignee_id,))
                            assignee = await cursor.fetchone()
                            if assignee:
                                task_dict['assignee_id'] = assignee['id']
                                task_dict['assignee_name'] = assignee['full_name']
                                task_dict['assignee_email'] = assignee['email']
                            
                    except (json.JSONDecodeError, KeyError, TypeError) as e:
                        logger.warning(f"Error processing task assignments for task {task_dict['id']}: {str(e)}")
                
                # Clean up the task_assignments field as it's not needed in the response
                if 'task_assignments' in task_dict:
                    del task_dict['task_assignments']
                
                processed_tasks.append(task_dict)
            
            return processed_tasks
            
    except Exception as e:
        logger.error(f"Error fetching admin tasks: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch tasks data"
        )

@router.get("/analytics/task-status")
async def get_task_status_analytics(
    current_user: dict = Depends(require_admin),
    conn: aiomysql.Connection = Depends(get_db_connection)
) -> List[Dict[str, Any]]:
    """Get task status distribution for analytics"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(
                """
                SELECT 
                    status,
                    COUNT(*) as count,
                    ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM tasks)), 2) as percentage
                FROM tasks 
                GROUP BY status
                ORDER BY count DESC
                """
            )
            results = await cursor.fetchall()
            
            return [
                {
                    "name": result["status"].replace("_", " ").title(),
                    "value": result["count"],
                    "percentage": result["percentage"]
                }
                for result in results
            ]
            
    except Exception as e:
        logger.error(f"Error fetching task status analytics: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch task analytics"
        )

@router.get("/analytics/sprint-progress")
async def get_sprint_progress_analytics(
    current_user: dict = Depends(require_admin),
    conn: aiomysql.Connection = Depends(get_db_connection)
) -> List[Dict[str, Any]]:
    """Get sprint progress analytics"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(
                """
                SELECT 
                    s.name,
                    s.status,
                    (SELECT COUNT(*) FROM tasks WHERE sprint_id = s.id) as total_tasks,
                    (SELECT COUNT(*) FROM tasks WHERE sprint_id = s.id AND status = 'completed') as completed_tasks,
                    s.start_date,
                    s.end_date
                FROM sprints s
                ORDER BY s.start_date DESC
                LIMIT 10
                """
            )
            results = await cursor.fetchall()
            
            analytics_data = []
            for result in results:
                progress = 0
                if result["total_tasks"] > 0:
                    progress = round((result["completed_tasks"] / result["total_tasks"]) * 100, 2)
                
                analytics_data.append({
                    "name": result["name"],
                    "progress": progress,
                    "totalTasks": result["total_tasks"],
                    "completedTasks": result["completed_tasks"],
                    "status": result["status"]
                })
            
            return analytics_data
            
    except Exception as e:
        logger.error(f"Error fetching sprint progress analytics: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch sprint progress analytics"
        )

@router.get("/analytics/task-priority")
async def get_task_priority_analytics(
    current_user: dict = Depends(require_admin),
    conn: aiomysql.Connection = Depends(get_db_connection)
) -> List[Dict[str, Any]]:
    """Get task priority distribution for analytics"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(
                """
                SELECT 
                    priority,
                    COUNT(*) as count,
                    ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM tasks)), 2) as percentage
                FROM tasks 
                GROUP BY priority
                ORDER BY 
                    CASE priority
                        WHEN 'critical' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'medium' THEN 3
                        WHEN 'low' THEN 4
                        ELSE 5
                    END
                """
            )
            results = await cursor.fetchall()
            
            analytics_data = []
            for result in results:
                analytics_data.append({
                    "name": result["priority"].title(),
                    "value": result["count"],
                    "percentage": result["percentage"]
                })
            
            return analytics_data
            
    except Exception as e:
        logger.error(f"Error fetching task priority analytics: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch task priority analytics"
        )

@router.get("/analytics/sprint-status")
async def get_sprint_status_analytics(
    current_user: dict = Depends(require_admin),
    conn: aiomysql.Connection = Depends(get_db_connection)
) -> List[Dict[str, Any]]:
    """Get sprint status distribution for analytics"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(
                """
                SELECT 
                    status,
                    COUNT(*) as count,
                    ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM sprints)), 2) as percentage
                FROM sprints 
                GROUP BY status
                ORDER BY count DESC
                """
            )
            results = await cursor.fetchall()
            
            # Define colors for different sprint statuses
            status_colors = {
                'planning': '#FCD34D',    # Yellow
                'active': '#10B981',      # Green
                'completed': '#3B82F6',   # Blue
                'on_hold': '#F59E0B',     # Orange
                'cancelled': '#EF4444'    # Red
            }
            
            analytics_data = []
            for result in results:
                status_name = result["status"].replace("_", " ").title()
                analytics_data.append({
                    "name": status_name,
                    "value": result["count"],
                    "percentage": result["percentage"],
                    "fill": status_colors.get(result["status"], '#6B7280')
                })
            
            return analytics_data
            
    except Exception as e:
        logger.error(f"Error fetching sprint status analytics: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch sprint status analytics"
        )

@router.get("/tasks/{task_id}/analytics")
async def get_task_analytics(
    task_id: int,
    current_user: dict = Depends(require_admin),
    conn: aiomysql.Connection = Depends(get_db_connection)
) -> Dict[str, Any]:
    """Get comprehensive task analytics with charts and graphs for admin panel"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get basic task details
            await cursor.execute("""
                SELECT t.*, s.name as sprint_name
                FROM tasks t
                LEFT JOIN sprints s ON t.sprint_id = s.id
                WHERE t.id = %s
            """, (task_id,))
            task_result = await cursor.fetchone()
            
            # Get assigned members for this task
            await cursor.execute("""
                SELECT ta.team_members, u.full_name as assigned_to_name
                FROM task_assignments ta
                LEFT JOIN team_members tm ON (
                    JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.developer'), CAST(tm.id AS JSON))
                    OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.tester'), CAST(tm.id AS JSON))
                    OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.reviewer'), CAST(tm.id AS JSON))
                    OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.project_manager'), CAST(tm.id AS JSON))
                    OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.team_lead'), CAST(tm.id AS JSON))
                )
                LEFT JOIN users u ON tm.user_id = u.id
                WHERE ta.task_id = %s AND ta.is_active = TRUE
                LIMIT 1
            """, (task_id,))
            assignment_result = await cursor.fetchone()
            
            # Combine task and assignment data
            task = dict(task_result) if task_result else None
            if task and assignment_result:
                task['assigned_to_name'] = assignment_result.get('assigned_to_name')
            
            if not task:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Task not found"
                )
            
            # Get effort logs with analytics
            await cursor.execute("""
                SELECT el.log_date, el.time_spent_hours, el.stage, el.daily_update,
                       el.blockers, el.next_day_plan, u.full_name as team_member_name
                FROM effort_logs el
                JOIN team_members tm ON el.team_member_id = tm.id
                JOIN users u ON tm.user_id = u.id
                WHERE el.task_id = %s
                ORDER BY el.log_date ASC
            """, (task_id,))
            effort_logs = await cursor.fetchall()
            
            # Get comments
            await cursor.execute("""
                SELECT tc.comment_text, tc.comment_type, tc.created_at, u.full_name as user_name
                FROM task_comments tc
                JOIN users u ON tc.user_id = u.id
                WHERE tc.task_id = %s
                ORDER BY tc.created_at DESC
            """, (task_id,))
            comments = await cursor.fetchall()
            
            # Calculate time distribution by stage
            await cursor.execute("""
                SELECT stage, SUM(time_spent_hours) as total_hours
                FROM effort_logs
                WHERE task_id = %s
                GROUP BY stage
            """, (task_id,))
            time_distribution = await cursor.fetchall()
            
            # Calculate daily progress
            daily_progress = []
            total_logged = 0
            for log in effort_logs:
                total_logged += log['time_spent_hours']
                progress_percentage = (total_logged / task['estimated_effort_hours'] * 100) if task['estimated_effort_hours'] > 0 else 0
                daily_progress.append({
                    "date": log['log_date'].strftime('%Y-%m-%d'),
                    "hours_logged": log['time_spent_hours'],
                    "total_hours": total_logged,
                    "progress_percentage": round(progress_percentage, 1)
                })
            
            # Format time distribution for charts
            time_distribution_chart = [
                {
                    "name": item['stage'].replace('_', ' ').title(),
                    "value": float(item['total_hours']),
                    "fill": {
                        'analysis': '#8B5CF6',
                        'development': '#3B82F6', 
                        'testing': '#F59E0B',
                        'review': '#10B981',
                        'deployment': '#EF4444'
                    }.get(item['stage'], '#6B7280')
                }
                for item in time_distribution
            ]
            
            return {
                "task_detail": {
                    "id": task['id'],
                    "title": task['title'],
                    "description": task['description'],
                    "status": task['status'],
                    "priority": task['priority'],
                    "stage": task['stage'],
                    "estimated_effort_hours": task['estimated_effort_hours'],
                    "logged_effort_hours": task['logged_effort_hours'],
                    "progress_percentage": task['progress_percentage'],
                    "due_date": task['due_date'].strftime('%Y-%m-%d') if task['due_date'] else None,
                    "start_date": task['start_date'].strftime('%Y-%m-%d') if task['start_date'] else None,
                    "sprint_name": task['sprint_name'],
                    "assigned_to": {
                        "name": task['assigned_to_name']
                    } if task['assigned_to_name'] else None
                },
                "time_distribution": time_distribution_chart,
                "daily_progress": daily_progress,
                "effort_logs": [
                    {
                        "log_date": log['log_date'].strftime('%Y-%m-%d'),
                        "time_spent_hours": log['time_spent_hours'],
                        "stage": log['stage'],
                        "daily_update": log['daily_update'],
                        "blockers": log['blockers'],
                        "next_day_plan": log['next_day_plan'],
                        "team_member_name": log['team_member_name']
                    }
                    for log in effort_logs
                ],
                "comments": [
                    {
                        "comment_text": comment['comment_text'],
                        "comment_type": comment['comment_type'],
                        "created_at": comment['created_at'].strftime('%Y-%m-%d %H:%M:%S'),
                        "user_name": comment['user_name']
                    }
                    for comment in comments
                ]
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching task analytics for {task_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch task analytics"
        )

@router.get("/productivity/calculate/{team_member_id}")
async def calculate_productivity_score(
    team_member_id: int,
    days: int = 30,
    current_user: dict = Depends(require_admin),
    conn: aiomysql.Connection = Depends(get_db_connection)
) -> Dict[str, Any]:
    """Calculate comprehensive productivity score for a team member"""
    try:
        # Verify team member exists
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute("""
                SELECT tm.id, u.full_name, u.email
                FROM team_members tm
                JOIN users u ON tm.user_id = u.id
                WHERE tm.id = %s
            """, (team_member_id,))
            
            team_member = await cursor.fetchone()
            if not team_member:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Team member not found"
                )
        
        # Calculate productivity score
        score_data = await ProductivityScoreCalculator.calculate_comprehensive_score(
            conn, team_member_id, days
        )
        
        # Add team member info
        score_data.update({
            'team_member_name': team_member['full_name'],
            'team_member_email': team_member['email']
        })
        
        return score_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating productivity score for team member {team_member_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to calculate productivity score"
        )

@router.get("/productivity/leaderboard")
async def get_productivity_leaderboard(
    limit: int = None,
    current_user: dict = Depends(require_admin),
    conn: aiomysql.Connection = Depends(get_db_connection)
) -> List[Dict[str, Any]]:
    """Get productivity leaderboard - calculates scores dynamically for all team members"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get all active team members
            query = """
                SELECT 
                    tm.id,
                    u.full_name,
                    u.email,
                    tm.position,
                    tm.department,
                    tm.created_at
                FROM team_members tm
                JOIN users u ON tm.user_id = u.id
                WHERE u.is_active = TRUE
                ORDER BY tm.id
            """
            
            await cursor.execute(query)
            team_members = await cursor.fetchall()
            
            # Calculate productivity scores for each team member
            leaderboard = []
            for member in team_members:
                try:
                    # Calculate comprehensive score
                    score_data = await ProductivityScoreCalculator.calculate_comprehensive_score(
                        conn, member['id'], 30  # 30 days
                    )
                    
                    # Add member info and score with component breakdown
                    member_data = {
                        'id': member['id'],
                        'full_name': member['full_name'],
                        'email': member['email'],
                        'position': member['position'],
                        'department': member['department'],
                        'productivity_score': score_data['overall_score'],
                        'performance_level': score_data['performance_level'],
                        'performance_description': score_data.get('performance_description', ''),
                        'score_updated_at': datetime.now(),  # Current calculation time
                        # Include individual component scores for breakdown
                        'task_completion_rate': score_data['components']['task_completion_rate'],
                        'time_efficiency': score_data['components']['time_efficiency'],
                        'quality_score': score_data['components']['quality_score'],
                        'sprint_consistency': score_data['components']['sprint_velocity_consistency'],
                        'daily_logging_score': score_data['components']['daily_effort_logging'],
                        'is_new_member': score_data.get('is_new_member', False),
                        'days_active': score_data.get('days_active', 0)
                    }
                    
                    leaderboard.append(member_data)
                    
                except Exception as e:
                    logger.warning(f"Failed to calculate score for {member['full_name']}: {str(e)}")
                    # Add member with default score if calculation fails
                    member_data = {
                        'id': member['id'],
                        'full_name': member['full_name'],
                        'email': member['email'],
                        'position': member['position'],
                        'department': member['department'],
                        'productivity_score': 0,
                        'performance_level': 'requires_attention',
                        'performance_description': 'Score calculation failed',
                        'score_updated_at': datetime.now(),
                        # Default component scores
                        'task_completion_rate': 0,
                        'time_efficiency': 0,
                        'quality_score': 0,
                        'sprint_consistency': 0,
                        'daily_logging_score': 0,
                        'is_new_member': True,
                        'days_active': 0
                    }
                    leaderboard.append(member_data)
            
            # Sort by productivity score descending
            leaderboard.sort(key=lambda x: x['productivity_score'], reverse=True)
            
            # Apply limit if specified
            if limit is not None:
                leaderboard = leaderboard[:limit]
            
            return leaderboard
        
    except Exception as e:
        logger.error(f"Error fetching productivity leaderboard: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch productivity leaderboard"
        )

@router.get("/data-check")
async def check_database_data(
    current_user: dict = Depends(require_admin),
    conn: aiomysql.Connection = Depends(get_db_connection)
) -> Dict[str, Any]:
    """Check what data exists in the database"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Check sprints
            await cursor.execute("SELECT COUNT(*) as count FROM sprints")
            sprint_count = (await cursor.fetchone())["count"]
            
            # Check tasks and their sprint assignment
            await cursor.execute("""
                SELECT 
                    COUNT(*) as total_tasks,
                    COUNT(CASE WHEN sprint_id IS NOT NULL THEN 1 END) as tasks_with_sprint,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks
                FROM tasks
            """)
            task_info = await cursor.fetchone()
            
            # Check tasks by sprint
            await cursor.execute("""
                SELECT 
                    s.id as sprint_id,
                    s.name as sprint_name,
                    COUNT(t.id) as task_count,
                    COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_count
                FROM sprints s
                LEFT JOIN tasks t ON s.id = t.sprint_id
                GROUP BY s.id, s.name
                ORDER BY s.id
            """)
            sprint_task_info = await cursor.fetchall()
            
            # Check sample sprints with their calculated data
            await cursor.execute("""
                SELECT 
                    s.id, s.name, s.start_date, s.end_date,
                    DATEDIFF(s.end_date, s.start_date) + 1 as calculated_duration,
                    (SELECT COUNT(*) FROM tasks WHERE sprint_id = s.id) as total_tasks,
                    (SELECT COUNT(*) FROM tasks WHERE sprint_id = s.id AND status = 'completed') as completed_tasks
                FROM sprints s
                ORDER BY s.id
                LIMIT 5
            """)
            sample_sprints = await cursor.fetchall()
            
            return {
                'summary': {
                    'total_sprints': sprint_count,
                    'total_tasks': task_info['total_tasks'],
                    'tasks_with_sprint_assigned': task_info['tasks_with_sprint'],
                    'tasks_without_sprint': task_info['total_tasks'] - task_info['tasks_with_sprint'],
                    'completed_tasks': task_info['completed_tasks']
                },
                'sprint_task_breakdown': [
                    {
                        'sprint_id': row['sprint_id'],
                        'sprint_name': row['sprint_name'],
                        'total_tasks': row['task_count'],
                        'completed_tasks': row['completed_count']
                    }
                    for row in sprint_task_info
                ],
                'sample_sprints': [
                    {
                        'id': row['id'],
                        'name': row['name'],
                        'start_date': row['start_date'].isoformat() if row['start_date'] else None,
                        'end_date': row['end_date'].isoformat() if row['end_date'] else None,
                        'calculated_duration': row['calculated_duration'],
                        'total_tasks': row['total_tasks'],
                        'completed_tasks': row['completed_tasks']
                    }
                    for row in sample_sprints
                ]
            }
            
    except Exception as e:
        logger.error(f"Error in data check: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Data check failed: {str(e)}"
        )
