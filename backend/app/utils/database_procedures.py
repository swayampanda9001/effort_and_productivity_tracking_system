"""
Database utility functions that mirror the stored procedures from the SQL schema
"""
import aiomysql
from typing import Optional
import logging

logger = logging.getLogger(__name__)

async def calculate_sprint_velocity(conn: aiomysql.Connection, sprint_id: int) -> None:
    """Calculate and update sprint velocity"""
    async with conn.cursor(aiomysql.DictCursor) as cursor:
        try:
            # Get sprint duration and completed tasks
            await cursor.execute(
                """
                SELECT 
                    DATEDIFF(CURDATE(), start_date) + 1 as sprint_days,
                    (SELECT COUNT(*) FROM tasks WHERE sprint_id = %s AND status = 'completed') as completed_tasks
                FROM sprints 
                WHERE id = %s
                """,
                (sprint_id, sprint_id)
            )
            result = await cursor.fetchone()
            
            if result and result["sprint_days"] > 0:
                velocity = result["completed_tasks"] / result["sprint_days"]
                await cursor.execute(
                    "UPDATE sprints SET velocity = %s WHERE id = %s",
                    (velocity, sprint_id)
                )
                await conn.commit()
                
        except Exception as e:
            logger.error(f"Error calculating sprint velocity: {e}")
            await conn.rollback()

async def calculate_productivity_score(conn: aiomysql.Connection, team_member_id: int) -> None:
    """Calculate and update team member productivity score"""
    async with conn.cursor(aiomysql.DictCursor) as cursor:
        try:
            # Calculate estimation accuracy
            await cursor.execute(
                """
                SELECT AVG(
                    CASE 
                        WHEN t.estimated_effort_hours > 0 THEN 
                            GREATEST(0, 100 - ABS(t.actual_effort_hours - t.estimated_effort_hours) / t.estimated_effort_hours * 100)
                        ELSE 100 
                    END
                ) as avg_estimation_accuracy
                FROM tasks t
                JOIN task_assignments ta ON t.id = ta.task_id
                WHERE ta.team_member_id = %s 
                AND t.status = 'completed'
                AND t.completion_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                """,
                (team_member_id,)
            )
            estimation_result = await cursor.fetchone()
            avg_estimation_accuracy = estimation_result["avg_estimation_accuracy"] or 0
            
            # Calculate task completion rate
            await cursor.execute(
                """
                SELECT 
                    COUNT(CASE WHEN t.status = 'completed' THEN 1 END) * 100.0 / COUNT(*) as completion_rate
                FROM tasks t
                JOIN task_assignments ta ON t.id = ta.task_id
                WHERE ta.team_member_id = %s
                AND t.due_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                """,
                (team_member_id,)
            )
            completion_result = await cursor.fetchone()
            task_completion_rate = completion_result["completion_rate"] or 0
            
            # Calculate daily update consistency
            await cursor.execute(
                """
                SELECT 
                    COUNT(DISTINCT log_date) * 100.0 / 
                    GREATEST(1, DATEDIFF(CURDATE(), DATE_SUB(CURDATE(), INTERVAL 30 DAY))) as consistency
                FROM effort_logs
                WHERE team_member_id = %s
                AND log_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                """,
                (team_member_id,)
            )
            consistency_result = await cursor.fetchone()
            daily_update_consistency = consistency_result["consistency"] or 0
            
            # Calculate weighted productivity score
            productivity_score = round(
                avg_estimation_accuracy * 0.4 +
                task_completion_rate * 0.4 +
                daily_update_consistency * 0.2
            )
            
            await cursor.execute(
                "UPDATE team_members SET productivity_score = %s WHERE id = %s",
                (productivity_score, team_member_id)
            )
            await conn.commit()
            
        except Exception as e:
            logger.error(f"Error calculating productivity score: {e}")
            await conn.rollback()

async def identify_at_risk_tasks(conn: aiomysql.Connection, sprint_id: int) -> list:
    """Identify tasks that are at risk in the sprint"""
    async with conn.cursor(aiomysql.DictCursor) as cursor:
        await cursor.execute(
            """
            SELECT 
                t.id,
                t.title,
                t.status,
                t.due_date,
                t.progress_percentage,
                u.full_name as assignee,
                DATEDIFF(t.due_date, CURDATE()) as days_until_due,
                CASE 
                    WHEN t.due_date < CURDATE() THEN 'Overdue'
                    WHEN t.due_date <= DATE_ADD(CURDATE(), INTERVAL 2 DAY) AND t.progress_percentage < 80 THEN 'High Risk'
                    WHEN t.due_date <= DATE_ADD(CURDATE(), INTERVAL 5 DAY) AND t.progress_percentage < 50 THEN 'Medium Risk'
                    WHEN t.blockers_count > 0 THEN 'Blocked'
                    ELSE 'On Track'
                END as risk_level,
                MAX(el.log_date) as last_update
            FROM tasks t
            LEFT JOIN task_assignments ta ON t.id = ta.task_id AND ta.assignment_type = 'primary'
            LEFT JOIN team_members tm ON ta.team_member_id = tm.id
            LEFT JOIN users u ON tm.user_id = u.id
            LEFT JOIN effort_logs el ON t.id = el.task_id
            WHERE t.sprint_id = %s
            AND t.status NOT IN ('completed', 'cancelled')
            GROUP BY t.id
            HAVING risk_level != 'On Track'
            ORDER BY 
                CASE risk_level
                    WHEN 'Overdue' THEN 1
                    WHEN 'High Risk' THEN 2
                    WHEN 'Blocked' THEN 3
                    WHEN 'Medium Risk' THEN 4
                END,
                days_until_due
            """,
            (sprint_id,)
        )
        
        return await cursor.fetchall()
