from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional, Dict
from datetime import datetime
from pydantic import BaseModel
import aiomysql
import json
from app.core.database import get_db_connection
from app.models.task import (
    TaskCreate, TaskUpdate, TaskResponse, TaskStatus, 
    TaskStage, TaskPriority
)
from app.api.dependencies import get_current_user, get_current_team_member, require_manager, require_assignment_permission
from app.services.notification_service import NotificationService
from app.core.websocket_manager import NotificationWebSocketHandler
from app.models.notification import NotificationType, NotificationCreate
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

async def get_task_assignments(cursor, task_ids: List[int]) -> Dict[int, List[Dict]]:
    """Helper function to get all assignments for given task IDs"""
    if not task_ids:
        return {}
    
    # Get all assignments for the tasks
    placeholders = ",".join(["%s"] * len(task_ids))
    await cursor.execute(
        f"""
        SELECT ta.task_id, ta.team_members, ta.assigned_at, ta.completed_by, ta.completion_timestamps
        FROM task_assignments ta
        WHERE ta.task_id IN ({placeholders}) AND ta.is_active = TRUE
        ORDER BY ta.task_id, ta.assigned_at
        """,
        task_ids
    )
    assignments_data = await cursor.fetchall()

    # logger.info(f"Fetched assignments data: {assignments_data}")
    
    # Group assignments by task_id and expand JSON data
    assignments_by_task = {}
    for assignment in assignments_data:
        task_id = assignment["task_id"]
        if task_id not in assignments_by_task:
            assignments_by_task[task_id] = []
        
        # Parse the JSON team_members data
        team_members_json = assignment["team_members"]
        completed_by_json = assignment.get("completed_by")
        if team_members_json:
            import json
            team_members_data = json.loads(team_members_json) if isinstance(team_members_json, str) else team_members_json
            
            # Extract team member IDs from all assignment types
            all_member_ids = set()
            for assignment_type, member_ids in team_members_data.items():
                all_member_ids.update(member_ids)
        
            task_completed_data = json.loads(completed_by_json) if isinstance(completed_by_json, str) and completed_by_json else []
            # Extract all completed member IDs from all roles
            task_completed_ids = set()
            if isinstance(task_completed_data, dict):
                for role, member_ids in task_completed_data.items():
                    if isinstance(member_ids, list):
                        task_completed_ids.update(member_ids)
            elif isinstance(task_completed_data, list):
                task_completed_ids = set(task_completed_data)
            # logger.info(f"Task {task_id} - All Member IDs: {all_member_ids}, Completed IDs: {task_completed_ids}")
            if all_member_ids:
                # Get team member details
                member_placeholders = ",".join(["%s"] * len(all_member_ids))
                await cursor.execute(
                    f"""
                    SELECT tm.id, u.full_name, u.avatar_url
                    FROM team_members tm
                    JOIN users u ON tm.user_id = u.id
                    WHERE tm.id IN ({member_placeholders})
                    """,
                    list(all_member_ids)
                )
                member_details = await cursor.fetchall()
                member_details_dict = {m["id"]: m for m in member_details}
                
                # Create assignment entries for each member and type
                for assignment_type, member_ids in team_members_data.items():
                    for member_id in member_ids:
                        if member_id in member_details_dict:
                            member_info = member_details_dict[member_id]
                            assignments_by_task[task_id].append({
                                "team_member_id": member_id,
                                "assignment_type": assignment_type,
                                "full_name": member_info["full_name"],
                                "avatar_url": member_info["avatar_url"],
                                "assigned_at": assignment["assigned_at"],
                                "completed": member_id in task_completed_ids,
                            })

        # Add completion tracking info if available
        # if completed_by_json:
        #     completed_by = json.loads(completed_by_json) if isinstance(completed_by_json, str) else completed_by_json
        #     assignments_by_task[task_id].append({
        #         "completed_by": completed_by
        #     })
        # if completion_timestamps_json:
        #     completion_timestamps = json.loads(completion_timestamps_json) if isinstance(completion_timestamps_json, str) else completion_timestamps_json
        #     assignments_by_task[task_id].append({
        #         "completion_timestamps": completion_timestamps
        #     })
        # logger.info(f"Assignments for task {task_id}: {assignments_by_task[task_id]}")
    return assignments_by_task

async def user_has_task_access(cursor, task_id: int, user_id: int) -> bool:
    """Check if user has access to a specific task (as team member)"""
    await cursor.execute(
        """
        SELECT ta.team_members 
        FROM task_assignments ta
        WHERE ta.task_id = %s AND ta.is_active = TRUE
        """,
        (task_id,)
    )
    assignment = await cursor.fetchone()
    
    if not assignment or not assignment["team_members"]:
        return False
    
    # Get user's team member ID
    await cursor.execute(
        """
        SELECT tm.id FROM team_members tm WHERE tm.user_id = %s
        """,
        (user_id,)
    )
    team_member = await cursor.fetchone()
    
    if not team_member:
        return False
    
    team_member_id = team_member["id"]
    
    # Parse JSON and check if user is assigned
    import json
    team_members_data = json.loads(assignment["team_members"]) if isinstance(assignment["team_members"], str) else assignment["team_members"]
    
    for assignment_type, member_ids in team_members_data.items():
        if team_member_id in member_ids:
            return True
    
    return False

@router.post("/", response_model=TaskResponse)
async def create_task(
    task_data: TaskCreate,
    current_user: dict = Depends(require_manager),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Create a new task"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Check if sprint exists (only if sprint_id is provided)
            if task_data.sprint_id:
                await cursor.execute("SELECT id FROM sprints WHERE id = %s", (task_data.sprint_id,))
                sprint = await cursor.fetchone()
                
                if not sprint:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Sprint not found"
                    )
            
            # Convert tags to JSON
            tags_json = json.dumps(task_data.tags) if task_data.tags else None

            await cursor.execute(
                """
                INSERT INTO tasks (sprint_id, title, description, priority, stage,
                                 estimated_effort_hours, start_date, due_date, tags, external_id, 
                                 external_source, external_url, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (task_data.sprint_id, task_data.title, task_data.description,
                 task_data.priority.value, task_data.stage.value, task_data.estimated_effort_hours,
                 task_data.start_date, task_data.due_date, tags_json, task_data.external_id, 
                 task_data.external_source, task_data.external_url, current_user["id"])
            )
            
            task_id = cursor.lastrowid
            
            # Handle assignments (both single and multiple)
            team_members_by_type = {}
            all_member_ids = set()
            
            # If assigned_to is provided (backward compatibility), add as developer
            if task_data.assigned_to:
                if "developer" not in team_members_by_type:
                    team_members_by_type["developer"] = []
                team_members_by_type["developer"].append(task_data.assigned_to)
                all_member_ids.add(task_data.assigned_to)
            
            # Add assignments from the new assignments field
            if task_data.assignments:
                for assignment in task_data.assignments:
                    assignment_type = assignment.assignment_type
                    member_id = assignment.team_member_id
                    
                    if assignment_type not in team_members_by_type:
                        team_members_by_type[assignment_type] = []
                    team_members_by_type[assignment_type].append(member_id)
                    all_member_ids.add(member_id)
            
            # Validate all team members exist if there are any assignments
            if all_member_ids:
                placeholders = ",".join(["%s"] * len(all_member_ids))
                await cursor.execute(
                    f"""
                    SELECT tm.id, tm.user_id FROM team_members tm 
                    JOIN users u ON tm.user_id = u.id 
                    WHERE tm.id IN ({placeholders}) AND u.is_active = TRUE
                    """,
                    list(all_member_ids)
                )
                valid_members = await cursor.fetchall()
                valid_member_ids = {m["id"] for m in valid_members}
                
                invalid_members = all_member_ids - valid_member_ids
                if invalid_members:
                    await conn.rollback()
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Team members {list(invalid_members)} not found or inactive"
                    )
                
                # Create task assignment with JSON data
                await cursor.execute(
                    """
                    INSERT INTO task_assignments (task_id, assigned_by, team_members)
                    VALUES (%s, %s, %s)
                    """,
                    (task_id, current_user["id"], json.dumps(team_members_by_type))
                )
                
                # Send notifications to all assigned users
                member_user_map = {m["id"]: m["user_id"] for m in valid_members}
                
                for assignment_type, member_ids in team_members_by_type.items():
                    for member_id in member_ids:
                        user_id = member_user_map.get(member_id)
                        if user_id:
                            # Create notification for task assignment
                            notification_service = NotificationService()
                            notification_data = NotificationCreate(
                                recipient_id=user_id,
                                sender_id=current_user["id"],
                                type=NotificationType.TASK_ASSIGNED,
                                title=f"New Task Assignment ({assignment_type.title()})",
                                message=f"You have been assigned to task: {task_data.title} as {assignment_type}",
                                data={"task_id": task_id, "sprint_id": task_data.sprint_id, "assignment_type": assignment_type}
                            )
                            created_notification = await notification_service.create_notification(notification_data, conn)
                            
                            # Send real-time notification using the created notification
                            await NotificationWebSocketHandler.send_notification(created_notification)
            
            await conn.commit()
            
            # Get created task with assignments using helper function
            await cursor.execute(
                """
                SELECT t.*, 
                       CASE WHEN ta.team_members IS NOT NULL 
                            THEN JSON_EXTRACT(ta.team_members, '$.developer[0]') 
                            ELSE NULL END as assigned_to,
                       CASE WHEN ta.team_members IS NOT NULL AND JSON_EXTRACT(ta.team_members, '$.developer[0]') IS NOT NULL
                            THEN (SELECT u.full_name FROM team_members tm JOIN users u ON tm.user_id = u.id 
                                  WHERE tm.id = JSON_EXTRACT(ta.team_members, '$.developer[0]'))
                            ELSE NULL END as assigned_to_name,
                       CASE WHEN ta.team_members IS NOT NULL AND JSON_EXTRACT(ta.team_members, '$.developer[0]') IS NOT NULL
                            THEN (SELECT u.avatar_url FROM team_members tm JOIN users u ON tm.user_id = u.id 
                                  WHERE tm.id = JSON_EXTRACT(ta.team_members, '$.developer[0]'))
                            ELSE NULL END as avatar_url
                FROM tasks t
                LEFT JOIN task_assignments ta ON t.id = ta.task_id AND ta.is_active = TRUE
                WHERE t.id = %s
                """, 
                (task_id,)
            )
            task = await cursor.fetchone()
            
            # Get all assignments for this task using helper function
            assignments_by_task = await get_task_assignments(cursor, [task_id])
            
            # Parse tags from JSON string back to list
            if task["tags"]:
                task["tags"] = json.loads(task["tags"])
            else:
                task["tags"] = []
            
            # Add assignments to task response
            task["assignments"] = assignments_by_task.get(task_id, [])
            
            return TaskResponse(**task)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating task: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.get("/", response_model=List[TaskResponse])
async def get_tasks(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    sprint_id: Optional[str] = None,
    status: Optional[TaskStatus] = None,
    stage: Optional[TaskStage] = None,
    priority: Optional[TaskPriority] = None,
    assignee_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get tasks with filters. Use sprint_id=null to get backlog tasks (no sprint assigned)"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Base query for all tasks
            base_query = """
                SELECT t.*,
                       CASE WHEN ta.team_members IS NOT NULL 
                            THEN JSON_EXTRACT(ta.team_members, '$.developer[0]') 
                            ELSE NULL END as assigned_to,
                       CASE WHEN ta.team_members IS NOT NULL AND JSON_EXTRACT(ta.team_members, '$.developer[0]') IS NOT NULL
                            THEN (SELECT u.full_name FROM team_members tm JOIN users u ON tm.user_id = u.id 
                                  WHERE tm.id = JSON_EXTRACT(ta.team_members, '$.developer[0]'))
                            ELSE NULL END as assigned_to_name,
                       CASE WHEN ta.team_members IS NOT NULL AND JSON_EXTRACT(ta.team_members, '$.developer[0]') IS NOT NULL
                            THEN (SELECT u.avatar_url FROM team_members tm JOIN users u ON tm.user_id = u.id 
                                  WHERE tm.id = JSON_EXTRACT(ta.team_members, '$.developer[0]'))
                            ELSE NULL END as avatar_url
                FROM tasks t
                LEFT JOIN task_assignments ta ON t.id = ta.task_id AND ta.is_active = TRUE
                WHERE 1=1
            """
            
            params = []
            
            # Add team member filtering for non-manager users
            if current_user["role"] == "team_member":
                # Get user's team member ID
                await cursor.execute(
                    "SELECT id FROM team_members WHERE user_id = %s",
                    (current_user["id"],)
                )
                team_member_record = await cursor.fetchone()
                
                if team_member_record:
                    team_member_id = team_member_record["id"]
                    
                    # For team members, only show tasks where they are assigned
                    # Use JSON_CONTAINS to check if team member ID exists in any role array
                    base_query += """
                        AND ta.team_members IS NOT NULL 
                        AND ta.team_members != '{}'
                        AND (
                            JSON_CONTAINS(ta.team_members, %s, '$.developer') 
                            OR JSON_CONTAINS(ta.team_members, %s, '$.tester')
                            OR JSON_CONTAINS(ta.team_members, %s, '$.reviewer')
                            OR JSON_CONTAINS(ta.team_members, %s, '$.project_manager')
                            OR JSON_CONTAINS(ta.team_members, %s, '$.team_lead')
                        )
                    """
                    # JSON_CONTAINS needs the value as a JSON array element
                    params.extend([str(team_member_id)] * 5)
                else:
                    # User has no team member record, return empty
                    return []
            
            if sprint_id:
                if sprint_id.lower() == "null":
                    # Get backlog tasks (sprint_id is NULL)
                    base_query += " AND t.sprint_id IS NULL"
                else:
                    # Get tasks for specific sprint
                    base_query += " AND t.sprint_id = %s"
                    params.append(int(sprint_id))
            
            if status:
                base_query += " AND t.status = %s"
                params.append(status.value)
            
            if stage:
                base_query += " AND t.stage = %s"
                params.append(stage.value)
            
            if priority:
                base_query += " AND t.priority = %s"
                params.append(priority.value)
            
            if assignee_id:
                base_query += " AND JSON_SEARCH(ta.team_members, 'one', %s) IS NOT NULL"
                params.append(str(assignee_id))
            
            base_query += " ORDER BY t.priority DESC, t.due_date ASC LIMIT %s OFFSET %s"
            params.extend([limit, skip])
            
            await cursor.execute(base_query, params)
            tasks = await cursor.fetchall()
            
            # Get task IDs for assignments lookup
            task_ids = [task["id"] for task in tasks] if tasks else []
            
            # Get all assignments for these tasks
            assignments_by_task = await get_task_assignments(cursor, task_ids)
            
            # Parse tags from JSON strings back to lists and add assignments
            for task in tasks:
                if task["tags"]:
                    task["tags"] = json.loads(task["tags"])
                else:
                    task["tags"] = []
                
                # Add assignments to task
                task["assignments"] = assignments_by_task.get(task["id"], [])
            
            # Debug logging for team member filtering
            if current_user["role"] == "team_member":
                # logger.info(f"Team member {current_user['id']} requesting tasks. Found {len(tasks)} tasks.")
                for task in tasks[:3]:  # Log first 3 tasks for debugging
                    logger.info(f"Task {task['id']}: {task.get('assignments', [])}")
            
            return [TaskResponse(**task) for task in tasks]
    except Exception as e:
        logger.error(f"Error fetching tasks: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: int,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get task by ID"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(
                """
                SELECT t.*,
                       CASE WHEN ta.team_members IS NOT NULL 
                            THEN JSON_EXTRACT(ta.team_members, '$.developer[0]') 
                            ELSE NULL END as assigned_to,
                       CASE WHEN ta.team_members IS NOT NULL AND JSON_EXTRACT(ta.team_members, '$.developer[0]') IS NOT NULL
                            THEN (SELECT u.full_name FROM team_members tm JOIN users u ON tm.user_id = u.id 
                                  WHERE tm.id = JSON_EXTRACT(ta.team_members, '$.developer[0]'))
                            ELSE NULL END as assigned_to_name,
                       CASE WHEN ta.team_members IS NOT NULL AND JSON_EXTRACT(ta.team_members, '$.developer[0]') IS NOT NULL
                            THEN (SELECT u.avatar_url FROM team_members tm JOIN users u ON tm.user_id = u.id 
                                  WHERE tm.id = JSON_EXTRACT(ta.team_members, '$.developer[0]'))
                            ELSE NULL END as avatar_url
                FROM tasks t
                LEFT JOIN task_assignments ta ON t.id = ta.task_id AND ta.is_active = TRUE
                WHERE t.id = %s
                """, 
                (task_id,)
            )
            task = await cursor.fetchone()
            
            if not task:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Task not found"
                )
            
            # Check if user has access to this task
            if current_user["role"] == "team_member":
                has_access = await user_has_task_access(cursor, task_id, current_user["id"])
                if not has_access:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Not assigned to this task"
                    )
            
            # Get all assignments for this task
            assignments_by_task = await get_task_assignments(cursor, [task_id])
            
            # Parse tags from JSON string back to list
            if task["tags"]:
                task["tags"] = json.loads(task["tags"])
            else:
                task["tags"] = []
            
            # Add assignments to task
            task["assignments"] = assignments_by_task.get(task_id, [])
            
            return TaskResponse(**task)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching task {task_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    task_update: TaskUpdate,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Update task"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Check if task exists
            await cursor.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
            task = await cursor.fetchone()
            
            if not task:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Task not found"
                )
            
            # Check permissions
            if current_user["role"] == "team_member":
                # Use the helper function to check if user has access
                if not await user_has_task_access(cursor, task_id, current_user["id"]):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You do not have permission to access this task"
                    )
            
            # Check if task can be modified based on its current status
            if task["status"] in ["completed", "blocked", "cancelled"]:
                # Only allow managers to modify completed/blocked/cancelled tasks
                if current_user["role"] == "team_member":
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Cannot modify task with status '{task['status']}'. Only managers can modify completed, blocked, or cancelled tasks."
                    )
                
                # For managers, only allow status changes (not other fields)
                if current_user["role"] in ["pm", "sm"]:
                    allowed_fields = {"status", "stage"}
                    update_fields_set = set(task_update.dict(exclude_unset=True).keys())
                    
                    if not update_fields_set.issubset(allowed_fields):
                        disallowed_fields = update_fields_set - allowed_fields
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Cannot modify fields {list(disallowed_fields)} for task with status '{task['status']}'. Only status and stage changes are allowed."
                        )
            
            # Check if estimated_effort_hours is being updated - only managers can do this
            if "estimated_effort_hours" in task_update.dict(exclude_unset=True):
                if current_user["role"] == "team_member":
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Only managers can modify estimated effort hours"
                    )
            
            # Build update query
            update_fields = []
            params = []
            
            for field, value in task_update.dict(exclude_unset=True).items():
                if field == "tags" and value is not None:
                    value = json.dumps(value)
                
                update_fields.append(f"{field} = %s")
                params.append(value.value if hasattr(value, 'value') else value)
            
            if not update_fields:
                return TaskResponse(**task)
            
            # Check if status is being changed to completed
            status_update = task_update.dict(exclude_unset=True).get("status")
            if status_update and status_update.value == "completed":
                # Different behavior for PM vs Team Member
                if current_user["role"] == "pm":
                    # PM marks the entire task as completed
                    # Calculate total logged effort hours for this task
                    await cursor.execute(
                        """
                        SELECT COALESCE(SUM(time_spent_hours), 0) as total_logged_hours
                        FROM effort_logs
                        WHERE task_id = %s
                        """,
                        (task_id,)
                    )
                    total_effort_result = await cursor.fetchone()
                    total_logged_hours = total_effort_result["total_logged_hours"] if total_effort_result else 0
                    
                    # Add actual_effort_hours to the update
                    update_fields.append("actual_effort_hours = %s")
                    params.append(float(total_logged_hours))
                    
                    # Also set completion_date if not already set
                    if "completion_date" not in [field for field, _ in task_update.dict(exclude_unset=True).items()]:
                        update_fields.append("completion_date = CURDATE()")
                else:
                    # Team member marks their part as completed
                    # Get the team member's ID
                    await cursor.execute(
                        "SELECT id FROM team_members WHERE user_id = %s",
                        (current_user["id"],)
                    )
                    team_member_record = await cursor.fetchone()
                    
                    if team_member_record:
                        team_member_id = team_member_record["id"]
                        
                        # Get current task assignment
                        await cursor.execute(
                            """
                            SELECT id, team_members, completed_by, completion_timestamps
                            FROM task_assignments
                            WHERE task_id = %s AND is_active = TRUE
                            """,
                            (task_id,)
                        )
                        assignment = await cursor.fetchone()
                        
                        if assignment:
                            # Parse existing JSON data
                            team_members = json.loads(assignment["team_members"]) if assignment["team_members"] else {}
                            completed_by = json.loads(assignment["completed_by"]) if assignment["completed_by"] else {}
                            completion_timestamps = json.loads(assignment["completion_timestamps"]) if assignment["completion_timestamps"] else {}
                            
                            # Find which role this team member has
                            member_role = None
                            for role in ['developer', 'tester', 'reviewer', 'project_manager', 'team_lead']:
                                if role in team_members and team_member_id in team_members[role]:
                                    member_role = role
                                    break
                            
                            if member_role:
                                # Add team member to completed_by for their role
                                if member_role not in completed_by:
                                    completed_by[member_role] = []
                                
                                if team_member_id not in completed_by[member_role]:
                                    completed_by[member_role].append(team_member_id)
                                    
                                    # Record completion timestamp
                                    completion_timestamps[str(team_member_id)] = datetime.now().isoformat()
                                    
                                    # Update task_assignments table
                                    await cursor.execute(
                                        """
                                        UPDATE task_assignments
                                        SET completed_by = %s, completion_timestamps = %s
                                        WHERE id = %s
                                        """,
                                        (json.dumps(completed_by), json.dumps(completion_timestamps), assignment["id"])
                                    )
                                    
                                    logger.info(f"Team member {team_member_id} marked task {task_id} as completed")
                                
                                # Check if ALL assigned team members have completed
                                all_completed = True
                                for role, members in team_members.items():
                                    role_completed = completed_by.get(role, [])
                                    for member in members:
                                        if member not in role_completed:
                                            all_completed = False
                                            break
                                    if not all_completed:
                                        break
                                
                                # If not all members completed, don't mark task as completed
                                if not all_completed:
                                    # Remove status from update - build new lists without status
                                    new_update_fields = []
                                    new_params = []
                                    for i, field in enumerate(update_fields):
                                        if not field.startswith("status"):
                                            new_update_fields.append(field)
                                            if i < len(params):
                                                new_params.append(params[i])
                                    
                                    update_fields = new_update_fields
                                    params = new_params
                                    
                                    # logger.info(f"Task {task_id} not fully completed - waiting for other team members")
                                else:
                                    # All members completed - change stage to "review" and keep status as "in_progress"
                                    # Replace the "completed" status with "in_progress" status and add stage = "review"
                                    new_update_fields = []
                                    new_params = []
                                    status_found = False
                                    
                                    for i, field in enumerate(update_fields):
                                        if field.startswith("status"):
                                            # Replace with in_progress status (task is awaiting review)
                                            new_update_fields.append("status = %s")
                                            new_params.append("in_progress")
                                            status_found = True
                                        else:
                                            new_update_fields.append(field)
                                            if i < len(params):
                                                new_params.append(params[i])
                                    
                                    update_fields = new_update_fields
                                    params = new_params
                                    
                                    # Add stage = review
                                    update_fields.append("stage = %s")
                                    params.append("review")
                                    
                                    # Calculate total logged effort hours for reference
                                    await cursor.execute(
                                        """
                                        SELECT COALESCE(SUM(time_spent_hours), 0) as total_logged_hours
                                        FROM effort_logs
                                        WHERE task_id = %s
                                        """,
                                        (task_id,)
                                    )
                                    total_effort_result = await cursor.fetchone()
                                    total_logged_hours = total_effort_result["total_logged_hours"] if total_effort_result else 0
                                    
                                    # Add actual_effort_hours to the update
                                    update_fields.append("actual_effort_hours = %s")
                                    params.append(float(total_logged_hours))
                                    
                                    logger.info(f"All team members completed task {task_id} - moving to review stage with in_progress status")
                                    
                                    # Notify PM that all team members have completed the task
                                    # Get PM from the sprint
                                    await cursor.execute(
                                        """
                                        SELECT s.created_by 
                                        FROM tasks t
                                        JOIN sprints s ON t.sprint_id = s.id
                                        WHERE t.id = %s
                                        """,
                                        (task_id,)
                                    )
                                    sprint_info = await cursor.fetchone()
                                    
                                    if sprint_info and sprint_info["created_by"]:
                                        pm_team_member_id = sprint_info["created_by"]
                                        
                                        # Get PM's user_id
                                        await cursor.execute(
                                            "SELECT user_id FROM team_members WHERE id = %s",
                                            (pm_team_member_id,)
                                        )
                                        pm_record = await cursor.fetchone()
                                        
                                        if pm_record:
                                            pm_user_id = pm_record["user_id"]
                                            
                                            # Get task title for notification
                                            task_title = task.get("title", "Task")
                                            
                                            # Create notification for PM
                                            notification_service = NotificationService()
                                            notification_data = NotificationCreate(
                                                recipient_id=pm_user_id,
                                                sender_id=current_user["id"],
                                                type=NotificationType.TASK_STATUS_CHANGED,
                                                title="Task Ready for Review",
                                                message=f"All team members have completed their work on task: {task_title}. Ready for your review.",
                                                data={
                                                    "task_id": task_id,
                                                    "sprint_id": task["sprint_id"],
                                                    "stage": "review",
                                                    "all_members_completed": True
                                                }
                                            )
                                            created_notification = await notification_service.create_notification(notification_data, conn)
                                            
                                            # Send real-time notification
                                            await NotificationWebSocketHandler.send_notification(created_notification)
                                            
                                            logger.info(f"Notification sent to PM (user_id: {pm_user_id}) for task {task_id} review")
            
            # Handle status changes to non-completed states for team members
            elif status_update and status_update.value != "completed" and current_user["role"] == "team_member":
                # Team member is changing status to something other than completed
                # Remove them from completed_by if they were marked as completed
                await cursor.execute(
                    "SELECT id FROM team_members WHERE user_id = %s",
                    (current_user["id"],)
                )
                team_member_record = await cursor.fetchone()
                
                if team_member_record:
                    team_member_id = team_member_record["id"]
                    
                    # Get current task assignment
                    await cursor.execute(
                        """
                        SELECT id, team_members, completed_by, completion_timestamps
                        FROM task_assignments
                        WHERE task_id = %s AND is_active = TRUE
                        """,
                        (task_id,)
                    )
                    assignment = await cursor.fetchone()
                    
                    if assignment and assignment["completed_by"]:
                        # Parse existing JSON data
                        team_members = json.loads(assignment["team_members"]) if assignment["team_members"] else {}
                        completed_by = json.loads(assignment["completed_by"]) if assignment["completed_by"] else {}
                        completion_timestamps = json.loads(assignment["completion_timestamps"]) if assignment["completion_timestamps"] else {}
                        
                        # Find which role this team member has
                        member_role = None
                        for role in ['developer', 'tester', 'reviewer', 'project_manager', 'team_lead']:
                            if role in team_members and team_member_id in team_members[role]:
                                member_role = role
                                break
                        
                        if member_role and member_role in completed_by:
                            # Remove team member from completed_by for their role
                            if team_member_id in completed_by[member_role]:
                                completed_by[member_role].remove(team_member_id)
                                
                                # Remove empty role arrays to keep JSON clean
                                if not completed_by[member_role]:
                                    del completed_by[member_role]
                                
                                # Remove completion timestamp
                                if str(team_member_id) in completion_timestamps:
                                    del completion_timestamps[str(team_member_id)]
                                
                                # Update task_assignments table
                                await cursor.execute(
                                    """
                                    UPDATE task_assignments
                                    SET completed_by = %s, completion_timestamps = %s
                                    WHERE id = %s
                                    """,
                                    (json.dumps(completed_by) if completed_by else None, 
                                     json.dumps(completion_timestamps) if completion_timestamps else None, 
                                     assignment["id"])
                                )
                                
                                logger.info(f"Team member {team_member_id} removed from completed_by for task {task_id} (status changed to {status_update.value})")
            
            # Only execute update if there are fields to update
            if update_fields:
                params.append(task_id)
                query = f"UPDATE tasks SET {', '.join(update_fields)}, updated_at = NOW() WHERE id = %s"
                
                await cursor.execute(query, params)
                await conn.commit()
            
            # Get updated task with assignment info
            await cursor.execute(
                """
                SELECT t.*
                FROM tasks t
                WHERE t.id = %s
                """, 
                (task_id,)
            )
            updated_task = await cursor.fetchone()
            
            # Get assignments for this task
            assignments_by_task = await get_task_assignments(cursor, [task_id])
            updated_task["assignments"] = assignments_by_task.get(task_id, [])
            
            # Parse tags from JSON string back to list
            if updated_task["tags"]:
                updated_task["tags"] = json.loads(updated_task["tags"])
            else:
                updated_task["tags"] = []

            # logger.info(f"Task {task_id} updated successfully: {updated_task}")
            
            return TaskResponse(**updated_task)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating task {task_id}: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.post("/{task_id}/assign")
async def assign_task(
    task_id: int,
    team_member_id: int,
    assignment_type: str = "developer",
    current_user: dict = Depends(require_assignment_permission()),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """
    Assign task to team member (Legacy endpoint - use /assign-multiple instead)
    This endpoint wraps the new assign-multiple functionality for backward compatibility
    """
    # Convert single assignment to the new format and call assign_multiple_users
    assignments = [{"team_member_id": str(team_member_id), "assignment_type": assignment_type}]
    return await assign_multiple_users(task_id, assignments, current_user, conn)

@router.post("/{task_id}/unassign")
async def unassign_task(
    task_id: int,
    current_user: dict = Depends(require_assignment_permission()),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """
    Unassign task from all team members (Legacy endpoint - use /assign-multiple with empty assignments instead)
    This endpoint removes all assignments from a task
    """
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Check if task exists
            await cursor.execute("SELECT id FROM tasks WHERE id = %s", (task_id,))
            task = await cursor.fetchone()
            
            if not task:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Task not found"
                )
            
            # Remove the task assignment record (which clears all assignments)
            await cursor.execute(
                "DELETE FROM task_assignments WHERE task_id = %s",
                (task_id,)
            )
            
            await conn.commit()
            
            return {"message": "Task unassigned successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unassigning task {task_id}: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.post("/{task_id}/assign-multiple")
async def assign_multiple_users(
    task_id: int,
    assignments: List[Dict[str, str]],  # [{"team_member_id": "1", "assignment_type": "developer"}, ...]
    current_user: dict = Depends(require_assignment_permission()),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Assign task to multiple team members with different roles"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Check if task exists
            await cursor.execute("SELECT id, sprint_id, title FROM tasks WHERE id = %s", (task_id,))
            task = await cursor.fetchone()
            
            if not task:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Task not found"
                )
            
            # Additional permission check for team members
            if current_user["role"] == "team_member":
                # Get user's team member ID first
                await cursor.execute(
                    "SELECT id FROM team_members WHERE user_id = %s",
                    (current_user["id"],)
                )
                team_member_record = await cursor.fetchone()
                
                if not team_member_record:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="User is not a team member"
                    )
                
                user_team_member_id = team_member_record["id"]
                
                # Check current assignments to see if team member can manage this task
                await cursor.execute("""
                    SELECT team_members 
                    FROM task_assignments 
                    WHERE task_id = %s AND is_active = TRUE
                """, (task_id,))
                assignment_result = await cursor.fetchone()
                
                current_assignments = {}
                if assignment_result and assignment_result['team_members']:
                    current_assignments = json.loads(assignment_result['team_members'])
                
                # Team member can assign if:
                # 1. Task is unassigned, OR
                # 2. They are currently assigned as team_lead or project_manager
                can_assign = (
                    len(current_assignments) == 0 or  # Task is unassigned
                    any(
                        user_team_member_id in current_assignments.get(role, [])
                        for role in ["team_lead", "project_manager"]
                    )
                )
                
                if not can_assign:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Team members can only assign unassigned tasks or tasks where they are team leads/project managers"
                    )
            
            # Validate assignments
            if not assignments:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="At least one assignment is required"
                )
            
            # Valid assignment types
            VALID_ASSIGNMENT_TYPES = {'developer', 'tester', 'reviewer', 'project_manager', 'team_lead'}
            
            # Organize assignments by type
            team_members_by_type = {}
            all_member_ids = set()
            
            for assignment in assignments:
                team_member_id = int(assignment["team_member_id"])
                assignment_type = assignment.get("assignment_type", "developer")
                
                # Validate assignment type
                if assignment_type not in VALID_ASSIGNMENT_TYPES:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid assignment type '{assignment_type}'. Valid types are: {', '.join(VALID_ASSIGNMENT_TYPES)}"
                    )
                
                if assignment_type not in team_members_by_type:
                    team_members_by_type[assignment_type] = []
                team_members_by_type[assignment_type].append(team_member_id)
                all_member_ids.add(team_member_id)
            
            # Validate all team members exist
            if all_member_ids:
                placeholders = ",".join(["%s"] * len(all_member_ids))
                await cursor.execute(
                    f"""
                    SELECT tm.id, tm.user_id FROM team_members tm 
                    JOIN users u ON tm.user_id = u.id 
                    WHERE tm.id IN ({placeholders}) AND u.is_active = TRUE
                    """,
                    list(all_member_ids)
                )
                valid_members = await cursor.fetchall()
                valid_member_ids = {m["id"] for m in valid_members}
                
                invalid_members = all_member_ids - valid_member_ids
                if invalid_members:
                    await conn.rollback()
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Team members {list(invalid_members)} not found or inactive"
                    )
            
            # Deactivate existing assignments for this task
            await cursor.execute(
                """
                UPDATE task_assignments 
                SET is_active = FALSE 
                WHERE task_id = %s
                """,
                (task_id,)
            )
            
            # Create new assignment with JSON data
            await cursor.execute(
                """
                INSERT INTO task_assignments (task_id, assigned_by, team_members)
                VALUES (%s, %s, %s)
                """,
                (task_id, current_user["id"], json.dumps(team_members_by_type))
            )
            
            await conn.commit()
            
            # Send notifications to all assigned users
            member_user_map = {m["id"]: m["user_id"] for m in valid_members}
            notifications_to_send = []
            
            for assignment in assignments:
                team_member_id = int(assignment["team_member_id"])
                assignment_type = assignment.get("assignment_type", "primary")
                
                user_id = member_user_map.get(team_member_id)
                if user_id:
                    notifications_to_send.append({
                        "user_id": user_id,
                        "assignment_type": assignment_type
                    })
            
            # Send notifications
            for notification_info in notifications_to_send:
                notification_service = NotificationService()
                notification_data = NotificationCreate(
                    recipient_id=notification_info["user_id"],
                    sender_id=current_user["id"],
                    type=NotificationType.TASK_ASSIGNED,
                    title=f"Task Assignment ({notification_info['assignment_type'].title()})",
                    message=f"You have been assigned to task: {task['title']} as {notification_info['assignment_type']}",
                    data={
                        "task_id": task_id, 
                        "sprint_id": task["sprint_id"], 
                        "assignment_type": notification_info["assignment_type"]
                    }
                )
                created_notification = await notification_service.create_notification(notification_data, conn)
                
                # Send real-time notification
                await NotificationWebSocketHandler.send_notification(created_notification)
            
            return {"message": f"Task assigned to {len(assignments)} team members successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error assigning task {task_id} to multiple users: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.get("/{task_id}/details")
async def get_task_details(
    task_id: int,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get detailed task information including assignments, effort logs, and comments"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get task
            await cursor.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
            task = await cursor.fetchone()
            
            if not task:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Task not found"
                )
            
            # Check permissions for team members
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
            
            # Get task assignment data
            await cursor.execute(
                """
                SELECT ta.task_id, ta.team_members, ta.created_at, ta.updated_at
                FROM task_assignments ta
                WHERE ta.task_id = %s
                """,
                (task_id,)
            )
            assignments = await cursor.fetchall()
            
            # Get effort logs
            await cursor.execute(
                """
                SELECT el.*, u.full_name as team_member_name,
                       approver.full_name as approved_by_name
                FROM effort_logs el
                JOIN team_members tm ON el.team_member_id = tm.id
                JOIN users u ON tm.user_id = u.id
                LEFT JOIN users approver ON el.approved_by = approver.id
                WHERE el.task_id = %s
                ORDER BY el.log_date DESC
                """, 
                (task_id,)
            )
            effort_logs = await cursor.fetchall()
            
            # Get comments
            await cursor.execute(
                """
                SELECT tc.*, u.full_name as author_name
                FROM task_comments tc
                JOIN users u ON tc.user_id = u.id
                WHERE tc.task_id = %s
                ORDER BY tc.created_at DESC
                """,
                (task_id,)
            )
            comments = await cursor.fetchall()
            
            # Parse tags from JSON string back to list for the task
            if task["tags"]:
                task["tags"] = json.loads(task["tags"])
            else:
                task["tags"] = []
            
            return {
                "task": TaskResponse(**task),
                "assignments": assignments,
                "effort_logs": effort_logs,
                "comments": comments
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching task details for {task_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.get("/team-member/incomplete-tasks")
async def get_incomplete_tasks(
    current_user: dict = Depends(get_current_team_member),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get all incomplete tasks assigned to the current team member from task_assignments table"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get current team member ID
            await cursor.execute(
                """
                SELECT id FROM team_members WHERE user_id = %s
                """,
                (current_user["user_id"],)
            )
            team_member = await cursor.fetchone()
            
            if not team_member:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Team member not found"
                )
            
            team_member_id = team_member["id"]
            
            # Get all tasks where this team member is assigned in any role and task status is not completed
            await cursor.execute(
                """
                SELECT t.*
                FROM tasks t
                JOIN task_assignments ta ON t.id = ta.task_id AND ta.is_active = TRUE
                WHERE (
                    JSON_CONTAINS(ta.team_members, %s, '$.developer') 
                    OR JSON_CONTAINS(ta.team_members, %s, '$.tester')
                    OR JSON_CONTAINS(ta.team_members, %s, '$.reviewer')
                    OR JSON_CONTAINS(ta.team_members, %s, '$.project_manager')
                    OR JSON_CONTAINS(ta.team_members, %s, '$.team_lead')
                )
                AND t.status != 'completed'
                ORDER BY t.priority DESC, t.due_date ASC
                """,
                (str(team_member_id), str(team_member_id), str(team_member_id), str(team_member_id), str(team_member_id))
            )
            tasks = await cursor.fetchall()
            
            # Get task IDs for assignments lookup
            task_ids = [task["id"] for task in tasks] if tasks else []
            
            # Get all assignments for these tasks
            assignments_by_task = await get_task_assignments(cursor, task_ids)
            
            # Parse tags from JSON strings back to lists and add assignments
            for task in tasks:
                if task["tags"]:
                    task["tags"] = json.loads(task["tags"]) if isinstance(task["tags"], str) else task["tags"]
                else:
                    task["tags"] = []
                task["assignments"] = assignments_by_task.get(task["id"], [])
            
            return [TaskResponse(**task) for task in tasks]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching incomplete tasks: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.get("/fetch/unassigned-tasks", response_model=List[TaskResponse])
async def get_unassigned_tasks(
    sprint_id: Optional[int] = Query(None, description="Filter by sprint ID"),
    current_user: dict = Depends(require_manager),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get tasks that have no team member assignments"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get tasks that don't have any assignments
            query = """
                SELECT DISTINCT t.* FROM tasks t
                LEFT JOIN task_assignments ta ON t.id = ta.task_id AND ta.is_active = TRUE
                WHERE (ta.id IS NULL OR ta.team_members IS NULL OR ta.team_members = '{}')
            """
            params = []
            
            if sprint_id:
                query += " AND t.sprint_id = %s"
                params.append(sprint_id)
            
            query += " ORDER BY t.created_at DESC"
            
            await cursor.execute(query, params)
            tasks_data = await cursor.fetchall()
            
            if not tasks_data:
                return []
            
            # Get assignments for all tasks (should be empty but let's be consistent)
            task_ids = [task["id"] for task in tasks_data]
            assignments_by_task = await get_task_assignments(cursor, task_ids)
            
            # Format response
            result = []
            for task in tasks_data:
                task_dict = dict(task)
                task_dict["tags"] = json.loads(task["tags"]) if task.get("tags") else []
                task_dict["assignments"] = assignments_by_task.get(task["id"], [])
                result.append(task_dict)
            
            return result
            
    except Exception as e:
        logger.error(f"Error fetching unassigned tasks: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching unassigned tasks"
        )

class AssignUnassignedTaskRequest(BaseModel):
    sprint_id: Optional[int] = None
    assignments: List[Dict[str, str]]

@router.post("/{task_id}/assign-from-unassigned")
async def assign_unassigned_task(
    task_id: int,
    request_data: AssignUnassignedTaskRequest,
    current_user: dict = Depends(require_assignment_permission()),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Assign team members to a previously unassigned task and optionally update sprint"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Check if task exists
            await cursor.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
            task = await cursor.fetchone()
            
            if not task:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Task not found"
                )
            
            # Check if task has existing assignments (we'll allow both creating and updating)
            await cursor.execute(
                """
                SELECT ta.team_members 
                FROM task_assignments ta
                WHERE ta.task_id = %s AND ta.is_active = TRUE
                """,
                (task_id,)
            )
            existing_assignment = await cursor.fetchone()
            
            # Update task's sprint_id if provided
            if request_data.sprint_id is not None:
                await cursor.execute(
                    "UPDATE tasks SET sprint_id = %s WHERE id = %s",
                    (request_data.sprint_id, task_id)
                )
            
            # Organize assignments by type
            team_members_by_type = {}
            all_member_ids = set()
            
            for assignment in request_data.assignments:
                member_id = int(assignment["team_member_id"])
                assignment_type = assignment["assignment_type"]
                
                if assignment_type not in team_members_by_type:
                    team_members_by_type[assignment_type] = []
                
                team_members_by_type[assignment_type].append(member_id)
                all_member_ids.add(member_id)
            
            # Validate all team members exist
            if all_member_ids:
                placeholders = ",".join(["%s"] * len(all_member_ids))
                await cursor.execute(
                    f"SELECT id FROM team_members WHERE id IN ({placeholders})",
                    list(all_member_ids)
                )
                existing_members = await cursor.fetchall()
                existing_member_ids = {member["id"] for member in existing_members}
                
                invalid_members = all_member_ids - existing_member_ids
                if invalid_members:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Team members not found: {invalid_members}"
                    )
            
            # Create or update task assignment
            team_members_json = json.dumps(team_members_by_type)
            
            if existing_assignment:
                # Update existing assignment
                await cursor.execute(
                    """
                    UPDATE task_assignments 
                    SET team_members = %s, assigned_by = %s, assigned_at = CURRENT_TIMESTAMP
                    WHERE task_id = %s AND is_active = TRUE
                    """,
                    (team_members_json, current_user["id"], task_id)
                )
            else:
                # Create new assignment
                await cursor.execute(
                    """
                    INSERT INTO task_assignments (task_id, team_members, assigned_by, assigned_at, is_active)
                    VALUES (%s, %s, %s, CURRENT_TIMESTAMP, TRUE)
                    """,
                    (task_id, team_members_json, current_user["id"])
                )
            
            # Send notifications to assigned team members
            notification_service = NotificationService()
            ws_handler = NotificationWebSocketHandler()
            
            for member_id in all_member_ids:
                # Get user_id for the team member
                await cursor.execute(
                    "SELECT user_id FROM team_members WHERE id = %s",
                    (member_id,)
                )
                member_result = await cursor.fetchone()
                
                if member_result:
                    notification = NotificationCreate(
                        recipient_id=member_result["user_id"],
                        sender_id=current_user["id"],
                        type=NotificationType.TASK_ASSIGNED,
                        title="New Task Assignment",
                        message=f"You have been assigned to task: {task['title']}",
                        data={
                            "task_id": task_id,
                            "sprint_id": task.get("sprint_id")
                        }
                    )
                    
                    created_notification = await notification_service.create_notification(notification, conn)
                    await NotificationWebSocketHandler.send_notification(created_notification)
            
            await conn.commit()
            
            # Return updated task with assignments
            await cursor.execute(
                """
                SELECT t.*,
                       CASE WHEN ta.team_members IS NOT NULL 
                            THEN JSON_EXTRACT(ta.team_members, '$.developer[0]') 
                            ELSE NULL END as assigned_to,
                       CASE WHEN ta.team_members IS NOT NULL AND JSON_EXTRACT(ta.team_members, '$.developer[0]') IS NOT NULL
                            THEN (SELECT u.full_name FROM team_members tm JOIN users u ON tm.user_id = u.id 
                                  WHERE tm.id = JSON_EXTRACT(ta.team_members, '$.developer[0]'))
                            ELSE NULL END as assigned_to_name,
                       CASE WHEN ta.team_members IS NOT NULL AND JSON_EXTRACT(ta.team_members, '$.developer[0]') IS NOT NULL
                            THEN (SELECT u.avatar_url FROM team_members tm JOIN users u ON tm.user_id = u.id 
                                  WHERE tm.id = JSON_EXTRACT(ta.team_members, '$.developer[0]'))
                            ELSE NULL END as avatar_url
                FROM tasks t
                LEFT JOIN task_assignments ta ON t.id = ta.task_id AND ta.is_active = TRUE
                WHERE t.id = %s
                """,
                (task_id,)
            )
            updated_task = await cursor.fetchone()
            
            # Get all assignments
            assignments_by_task = await get_task_assignments(cursor, [task_id])
            
            # Parse tags
            if updated_task["tags"]:
                updated_task["tags"] = json.loads(updated_task["tags"])
            else:
                updated_task["tags"] = []
            
            updated_task["assignments"] = assignments_by_task.get(task_id, [])
            
            return {
                "message": "Task assignments created successfully",
                "task": TaskResponse(**updated_task)
            }
            
    except HTTPException as he:
        logger.info(f"HTTPException while assigning unassigned task {task_id}: {he.detail}")
        raise
    except Exception as e:
        logger.error(f"Error assigning unassigned task {task_id}: {str(e)}")
        await conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )

@router.get("/fetch/external-tasks", response_model=List[dict])
async def get_external_tasks(
    source: Optional[str] = Query(None, description="Filter by external source (e.g., 'Jira', 'Asana')"),
    current_user: dict = Depends(require_manager),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get tasks from external systems (Jira, Asana, etc.) that don't already exist in the database"""
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Get existing external tasks from database
            await cursor.execute(
                """
                SELECT external_id, external_source
                FROM tasks 
                WHERE external_id IS NOT NULL AND external_source IS NOT NULL
                """
            )
            existing_tasks = await cursor.fetchall()
            
            # Create a set of existing (external_id, external_source) pairs for fast lookup
            existing_task_keys = {(task["external_id"], task["external_source"].lower()) for task in existing_tasks}
        
        # Mock external tasks data - in a real implementation, this would:
        # 1. Connect to Jira API using credentials
        # 2. Connect to Asana API using tokens
        # 3. Connect to other project management tools
        # 4. Fetch and transform the data to a common format
        
        mock_external_tasks = [
            {
                "id": "PROJ-123",
                "title": "Fix authentication bug in login page",
                "description": "Users are unable to login with special characters in password. Need to fix input validation and encoding issues.",
                "priority": "high",
                "status": "To Do",
                "estimated_hours": 8,
                "due_date": "2024-02-15",
                "source": "Jira",
                "labels": ["bug", "authentication", "frontend"],
                "assignee": "unassigned",
                "external_url": "https://company.atlassian.net/browse/PROJ-123"
            },
            {
                "id": "PROJ-124",
                "title": "Implement user profile settings",
                "description": "Create a comprehensive user profile page where users can update their personal information, preferences, and notification settings.",
                "priority": "medium",
                "status": "In Progress",
                "estimated_hours": 16,
                "due_date": "2024-02-20",
                "source": "Jira",
                "labels": ["feature", "profile", "settings"],
                "assignee": "john.doe@company.com",
                "external_url": "https://company.atlassian.net/browse/PROJ-124"
            },
            {
                "id": "ASN-001",
                "title": "Database performance optimization",
                "description": "Optimize slow database queries affecting the dashboard load times. Focus on user statistics and task aggregation queries.",
                "priority": "high",
                "status": "To Do",
                "estimated_hours": 12,
                "due_date": "2024-02-18",
                "source": "Asana",
                "labels": ["performance", "database", "backend"],
                "assignee": "unassigned",
                "external_url": "https://app.asana.com/0/project/task"
            },
            {
                "id": "ASN-002",
                "title": "Database performance optimization",
                "description": "Optimize slow database queries affecting the dashboard load times. Focus on user statistics and task aggregation queries.",
                "priority": "high",
                "status": "To Do",
                "estimated_hours": 12,
                "due_date": "2024-02-18",
                "source": "Asana",
                "labels": ["performance", "database", "backend"],
                "assignee": "unassigned",
                "external_url": "https://app.asana.com/0/project/task"
            }
        ]
        
        # Filter by source if provided
        if source:
            mock_external_tasks = [task for task in mock_external_tasks if task["source"].lower() == source.lower()]
        
        # Filter out tasks that already exist in the database
        filtered_tasks = []
        for task in mock_external_tasks:
            task_key = (task["id"], task["source"].lower())
            if task_key not in existing_task_keys:
                filtered_tasks.append(task)
              
        return filtered_tasks
        
    except Exception as e:
        logger.error(f"Error fetching external tasks: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching external tasks"
        )
