from typing import Dict, Any, Optional
import aiomysql
from datetime import datetime, timedelta
from app.core.database import get_db_connection
import logging

logger = logging.getLogger(__name__)

class ProductivityScoreCalculator:
    """
    Comprehensive productivity score calculation system
    
    Score Components:
    - Core Metrics (70%): Task completion, time efficiency, quality
    - Consistency Metrics (30%): Sprint velocity, daily logging
    """
    
    # Weight definitions
    WEIGHTS = {
        'task_completion_rate': 0.30,  # Increased from 0.25
        'time_efficiency': 0.30,      # Increased from 0.25
        'quality_score': 0.25,        # Increased from 0.20
        'sprint_velocity_consistency': 0.10,  # Increased from 0.10
        'daily_effort_logging': 0.05,        # Decreased from 0.10
    }
    
    # Score ranges
    SCORE_RANGES = {
        'exceptional': (90, 100, 'Exceptional performer'),
        'high': (80, 89, 'High performer'),
        'good': (70, 79, 'Good performer'),
        'average': (60, 69, 'Average performer'),
        'needs_improvement': (50, 59, 'Needs improvement'),
        'requires_attention': (0, 49, 'Requires attention')
    }
    
    @staticmethod
    async def calculate_task_completion_rate(conn: aiomysql.Connection, team_member_id: int, days: int = 30) -> float:
        """Calculate task completion rate over specified period"""
        try:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # Get total assigned tasks (all time for this user)
                await cursor.execute("""
                    SELECT COUNT(*) as total_tasks
                    FROM task_assignments ta
                    JOIN tasks t ON ta.task_id = t.id
                    WHERE ta.is_active = TRUE
                    AND (
                        JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.developer'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.tester'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.reviewer'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.project_manager'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.team_lead'), CAST(%s AS JSON))
                    )
                """, (team_member_id, team_member_id, team_member_id, team_member_id, team_member_id))
                
                total_tasks = (await cursor.fetchone())['total_tasks']
                
                if total_tasks == 0:
                    return 0.0
                
                # Get completed tasks (all time for this user)
                await cursor.execute("""
                    SELECT COUNT(*) as completed_tasks
                    FROM task_assignments ta
                    JOIN tasks t ON ta.task_id = t.id
                    WHERE ta.is_active = TRUE
                    AND t.status = 'completed'
                    AND (
                        JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.developer'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.tester'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.reviewer'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.project_manager'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.team_lead'), CAST(%s AS JSON))
                    )
                """, (team_member_id, team_member_id, team_member_id, team_member_id, team_member_id))
                
                completed_tasks = (await cursor.fetchone())['completed_tasks']
                
                completion_rate = (completed_tasks / total_tasks) * 100
                return min(completion_rate, 100.0)
                
        except Exception as e:
            logger.error(f"Error calculating task completion rate: {str(e)}")
            return 0.0
    
    @staticmethod
    async def calculate_time_efficiency(conn: aiomysql.Connection, team_member_id: int, days: int = 30) -> float:
        """Calculate time efficiency (actual vs estimated hours)"""
        try:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # Get efficiency ratio for completed tasks
                await cursor.execute("""
                    SELECT 
                        AVG(CASE 
                            WHEN t.estimated_effort_hours > 0 
                            THEN (actual_hours.total_hours / t.estimated_effort_hours) 
                            ELSE 1.0 
                        END) as efficiency_ratio
                    FROM tasks t
                    JOIN task_assignments ta ON t.id = ta.task_id
                    JOIN (
                        SELECT task_id, SUM(time_spent_hours) as total_hours
                        FROM effort_logs
                        WHERE team_member_id = %s
                        GROUP BY task_id
                    ) actual_hours ON t.id = actual_hours.task_id
                    WHERE ta.is_active = TRUE
                    AND t.status = 'completed'
                    AND (
                        JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.developer'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.tester'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.reviewer'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.project_manager'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.team_lead'), CAST(%s AS JSON))
                    )
                """, (team_member_id, team_member_id, team_member_id, team_member_id, team_member_id, team_member_id))
                
                result = await cursor.fetchone()
                efficiency_ratio = result['efficiency_ratio'] if result and result['efficiency_ratio'] else 1.0
                
                # Convert to score (lower ratio = better efficiency)
                if efficiency_ratio <= 1.0:
                    return 100.0  # Perfect or better than estimated
                elif efficiency_ratio <= 1.2:
                    return 85.0   # Within 20% of estimate
                elif efficiency_ratio <= 1.5:
                    return 70.0   # Within 50% of estimate
                else:
                    return 50.0   # More than 50% over estimate
                
        except Exception as e:
            logger.error(f"Error calculating time efficiency: {str(e)}")
            return 75.0
    
    @staticmethod
    async def calculate_quality_score(conn: aiomysql.Connection, team_member_id: int, days: int = 30) -> float:
        """Calculate quality score based on rework and feedback"""
        try:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                end_date = datetime.now()
                start_date = end_date - timedelta(days=days)
                
                # Count tasks that needed rework (moved back to previous stages)
                await cursor.execute("""
                    SELECT COUNT(DISTINCT t.id) as rework_tasks
                    FROM tasks t
                    JOIN task_assignments ta ON t.id = ta.task_id
                    WHERE ta.is_active = TRUE
                    AND t.status = 'completed'
                    AND (
                        JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.developer'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.tester'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.reviewer'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.project_manager'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.team_lead'), CAST(%s AS JSON))
                    )
                    AND EXISTS (
                        SELECT 1 FROM task_comments tc 
                        WHERE tc.task_id = t.id 
                        AND tc.comment_type = 'feedback'
                        AND tc.created_at BETWEEN %s AND %s
                    )
                """, (team_member_id, team_member_id, team_member_id, team_member_id, team_member_id, start_date, end_date))
                
                rework_count = (await cursor.fetchone())['rework_tasks']
                
                # Get total completed tasks
                await cursor.execute("""
                    SELECT COUNT(*) as total_completed
                    FROM tasks t
                    JOIN task_assignments ta ON t.id = ta.task_id
                    WHERE ta.is_active = TRUE
                    AND t.status = 'completed'
                    AND (
                        JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.developer'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.tester'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.reviewer'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.project_manager'), CAST(%s AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.team_lead'), CAST(%s AS JSON))
                    )
                """, (team_member_id, team_member_id, team_member_id, team_member_id, team_member_id))
                
                total_completed = (await cursor.fetchone())['total_completed']
                
                if total_completed == 0:
                    return 80.0  # Default for new members
                
                # Quality score based on rework percentage
                rework_percentage = (rework_count / total_completed) * 100
                quality_score = max(100 - (rework_percentage * 2), 0)  # 2 points lost per % rework
                
                return min(quality_score, 100.0)
                
        except Exception as e:
            logger.error(f"Error calculating quality score: {str(e)}")
            return 80.0
    
    @staticmethod
    async def calculate_sprint_velocity_consistency(conn: aiomysql.Connection, team_member_id: int) -> float:
        """Calculate consistency in sprint velocity"""
        try:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # Get sprint participation and completion rates
                await cursor.execute("""
                    SELECT 
                        s.id as sprint_id,
                        COUNT(DISTINCT t.id) as total_tasks,
                        COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks
                    FROM sprint_members sm
                    JOIN sprints s ON sm.sprint_id = s.id
                    LEFT JOIN tasks t ON s.id = t.sprint_id
                    LEFT JOIN task_assignments ta ON t.id = ta.task_id 
                        AND ta.team_members IS NOT NULL
                        AND (
                            JSON_CONTAINS(ta.team_members, CAST(sm.team_member_id AS JSON), '$.developer')
                            OR JSON_CONTAINS(ta.team_members, CAST(sm.team_member_id AS JSON), '$.tester')
                            OR JSON_CONTAINS(ta.team_members, CAST(sm.team_member_id AS JSON), '$.reviewer')
                            OR JSON_CONTAINS(ta.team_members, CAST(sm.team_member_id AS JSON), '$.project_manager')
                            OR JSON_CONTAINS(ta.team_members, CAST(sm.team_member_id AS JSON), '$.team_lead')
                        )
                    WHERE sm.team_member_id = %s
                    AND s.status = 'completed'
                    GROUP BY s.id
                    ORDER BY s.start_date DESC
                    LIMIT 5
                """, (team_member_id,))
                
                sprints = await cursor.fetchall()
                
                if len(sprints) == 0:
                    return 75.0  # Default for members without sprint history
                
                # Calculate completion rates for each sprint
                completion_rates = []
                for sprint in sprints:
                    if sprint['total_tasks'] > 0:
                        rate = (sprint['completed_tasks'] / sprint['total_tasks']) * 100
                        completion_rates.append(rate)
                
                if len(completion_rates) == 0:
                    return 75.0
                
                # Calculate consistency (lower standard deviation = higher consistency)
                avg_rate = sum(completion_rates) / len(completion_rates)
                if len(completion_rates) == 1:
                    return avg_rate
                
                variance = sum((rate - avg_rate) ** 2 for rate in completion_rates) / len(completion_rates)
                std_dev = variance ** 0.5
                
                # Convert to consistency score (lower std_dev = higher score)
                consistency_score = max(100 - std_dev, 0)
                return min(consistency_score, 100.0)
                
        except Exception as e:
            logger.error(f"Error calculating sprint velocity consistency: {str(e)}")
            return 75.0
    
    @staticmethod
    async def calculate_daily_effort_logging(conn: aiomysql.Connection, team_member_id: int, days: int = 30) -> float:
        """Calculate consistency in daily effort logging"""
        try:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                end_date = datetime.now()
                start_date = end_date - timedelta(days=days)
                working_days = days * 5 // 7  # Approximate working days
                
                # Count days with effort logs
                await cursor.execute("""
                    SELECT COUNT(DISTINCT log_date) as logged_days
                    FROM effort_logs
                    WHERE team_member_id = %s
                    AND log_date BETWEEN %s AND %s
                """, (team_member_id, start_date, end_date))
                
                logged_days = (await cursor.fetchone())['logged_days']
                
                if working_days == 0:
                    return 100.0
                
                logging_rate = (logged_days / working_days) * 100
                return min(logging_rate, 100.0)
                
        except Exception as e:
            logger.error(f"Error calculating daily effort logging: {str(e)}")
            return 70.0
    
    @classmethod
    async def calculate_comprehensive_score(cls, conn: aiomysql.Connection, team_member_id: int, days: int = 30) -> Dict[str, Any]:
        """Calculate comprehensive productivity score"""
        try:
            # Get team member info and calculate days active
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                await cursor.execute("""
                    SELECT tm.created_at, MIN(el.log_date) as first_log
                    FROM team_members tm
                    LEFT JOIN effort_logs el ON tm.id = el.team_member_id
                    WHERE tm.id = %s
                    GROUP BY tm.id, tm.created_at
                """, (team_member_id,))
                
                result = await cursor.fetchone()
                days_active = 0
                
                if result:
                    # Use effort logs if available, otherwise use member creation date
                    reference_date = result['first_log'] if result['first_log'] else result['created_at']
                    
                    if reference_date:
                        # Convert date to datetime for proper calculation
                        if isinstance(reference_date, datetime):
                            reference_dt = reference_date
                        else:
                            reference_dt = datetime.combine(reference_date, datetime.min.time())
                        days_active = (datetime.now() - reference_dt).days
                
                # For new team members (< 7 days), apply minimal adjustment
                is_new_member = days_active < 7
                
                # Calculate individual components
                task_completion = await cls.calculate_task_completion_rate(conn, team_member_id, days)
                time_efficiency = await cls.calculate_time_efficiency(conn, team_member_id, days)
                quality_score = await cls.calculate_quality_score(conn, team_member_id, days)
                velocity_consistency = await cls.calculate_sprint_velocity_consistency(conn, team_member_id)
                effort_logging = await cls.calculate_daily_effort_logging(conn, team_member_id, days)
                
                # Apply weights to calculate final score
                weighted_score = (
                    task_completion * cls.WEIGHTS['task_completion_rate'] +
                    time_efficiency * cls.WEIGHTS['time_efficiency'] +
                    quality_score * cls.WEIGHTS['quality_score'] +
                    velocity_consistency * cls.WEIGHTS['sprint_velocity_consistency'] +
                    effort_logging * cls.WEIGHTS['daily_effort_logging']
                )
                
                # Apply minimal new member adjustment only for very new members
                if is_new_member and days_active > 0:
                    # Only apply adjustment for members less than 3 days
                    if days_active < 3:
                        adjustment_factor = days_active / 3.0
                        weighted_score = weighted_score * adjustment_factor
                
                final_score = round(min(max(weighted_score, 0), 100), 1)
                
                # Determine performance level
                performance_level = 'requires_attention'
                for level, (min_score, max_score, description) in cls.SCORE_RANGES.items():
                    if min_score <= final_score <= max_score:
                        performance_level = level
                        break
                
                return {
                    'team_member_id': team_member_id,
                    'overall_score': final_score,
                    'performance_level': performance_level,
                    'is_new_member': is_new_member,
                    'days_active': days_active,
                    'components': {
                        'task_completion_rate': round(task_completion, 1),
                        'time_efficiency': round(time_efficiency, 1),
                        'quality_score': round(quality_score, 1),
                        'sprint_velocity_consistency': round(velocity_consistency, 1),
                        'daily_effort_logging': round(effort_logging, 1)
                    },
                    'calculation_date': datetime.now(),
                    'period_days': days
                }
                
        except Exception as e:
            logger.error(f"Error calculating comprehensive productivity score: {str(e)}")
            return {
                'team_member_id': team_member_id,
                'overall_score': 0.0,
                'performance_level': 'requires_attention',
                'is_new_member': True,
                'days_active': 0,
                'components': {
                    'task_completion_rate': 0.0,
                    'time_efficiency': 0.0,
                    'quality_score': 0.0,
                    'sprint_velocity_consistency': 0.0,
                    'daily_effort_logging': 0.0
                },
                'calculation_date': datetime.now(),
                'period_days': days,
                'error': str(e)
            }