from fastapi import APIRouter, HTTPException, status, Depends
import aiomysql
from typing import List
import json
from datetime import datetime
from app.models.user import UserResponse, UserUpdate
from app.models.team_member import TeamMemberResponse
from app.api.dependencies import get_current_user, get_db_connection
import logging

router = APIRouter()

logger = logging.getLogger(__name__)

@router.put("/add", response_model=dict)
async def add_team_members(
    users_update: List[UserUpdate],
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
) -> dict:
    """Send team joining requests to users"""
    try:
        if current_user["role"] not in ["pm", "sm"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to send team joining requests"
            )
        
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            sent_requests = []
            skipped_requests = []
            
            for user_update in users_update:
                # Check if user already exists
                await cursor.execute(
                    "SELECT id, full_name, email FROM users WHERE email = %s",
                    (user_update.email,)
                )
                existing_user = await cursor.fetchone()
                
                if not existing_user:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"User with email {user_update.email} does not exist"
                    )
                
                # Check if team member record exists
                await cursor.execute(
                    "SELECT id, joining_requests, manager_id FROM team_members WHERE user_id = %s",
                    (existing_user["id"],)
                )
                existing_team_member = await cursor.fetchone()
                
                # Check if user is already in this manager's team
                if existing_team_member and existing_team_member["manager_id"] == current_user["id"]:
                    continue  # Skip if already in team
                
                # Create joining request object
                joining_request = {
                    "id": f"{current_user['id']}_{int(datetime.now().timestamp())}",
                    "manager_id": current_user["id"],
                    "manager_name": current_user["full_name"],
                    "request_date": datetime.now().isoformat(),
                    "status": "pending",
                    "message": f"You have been invited to join {current_user['full_name']}'s team."
                }
                
                request_sent = False
                
                if existing_team_member:
                    # Update existing team member's joining_requests
                    current_requests = existing_team_member["joining_requests"] or []
                    if isinstance(current_requests, str):
                        current_requests = json.loads(current_requests)
                    
                    # Check if request from this manager already exists
                    manager_request_exists = any(
                        req.get("manager_id") == current_user["id"] and req.get("status") == "pending"
                        for req in current_requests
                    )
                    
                    if not manager_request_exists:
                        current_requests.append(joining_request)
                        
                        await cursor.execute(
                            """
                            UPDATE team_members 
                            SET joining_requests = %s, updated_at = NOW() 
                            WHERE user_id = %s
                            """,
                            (json.dumps(current_requests), existing_user["id"])
                        )
                        request_sent = True
                    else:
                        # Request already exists, skip this user
                        skipped_requests.append({
                            "user_id": existing_user["id"],
                            "email": existing_user["email"],
                            "full_name": existing_user["full_name"],
                            "reason": "Request already pending from this manager"
                        })
                        continue
                else:
                    # Create new team member record with joining request
                    await cursor.execute(
                        """
                        INSERT INTO team_members (user_id, joining_requests, created_at, updated_at)
                        VALUES (%s, %s, NOW(), NOW())
                        """,
                        (existing_user["id"], json.dumps([joining_request]))
                    )
                    request_sent = True
                
                # Only create notification if request was actually sent
                if request_sent:
                    await cursor.execute(
                        """
                        INSERT INTO notifications (recipient_id, sender_id, type, title, message, data, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s, NOW())
                        """,
                        (
                            existing_user["id"],
                            current_user["id"],
                            "team_joining_request",
                            "Team Joining Request",
                            f"{current_user['full_name']} has invited you to join their team.",
                            json.dumps({
                                "request_id": joining_request["id"],
                                "manager_id": current_user["id"],
                                "manager_name": current_user["full_name"]
                            })
                        )
                    )
                
                # Only add to sent_requests if request was actually sent
                if request_sent:
                    sent_requests.append({
                        "user_id": existing_user["id"],
                        "user_name": existing_user["full_name"],
                        "email": user_update.email,
                        "request_id": joining_request["id"],
                        "status": "request_sent"
                    })

            await conn.commit()
            
            # Return both sent and skipped requests for better user feedback
            return {
                "sent_requests": sent_requests,
                "skipped_requests": skipped_requests,
                "total_processed": len(sent_requests) + len(skipped_requests)
            }

    except Exception as e:
        logger.error(f"Error sending team joining requests: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.get("/", response_model=List[dict])
async def get_team_members(
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
) -> List[dict]:
    """Get all team members"""
    try:
        if current_user["role"] not in ["pm", "sm"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to view team members"
            )

        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(
                """
                SELECT 
                    tm.id,
                    tm.user_id,
                    tm.employee_id,
                    tm.department,
                    tm.position,
                    tm.manager_id,
                    tm.hire_date,
                    tm.skills,
                    tm.productivity_score,
                    tm.total_completed_tasks,
                    tm.created_at,
                    tm.updated_at,
                    u.username, 
                    u.email, 
                    u.full_name, 
                    u.avatar_url,
                    u.role, 
                    u.is_active,
                    manager.full_name as manager_name,
                    -- Calculate active tasks (tasks assigned to team member that are not completed)
                    COALESCE(active_task_counts.active_count, 0) as active_tasks,
                    -- Calculate completed tasks (tasks assigned to team member that are completed)
                    COALESCE(completed_task_counts.completed_count, 0) as completed_tasks,
                    -- Total logged effort hours (calculated from effort_logs)
                    COALESCE(effort_stats.total_logged_hours, 0) as total_logged_hours
                FROM team_members tm
                JOIN users u ON tm.user_id = u.id
                LEFT JOIN users manager ON tm.manager_id = manager.id
                LEFT JOIN (
                    SELECT 
                        el.team_member_id,
                        SUM(el.time_spent_hours) as total_logged_hours
                    FROM effort_logs el
                    GROUP BY el.team_member_id
                ) effort_stats ON tm.id = effort_stats.team_member_id
                LEFT JOIN (
                    SELECT 
                        tm_sub.id as team_member_id,
                        COUNT(DISTINCT t.id) as active_count
                    FROM team_members tm_sub
                    JOIN task_assignments ta ON (
                        ta.is_active = TRUE 
                        AND ta.team_members IS NOT NULL 
                        AND ta.team_members != '{}'
                        AND (
                            JSON_CONTAINS(ta.team_members, CAST(tm_sub.id AS JSON), '$.developer') 
                            OR JSON_CONTAINS(ta.team_members, CAST(tm_sub.id AS JSON), '$.tester')
                            OR JSON_CONTAINS(ta.team_members, CAST(tm_sub.id AS JSON), '$.reviewer')
                            OR JSON_CONTAINS(ta.team_members, CAST(tm_sub.id AS JSON), '$.project_manager')
                            OR JSON_CONTAINS(ta.team_members, CAST(tm_sub.id AS JSON), '$.team_lead')
                        )
                    )
                    JOIN tasks t ON ta.task_id = t.id AND t.status NOT IN ('completed', 'cancelled')
                    GROUP BY tm_sub.id
                ) active_task_counts ON tm.id = active_task_counts.team_member_id
                LEFT JOIN (
                    SELECT 
                        tm_sub.id as team_member_id,
                        COUNT(DISTINCT t.id) as completed_count
                    FROM team_members tm_sub
                    JOIN task_assignments ta ON (
                        ta.is_active = TRUE 
                        AND ta.team_members IS NOT NULL 
                        AND ta.team_members != '{}'
                        AND (
                            JSON_CONTAINS(ta.team_members, CAST(tm_sub.id AS JSON), '$.developer') 
                            OR JSON_CONTAINS(ta.team_members, CAST(tm_sub.id AS JSON), '$.tester')
                            OR JSON_CONTAINS(ta.team_members, CAST(tm_sub.id AS JSON), '$.reviewer')
                            OR JSON_CONTAINS(ta.team_members, CAST(tm_sub.id AS JSON), '$.project_manager')
                            OR JSON_CONTAINS(ta.team_members, CAST(tm_sub.id AS JSON), '$.team_lead')
                        )
                    )
                    JOIN tasks t ON ta.task_id = t.id AND t.status = 'completed'
                    GROUP BY tm_sub.id
                ) completed_task_counts ON tm.id = completed_task_counts.team_member_id
                WHERE tm.manager_id = %s
                """,
                (current_user["id"],)
            )
            team_members = await cursor.fetchall()
            return team_members

    except Exception as e:
        logger.error(f"Error getting team members: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.get("/joining-requests", response_model=List[dict])
async def get_joining_requests(
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
) -> List[dict]:
    """Get pending joining requests for the current user"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(
                """
                SELECT joining_requests FROM team_members WHERE user_id = %s
                """,
                (current_user["id"],)
            )
            team_member = await cursor.fetchone()
            
            if not team_member or not team_member["joining_requests"]:
                return []
            
            requests = team_member["joining_requests"]
            if isinstance(requests, str):
                requests = json.loads(requests)
            
            # Filter only pending requests
            pending_requests = [req for req in requests if req.get("status") == "pending"]
            return pending_requests

    except Exception as e:
        logger.error(f"Error getting joining requests: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.post("/joining-requests/{request_id}/accept")
async def accept_joining_request(
    request_id: str,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
) -> dict:
    """Accept a team joining request"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get current team member record
            await cursor.execute(
                """
                SELECT id, joining_requests, manager_id FROM team_members WHERE user_id = %s
                """,
                (current_user["id"],)
            )
            team_member = await cursor.fetchone()
            
            if not team_member or not team_member["joining_requests"]:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No joining requests found"
                )
            
            requests = team_member["joining_requests"]
            if isinstance(requests, str):
                requests = json.loads(requests)
            
            # Find the specific request
            target_request = None
            for req in requests:
                if req.get("id") == request_id and req.get("status") == "pending":
                    target_request = req
                    break
            
            if not target_request:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Request not found or already processed"
                )
            
            # Update request status
            target_request["status"] = "accepted"
            target_request["accepted_date"] = datetime.now().isoformat()
            
            # Set manager_id and update joining_requests
            await cursor.execute(
                """
                UPDATE team_members 
                SET manager_id = %s, joining_requests = %s, updated_at = NOW()
                WHERE user_id = %s
                """,
                (target_request["manager_id"], json.dumps(requests), current_user["id"])
            )
            
            # Send notification to the manager
            await cursor.execute(
                """
                INSERT INTO notifications (recipient_id, sender_id, type, title, message, data, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                """,
                (
                    target_request["manager_id"],
                    current_user["id"],
                    "team_request_accepted",
                    "Team Joining Request Accepted",
                    f"{current_user['full_name']} has accepted your team joining request.",
                    json.dumps({
                        "team_member_id": current_user["id"],
                        "team_member_name": current_user["full_name"]
                    })
                )
            )
            
            await conn.commit()
            
            return {
                "message": "Joining request accepted successfully",
                "manager_name": target_request["manager_name"],
                "status": "accepted"
            }

    except Exception as e:
        logger.error(f"Error accepting joining request: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.post("/joining-requests/{request_id}/reject")
async def reject_joining_request(
    request_id: str,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
) -> dict:
    """Reject a team joining request"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get current team member record
            await cursor.execute(
                """
                SELECT id, joining_requests FROM team_members WHERE user_id = %s
                """,
                (current_user["id"],)
            )
            team_member = await cursor.fetchone()
            
            if not team_member or not team_member["joining_requests"]:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No joining requests found"
                )
            
            requests = team_member["joining_requests"]
            if isinstance(requests, str):
                requests = json.loads(requests)
            
            # Find the specific request
            target_request = None
            for req in requests:
                if req.get("id") == request_id and req.get("status") == "pending":
                    target_request = req
                    break
            
            if not target_request:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Request not found or already processed"
                )
            
            # Update request status
            target_request["status"] = "rejected"
            target_request["rejected_date"] = datetime.now().isoformat()
            
            # Update joining_requests
            await cursor.execute(
                """
                UPDATE team_members 
                SET joining_requests = %s, updated_at = NOW()
                WHERE user_id = %s
                """,
                (json.dumps(requests), current_user["id"])
            )
            
            # Send notification to the manager
            await cursor.execute(
                """
                INSERT INTO notifications (recipient_id, sender_id, type, title, message, data, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                """,
                (
                    target_request["manager_id"],
                    current_user["id"],
                    "team_request_rejected",
                    "Team Joining Request Rejected",
                    f"{current_user['full_name']} has rejected your team joining request.",
                    json.dumps({
                        "team_member_id": current_user["id"],
                        "team_member_name": current_user["full_name"]
                    })
                )
            )
            
            await conn.commit()
            
            return {
                "message": "Joining request rejected",
                "manager_name": target_request["manager_name"],
                "status": "rejected"
            }

    except Exception as e:
        logger.error(f"Error rejecting joining request: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.get("/{user_id}/sprint-productivity", response_model=List[dict])
async def get_team_member_sprint_productivity(
    user_id: int,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get productivity scores for a team member across all sprints"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # First, get the team_member record ID from user_id
            await cursor.execute(
                """
                SELECT id, productivity_score 
                FROM team_members 
                WHERE user_id = %s
                """,
                (user_id,)
            )
            team_member = await cursor.fetchone()

            print(team_member)
            
            if not team_member:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Team member not found"
                )
            
            overall_productivity = team_member["productivity_score"] or 0
            team_member_record_id = team_member["id"]
            
            # Get sprint-specific productivity scores
            await cursor.execute(
                """
                SELECT 
                    s.id as sprint_id,
                    s.name as sprint_name,
                    s.start_date,
                    s.end_date,
                    s.status,
                    COALESCE(sm.productivity_score, 0) as sprint_score
                FROM sprints s
                INNER JOIN sprint_members sm ON s.id = sm.sprint_id
                WHERE sm.team_member_id = %s
                ORDER BY s.start_date DESC
                """,
                (team_member_record_id,)
            )
            sprints = await cursor.fetchall()

            print(sprints)
            
            # Format the response
            result = []
            for sprint in sprints:
                result.append({
                    "sprint_id": sprint["sprint_id"],
                    "sprint_name": sprint["sprint_name"],
                    "start_date": sprint["start_date"].isoformat() if sprint["start_date"] else None,
                    "end_date": sprint["end_date"].isoformat() if sprint["end_date"] else None,
                    "status": sprint["status"],
                    "sprint_score": round(sprint["sprint_score"], 2) if sprint["sprint_score"] is not None else None,
                    "overall_score": round(overall_productivity, 2)
                })
            
            return result
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching sprint productivity for team member {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )


@router.get("/{user_id}/sprint/{sprint_id}/task-breakdown")
async def get_team_member_task_breakdown(
    user_id: int,
    sprint_id: int,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get detailed task-level productivity breakdown for a team member in a specific sprint"""
    try:
        # First, get the team_member_id from team_members table
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(
                "SELECT id FROM team_members WHERE user_id = %s",
                (user_id,)
            )
            team_member = await cursor.fetchone()
            
            if not team_member:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Team member not found"
                )
            
            team_member_id = team_member["id"]
            
            # Get all tasks assigned to this team member in the sprint
            # Using JSON_CONTAINS to check if team_member_id is in any role
            await cursor.execute(
                """
                SELECT DISTINCT
                    t.id as task_id,
                    t.title as task_title,
                    t.status,
                    t.priority,
                    t.stage,
                    t.estimated_effort_hours,
                    t.logged_effort_hours,
                    t.due_date,
                    t.completion_date,
                    t.created_at,
                    t.updated_at
                FROM tasks t
                INNER JOIN task_assignments ta ON t.id = ta.task_id
                WHERE t.sprint_id = %s
                AND ta.is_active = TRUE
                AND ta.team_members IS NOT NULL 
                AND ta.team_members != '{}'
                AND (
                    JSON_CONTAINS(ta.team_members, CAST(%s AS JSON), '$.developer') 
                    OR JSON_CONTAINS(ta.team_members, CAST(%s AS JSON), '$.tester')
                    OR JSON_CONTAINS(ta.team_members, CAST(%s AS JSON), '$.reviewer')
                    OR JSON_CONTAINS(ta.team_members, CAST(%s AS JSON), '$.project_manager')
                    OR JSON_CONTAINS(ta.team_members, CAST(%s AS JSON), '$.team_lead')
                )
                ORDER BY t.created_at DESC
                """,
                (sprint_id, team_member_id, team_member_id, team_member_id, team_member_id, team_member_id)
            )
            tasks = await cursor.fetchall()
            
            # Calculate productivity metrics for each task
            result = []
            for task in tasks:
                # Convert Decimal to float for calculations
                estimated_hours = float(task["estimated_effort_hours"])
                logged_hours = float(task["logged_effort_hours"])
                
                # Calculate time efficiency score for this task
                if task["status"] == "completed" and estimated_hours > 0:
                    time_ratio = logged_hours / estimated_hours
                    if time_ratio <= 0.8:
                        time_efficiency_score = 100
                    elif time_ratio <= 1.0:
                        time_efficiency_score = 100 - ((time_ratio - 0.8) / 0.2) * 20
                    elif time_ratio <= 1.2:
                        time_efficiency_score = 80 - ((time_ratio - 1.0) / 0.2) * 30
                    else:
                        time_efficiency_score = max(0, 50 - ((time_ratio - 1.2) * 25))
                else:
                    time_efficiency_score = 0
                
                # Calculate completion contribution (60% weight)
                # This represents the task's contribution to overall completion score
                completion_contribution = 0
                if task["status"] == "completed":
                    # Get total tasks in sprint for this team member
                    await cursor.execute(
                        """
                        SELECT COUNT(DISTINCT t.id) as total_tasks
                        FROM tasks t
                        INNER JOIN task_assignments ta ON t.id = ta.task_id
                        WHERE t.sprint_id = %s
                        AND ta.is_active = TRUE
                        AND ta.team_members IS NOT NULL 
                        AND ta.team_members != '{}'
                        AND (
                            JSON_CONTAINS(ta.team_members, CAST(%s AS JSON), '$.developer') 
                            OR JSON_CONTAINS(ta.team_members, CAST(%s AS JSON), '$.tester')
                            OR JSON_CONTAINS(ta.team_members, CAST(%s AS JSON), '$.reviewer')
                            OR JSON_CONTAINS(ta.team_members, CAST(%s AS JSON), '$.project_manager')
                            OR JSON_CONTAINS(ta.team_members, CAST(%s AS JSON), '$.team_lead')
                        )
                        """,
                        (sprint_id, team_member_id, team_member_id, team_member_id, team_member_id, team_member_id)
                    )
                    total_tasks_result = await cursor.fetchone()
                    total_tasks = total_tasks_result["total_tasks"] if total_tasks_result else 1
                    
                    # Each completed task contributes equally to the 60% completion weight
                    completion_contribution = (60.0 / total_tasks) if total_tasks > 0 else 0
                
                # Calculate effort logging score (5% weight)
                effort_logging_score = 0
                if estimated_hours > 0:
                    logging_ratio = logged_hours / estimated_hours
                    if logging_ratio >= 0.9:
                        effort_logging_score = 100
                    else:
                        effort_logging_score = (logging_ratio / 0.9) * 100
                
                # Check if completed on time
                is_completed_on_time = False
                days_difference = None
                if task["status"] == "completed" and task["completion_date"] and task["due_date"]:
                    completion_date = task["completion_date"]
                    due_date = task["due_date"]
                    days_difference = (completion_date - due_date).days
                    is_completed_on_time = days_difference <= 0
                
                result.append({
                    "task_id": task["task_id"],
                    "task_title": task["task_title"],
                    "status": task["status"],
                    "priority": task["priority"],
                    "stage": task["stage"],
                    "estimated_effort_hours": estimated_hours,
                    "logged_effort_hours": logged_hours,
                    "due_date": task["due_date"].isoformat() if task["due_date"] else None,
                    "completion_date": task["completion_date"].isoformat() if task["completion_date"] else None,
                    "time_efficiency_score": round(time_efficiency_score, 2),
                    "completion_contribution": round(completion_contribution, 2),
                    "effort_logging_score": round(effort_logging_score, 2),
                    "is_completed_on_time": is_completed_on_time,
                    "days_difference": abs(days_difference) if days_difference is not None else None
                })
            
            return result
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching task breakdown for team member {user_id} in sprint {sprint_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )
