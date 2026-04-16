from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
import aiomysql
from app.core.database import get_db_connection
from app.models.sprint import (
    SprintCreate, SprintUpdate, SprintResponse, SprintStatus, SprintMemberDetail
)
from app.api.dependencies import get_current_user, require_manager
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/create", response_model=SprintResponse)
async def create_sprint(
    sprint_data: SprintCreate,
    current_user: dict = Depends(require_manager),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Create a new sprint"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Validate dates
            if sprint_data.end_date <= sprint_data.start_date:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="End date must be after start date"
                )
            
            # If creating an active sprint, set all other active sprints to on_hold
            if sprint_data.status == SprintStatus.ACTIVE:
                await cursor.execute(
                    """
                    UPDATE sprints 
                    SET status = %s, updated_at = NOW() 
                    WHERE status = %s
                    """,
                    (SprintStatus.ON_HOLD.value, SprintStatus.ACTIVE.value)
                )
                # logger.info("Set existing active sprints to on_hold before creating new active sprint")
            
            await cursor.execute(
                """
                INSERT INTO sprints (name, description, start_date, end_date, duration, status, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (sprint_data.name, sprint_data.description, sprint_data.start_date,
                 sprint_data.end_date, sprint_data.duration, sprint_data.status, current_user["id"])
            )
            
            sprint_id = cursor.lastrowid
            
            # Assign team members to the sprint if provided
            if sprint_data.sprint_members:
                for member in sprint_data.sprint_members:
                    # Verify team member exists
                    await cursor.execute("SELECT id FROM team_members WHERE id = %s", (member.team_member_id,))
                    team_member = await cursor.fetchone()

                    if team_member:
                        await cursor.execute(
                            """
                            INSERT INTO sprint_members (sprint_id, team_member_id, role_in_sprint)
                            VALUES (%s, %s, %s)
                            ON DUPLICATE KEY UPDATE role_in_sprint = %s
                            """,
                            (sprint_id, member.team_member_id, member.role, member.role)
                        )
            
            await conn.commit()
            
            # Get created sprint
            await cursor.execute("SELECT * FROM sprints WHERE id = %s", (sprint_id,))
            sprint = await cursor.fetchone()
            
            # Get sprint members for the created sprint
            await cursor.execute(
                """
                SELECT tm.id as team_member_id, sm.role_in_sprint as role
                FROM sprint_members sm
                JOIN team_members tm ON sm.team_member_id = tm.id
                WHERE sm.sprint_id = %s
                """,
                (sprint_id,)
            )
            members = await cursor.fetchall()
            
            # Convert to SprintMember format
            sprint_members = [{"team_member_id": member["team_member_id"], "role": member["role"]} for member in members]
            
            # Add sprint_members to sprint data
            sprint_dict = dict(sprint)
            sprint_dict["sprint_members"] = sprint_members
            
            return SprintResponse(**sprint_dict)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating sprint: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.get("/", response_model=List[SprintResponse])
async def get_sprints(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    status: Optional[SprintStatus] = None,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get all sprints"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Check if current user is a team member
            if current_user["role"] == "team_member":
                # Get team_member_id for the current user
                await cursor.execute(
                    "SELECT id FROM team_members WHERE user_id = %s",
                    (current_user["id"],)
                )
                team_member = await cursor.fetchone()
                
                if not team_member:
                    return []  # User is not a team member, return empty list
                
                # Get sprints where this team member is assigned
                query = """
                    SELECT DISTINCT s.* FROM sprints s
                    JOIN sprint_members sm ON s.id = sm.sprint_id
                    WHERE sm.team_member_id = %s
                """
                params = [team_member["id"]]
                
                if status:
                    query += " AND s.status = %s"
                    params.append(status.value)
                
                query += " ORDER BY s.created_at DESC LIMIT %s OFFSET %s"
                params.extend([limit, skip])
            else:
                # For managers/admins, show sprints they created
                query = "SELECT * FROM sprints WHERE created_by = %s"
                params = [current_user["id"]]

                if status:
                    query += " AND status = %s"
                    params.append(status.value)
                
                query += " ORDER BY created_at DESC LIMIT %s OFFSET %s"
                params.extend([limit, skip])
            
            await cursor.execute(query, params)
            sprints = await cursor.fetchall()
            
            # Fetch sprint members for each sprint
            sprint_responses = []
            for sprint in sprints:
                # Get sprint members for this sprint
                # also add total tasks and completed tasks
                await cursor.execute(
                    """
                    SELECT tm.id as team_member_id, u.full_name as team_member_name, sm.role_in_sprint as role,
                           tm.productivity_score as team_member_productivity_score,
                           sm.productivity_score as sprint_productivity_score
                    FROM sprint_members sm
                    JOIN team_members tm ON sm.team_member_id = tm.id
                    JOIN users u ON tm.user_id = u.id
                    WHERE sm.sprint_id = %s
                    """,
                    (sprint["id"],)
                )
                members = await cursor.fetchall()

                await cursor.execute(
                    """
                    SELECT COUNT(*) as total_tasks, 
                           SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
                           SUM(t.estimated_effort_hours) as total_estimated_hours,
                           SUM(t.logged_effort_hours) as total_logged_hours
                    FROM tasks t
                    WHERE t.sprint_id = %s
                    """,
                    (sprint["id"],)
                )
                task_stats = await cursor.fetchone()

                # Get effort logs for this sprint (actual logged hours)
                await cursor.execute(
                    """
                    SELECT SUM(el.time_spent_hours) as sprint_logged_hours
                    FROM effort_logs el
                    JOIN tasks t ON el.task_id = t.id
                    WHERE t.sprint_id = %s
                    """,
                    (sprint["id"],)
                )
                effort_stats = await cursor.fetchone()

                # Calculate metrics
                total_tasks = task_stats["total_tasks"] or 0
                completed_tasks = task_stats["completed_tasks"] or 0
                estimated_effort_hours = task_stats["total_estimated_hours"] or 0.0
                task_logged_hours = task_stats["total_logged_hours"] or 0.0
                actual_logged_hours = effort_stats["sprint_logged_hours"] or 0.0
                
                # Use actual logged hours from effort_logs table
                logged_effort_hours = actual_logged_hours
                
                # Calculate progress percentage based on task completion
                progress_percentage = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0.0
                
                # Calculate velocity (tasks completed per day)
                from datetime import datetime, date
                today = date.today()
                sprint_start = sprint["start_date"]
                
                if isinstance(sprint_start, str):
                    sprint_start = datetime.strptime(sprint_start, "%Y-%m-%d").date()
                
                days_elapsed = max((today - sprint_start).days, 1)  # At least 1 day
                velocity = completed_tasks / days_elapsed if days_elapsed > 0 else 0.0
                
                # Calculate burndown rate (effort logged per day)
                burndown_rate = logged_effort_hours / days_elapsed if days_elapsed > 0 else 0.0

                # Convert to SprintMember format
                sprint_members = [
                    {
                        "team_member_id": member["team_member_id"], 
                        "team_member_name": member["team_member_name"], 
                        "role": member["role"],
                        "team_member_productivity_score": member["team_member_productivity_score"],
                        "sprint_productivity_score": member["sprint_productivity_score"]
                    } for member in members
                ]

                # Add all calculated metrics to sprint data
                sprint_dict = dict(sprint)
                sprint_dict["sprint_members"] = sprint_members
                sprint_dict["total_tasks"] = total_tasks
                sprint_dict["completed_tasks"] = completed_tasks
                sprint_dict["estimated_effort_hours"] = estimated_effort_hours
                sprint_dict["planned_effort_hours"] = estimated_effort_hours  # Same as estimated for now
                sprint_dict["actual_effort_hours"] = logged_effort_hours  # Actual hours logged
                sprint_dict["logged_effort_hours"] = logged_effort_hours
                sprint_dict["progress_percentage"] = progress_percentage
                sprint_dict["velocity"] = velocity
                sprint_dict["burndown_rate"] = burndown_rate

                sprint_responses.append(SprintResponse(**sprint_dict))
            
            return sprint_responses
    except Exception as e:
        logger.error(f"Error fetching sprints: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.get("/{sprint_id}", response_model=SprintResponse)
async def get_sprint(
    sprint_id: int,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get sprint by ID"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute("SELECT * FROM sprints WHERE id = %s", (sprint_id,))
            sprint = await cursor.fetchone()
            
            if not sprint:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Sprint not found"
                )
            
            # Check access permissions
            has_access = False
            
            # Check if user created the sprint (managers/admins)
            if sprint["created_by"] == current_user["id"]:
                has_access = True
            
            # Check if user is a team member assigned to this sprint
            if not has_access and current_user["role"] == "team_member":
                # Get team_member_id for the current user
                await cursor.execute(
                    "SELECT id FROM team_members WHERE user_id = %s",
                    (current_user["id"],)
                )
                team_member = await cursor.fetchone()
                
                if team_member:
                    # Check if this team member is assigned to the sprint
                    await cursor.execute(
                        "SELECT id FROM sprint_members WHERE sprint_id = %s AND team_member_id = %s",
                        (sprint_id, team_member["id"])
                    )
                    sprint_membership = await cursor.fetchone()
                    
                    if sprint_membership:
                        has_access = True
            
            # If user doesn't have access, return 403 or 404
            if not has_access:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Sprint not found"  # Using 404 instead of 403 to not reveal sprint existence
                )
            
            # Get sprint members for this sprint
            await cursor.execute(
                """
                SELECT tm.id as team_member_id, u.full_name as team_member_name, u.avatar_url as avatar_url, sm.role_in_sprint as role,
                       tm.productivity_score as team_member_productivity_score,
                       sm.productivity_score as sprint_productivity_score
                FROM sprint_members sm
                JOIN team_members tm ON sm.team_member_id = tm.id
                JOIN users u ON tm.user_id = u.id
                WHERE sm.sprint_id = %s
                """,
                (sprint_id,)
            )
            members = await cursor.fetchall()

            # Get task statistics for this sprint
            await cursor.execute(
                """
                SELECT COUNT(*) as total_tasks, 
                       SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
                       SUM(t.estimated_effort_hours) as total_estimated_hours,
                       SUM(t.logged_effort_hours) as total_logged_hours
                FROM tasks t
                WHERE t.sprint_id = %s
                """,
                (sprint_id,)
            )
            task_stats = await cursor.fetchone()

            # Get effort logs for this sprint (actual logged hours)
            await cursor.execute(
                """
                SELECT SUM(el.time_spent_hours) as sprint_logged_hours
                FROM effort_logs el
                JOIN tasks t ON el.task_id = t.id
                WHERE t.sprint_id = %s
                """,
                (sprint_id,)
            )
            effort_stats = await cursor.fetchone()

            # Calculate metrics
            total_tasks = task_stats["total_tasks"] or 0
            completed_tasks = task_stats["completed_tasks"] or 0
            estimated_effort_hours = task_stats["total_estimated_hours"] or 0.0
            task_logged_hours = task_stats["total_logged_hours"] or 0.0
            actual_logged_hours = effort_stats["sprint_logged_hours"] or 0.0
            
            # Use actual logged hours from effort_logs table
            logged_effort_hours = actual_logged_hours
            
            # Calculate progress percentage based on task completion
            progress_percentage = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0.0
            
            # Calculate velocity (tasks completed per day)
            from datetime import datetime, date
            today = date.today()
            sprint_start = sprint["start_date"]
            
            if isinstance(sprint_start, str):
                sprint_start = datetime.strptime(sprint_start, "%Y-%m-%d").date()
            
            days_elapsed = max((today - sprint_start).days, 1)  # At least 1 day
            velocity = completed_tasks / days_elapsed if days_elapsed > 0 else 0.0
            
            # Calculate burndown rate (effort logged per day)
            burndown_rate = logged_effort_hours / days_elapsed if days_elapsed > 0 else 0.0
            
            # Convert to SprintMember format
            sprint_members = [
                {
                    "team_member_id": member["team_member_id"], 
                    "team_member_name": member["team_member_name"], 
                    "avatar_url": member["avatar_url"], 
                    "role": member["role"],
                    "team_member_productivity_score": member["team_member_productivity_score"],
                    "sprint_productivity_score": member["sprint_productivity_score"]
                } for member in members
            ]

            # Add all calculated metrics to sprint data
            sprint_dict = dict(sprint)
            sprint_dict["sprint_members"] = sprint_members
            sprint_dict["total_tasks"] = total_tasks
            sprint_dict["completed_tasks"] = completed_tasks
            sprint_dict["estimated_effort_hours"] = estimated_effort_hours
            sprint_dict["planned_effort_hours"] = estimated_effort_hours  # Same as estimated for now
            sprint_dict["actual_effort_hours"] = logged_effort_hours  # Actual hours logged
            sprint_dict["logged_effort_hours"] = logged_effort_hours
            sprint_dict["progress_percentage"] = progress_percentage
            sprint_dict["velocity"] = velocity
            sprint_dict["burndown_rate"] = burndown_rate
            
            return SprintResponse(**sprint_dict)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching sprint {sprint_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.put("/{sprint_id}", response_model=SprintResponse)
async def update_sprint(
    sprint_id: int,
    sprint_update: SprintUpdate,
    current_user: dict = Depends(require_manager),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Update sprint"""
    # logger.info(f"Updating sprint {sprint_id} with data: {sprint_update}")
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Check if sprint exists
            await cursor.execute("SELECT * FROM sprints WHERE id = %s", (sprint_id,))
            sprint = await cursor.fetchone()
            
            if not sprint:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Sprint not found"
                )
            
            # Build update query
            update_fields = []
            params = []
            
            for field, value in sprint_update.dict(exclude_unset=True).items():
                if field == "sprint_members":
                    continue  # Handle separately
                update_fields.append(f"{field} = %s")
                params.append(value.value if hasattr(value, 'value') else value)
            
            if update_fields:
                # Validate dates if both are being updated
                update_data = sprint_update.dict(exclude_unset=True)
                start_date = update_data.get("start_date", sprint["start_date"])
                end_date = update_data.get("end_date", sprint["end_date"])
                
                if end_date <= start_date:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="End date must be after start date"
                    )
                
                # Check if status is being changed to "active"
                if "status" in update_data and update_data["status"] == SprintStatus.ACTIVE:
                    # Set all other active sprints to "on_hold" before updating this one
                    await cursor.execute(
                        """
                        UPDATE sprints 
                        SET status = %s, updated_at = NOW() 
                        WHERE status = %s AND id != %s
                        """,
                        (SprintStatus.ON_HOLD.value, SprintStatus.ACTIVE.value, sprint_id)
                    )
                    # logger.info(f"Set other active sprints to on_hold before activating sprint {sprint_id}")
                
                params.append(sprint_id)
                query = f"UPDATE sprints SET {', '.join(update_fields)}, updated_at = NOW() WHERE id = %s"
                
                await cursor.execute(query, params)
            
            # Handle team member updates if provided
            if sprint_update.sprint_members is not None:
                # Remove all existing sprint members
                await cursor.execute("DELETE FROM sprint_members WHERE sprint_id = %s", (sprint_id,))
                
                # Add new sprint members
                for member in sprint_update.sprint_members:
                    # Verify team member exists
                    await cursor.execute("SELECT id FROM team_members WHERE id = %s", (member.team_member_id,))
                    team_member = await cursor.fetchone()
                    
                    if team_member:
                        await cursor.execute(
                            """
                            INSERT INTO sprint_members (sprint_id, team_member_id, role_in_sprint)
                            VALUES (%s, %s, %s)
                            """,
                            (sprint_id, member.team_member_id, member.role)
                        )
            
            await conn.commit()
            
            # Get updated sprint
            await cursor.execute("SELECT * FROM sprints WHERE id = %s", (sprint_id,))
            updated_sprint = await cursor.fetchone()
            
            # Get sprint members for the updated sprint
            await cursor.execute(
                """
                SELECT tm.id as team_member_id, sm.role_in_sprint as role
                FROM sprint_members sm
                JOIN team_members tm ON sm.team_member_id = tm.id
                WHERE sm.sprint_id = %s
                """,
                (sprint_id,)
            )
            members = await cursor.fetchall()
            
            # Convert to SprintMember format
            sprint_members = [{"team_member_id": member["team_member_id"], "role": member["role"]} for member in members]
            
            # Add sprint_members to updated sprint data
            sprint_dict = dict(updated_sprint)
            sprint_dict["sprint_members"] = sprint_members
            
            return SprintResponse(**sprint_dict)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating sprint {sprint_id}: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.delete("/{sprint_id}")
async def delete_sprint(
    sprint_id: int,
    current_user: dict = Depends(require_manager),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Delete sprint"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Check if sprint exists
            await cursor.execute("SELECT * FROM sprints WHERE id = %s", (sprint_id,))
            sprint = await cursor.fetchone()
            
            if not sprint:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Sprint not found"
                )
            
            # Check if sprint has tasks
            await cursor.execute("SELECT COUNT(*) as count FROM tasks WHERE sprint_id = %s", (sprint_id,))
            task_count = await cursor.fetchone()
            
            if task_count["count"] > 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot delete sprint with existing tasks"
                )
            
            await cursor.execute("DELETE FROM sprints WHERE id = %s", (sprint_id,))
            await conn.commit()
            
            return {"message": "Sprint deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting sprint {sprint_id}: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.get("/{sprint_id}/dashboard")
async def get_sprint_dashboard(
    sprint_id: int,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get sprint dashboard data"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get sprint details
            await cursor.execute("SELECT * FROM sprints WHERE id = %s", (sprint_id,))
            sprint = await cursor.fetchone()
            
            if not sprint:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Sprint not found"
                )
            
            # Get sprint tasks
            await cursor.execute(
                """
                SELECT t.*, u.full_name as assignee_name
                FROM tasks t
                LEFT JOIN task_assignments ta ON t.id = ta.task_id AND ta.assignment_type = 'primary' AND ta.is_active = TRUE
                LEFT JOIN team_members tm ON ta.team_member_id = tm.id
                LEFT JOIN users u ON tm.user_id = u.id
                WHERE t.sprint_id = %s
                ORDER BY t.priority DESC, t.due_date ASC
                """,
                (sprint_id,)
            )
            tasks = await cursor.fetchall()
            
            # Get team members
            await cursor.execute(
                """
                SELECT tm.*, u.full_name, u.email, sm.productivity_score as sprint_productivity
                FROM sprint_members sm
                JOIN team_members tm ON sm.team_member_id = tm.id
                JOIN users u ON tm.user_id = u.id
                WHERE sm.sprint_id = %s
                """,
                (sprint_id,)
            )
            team_members = await cursor.fetchall()
            
            # Get pending approvals count
            await cursor.execute(
                """
                SELECT COUNT(*) as count
                FROM effort_logs el
                JOIN tasks t ON el.task_id = t.id
                WHERE t.sprint_id = %s AND el.is_approved = FALSE
                """,
                (sprint_id,)
            )
            pending_approvals = await cursor.fetchone()
            
            return {
                "sprint": SprintResponse(**sprint),
                "tasks": tasks,
                "team_members": team_members,
                "pending_approvals": pending_approvals["count"]
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching sprint dashboard for {sprint_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )


@router.get("/{sprint_id}/sprint-members", response_model=List[SprintMemberDetail])
async def get_sprint_members(
    sprint_id: int,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get sprint members with their details"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Check if sprint exists first
            await cursor.execute("SELECT * FROM sprints WHERE id = %s", (sprint_id,))
            sprint = await cursor.fetchone()
            
            if not sprint:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Sprint not found"
                )
            
            # Check access permissions
            has_access = False
            
            # Check if user created the sprint (managers/admins)
            if sprint["created_by"] == current_user["id"]:
                has_access = True
            
            # Check if user is a team member assigned to this sprint
            if not has_access and current_user["role"] == "team_member":
                # Get team_member_id for the current user
                await cursor.execute(
                    "SELECT id FROM team_members WHERE user_id = %s",
                    (current_user["id"],)
                )
                team_member = await cursor.fetchone()
                
                if team_member:
                    # Check if this team member is assigned to the sprint
                    await cursor.execute(
                        "SELECT id FROM sprint_members WHERE sprint_id = %s AND team_member_id = %s",
                        (sprint_id, team_member["id"])
                    )
                    sprint_membership = await cursor.fetchone()
                    
                    if sprint_membership:
                        has_access = True
            
            # If user doesn't have access, return 403 or 404
            if not has_access:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Sprint not found"  # Using 404 instead of 403 to not reveal sprint existence
                )
            
            # Get sprint members with their user details
            await cursor.execute(
                """
                SELECT 
                    tm.id,
                    tm.user_id,
                    u.full_name,
                    u.avatar_url,
                    u.email,
                    sm.role_in_sprint as role,
                    tm.skills,
                    tm.productivity_score as team_member_productivity_score,
                    sm.productivity_score as sprint_productivity_score
                FROM sprint_members sm
                JOIN team_members tm ON sm.team_member_id = tm.id
                JOIN users u ON tm.user_id = u.id
                WHERE sm.sprint_id = %s
                ORDER BY u.full_name
                """,
                (sprint_id,)
            )
            members = await cursor.fetchall()
            
            # Format the response using SprintMemberDetail model
            sprint_members = []
            for member in members:
                sprint_members.append(SprintMemberDetail(
                    id=member["id"],
                    user_id=member["user_id"],
                    full_name=member["full_name"],
                    avatar_url=member["avatar_url"],
                    email=member["email"],
                    role=member["role"],
                    skills=member["skills"],
                    team_member_productivity_score=member["team_member_productivity_score"],
                    sprint_productivity_score=member["sprint_productivity_score"]
                ))

            return sprint_members
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching sprint members for {sprint_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )
