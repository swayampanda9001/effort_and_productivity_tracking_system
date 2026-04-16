import asyncio
import aiomysql
from datetime import datetime, time, timedelta
from typing import Optional
from app.core.database import get_db_connection
from app.services.productivity_service import ProductivityScoreCalculator
import logging

logger = logging.getLogger(__name__)

class ProductivityScheduler:
    """
    Automated scheduler for productivity score updates
    
    Schedule:
    - Daily: After business hours (6 PM)
    - Weekly: Sunday at midnight
    - Monthly: 1st of month at 2 AM
    """
    
    def __init__(self):
        self.is_running = False
        self.daily_update_time = time(18, 0)  # 6 PM
        self.weekly_update_time = time(0, 0)  # Midnight Sunday
        self.monthly_update_time = time(2, 0)  # 2 AM on 1st
        
    async def daily_update_task(self):
        """Daily productivity score updates"""
        logger.info("Starting daily productivity score updates")
        
        try:
            conn = await get_db_connection()
            
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # Get team members who logged effort today
                await cursor.execute("""
                    SELECT DISTINCT tm.id, u.full_name
                    FROM team_members tm
                    JOIN users u ON tm.user_id = u.id
                    JOIN effort_logs el ON el.team_member_id = tm.id
                    WHERE DATE(el.log_date) = CURDATE()
                    AND u.is_active = TRUE
                """)
                
                active_members = await cursor.fetchall()
                
                updated_count = 0
                for member in active_members:
                    try:
                        success = await ProductivityScoreCalculator.update_team_member_score(
                            conn, member['id']
                        )
                        if success:
                            updated_count += 1
                            logger.info(f"Updated score for {member['full_name']}")
                    except Exception as e:
                        logger.error(f"Failed daily update for {member['full_name']}: {str(e)}")
                
                logger.info(f"Daily update completed: {updated_count} scores updated")
            
            await conn.ensure_closed()
            
        except Exception as e:
            logger.error(f"Daily update task failed: {str(e)}")
    
    async def weekly_update_task(self):
        """Weekly comprehensive updates for all team members"""
        logger.info("Starting weekly productivity score updates")
        
        try:
            conn = await get_db_connection()
            
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # Get all active team members
                await cursor.execute("""
                    SELECT tm.id, u.full_name
                    FROM team_members tm
                    JOIN users u ON tm.user_id = u.id
                    WHERE u.is_active = TRUE
                """)
                
                all_members = await cursor.fetchall()
                
                updated_count = 0
                for member in all_members:
                    try:
                        success = await ProductivityScoreCalculator.update_team_member_score(
                            conn, member['id']
                        )
                        if success:
                            updated_count += 1
                    except Exception as e:
                        logger.error(f"Failed weekly update for {member['full_name']}: {str(e)}")
                
                logger.info(f"Weekly update completed: {updated_count} scores updated")
            
            await conn.ensure_closed()
            
        except Exception as e:
            logger.error(f"Weekly update task failed: {str(e)}")
    
    async def monthly_update_task(self):
        """Monthly comprehensive recalculation with historical analysis"""
        logger.info("Starting monthly productivity score recalculation")
        
        try:
            conn = await get_db_connection()
            
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # Get all team members including historical data
                await cursor.execute("""
                    SELECT tm.id, u.full_name, tm.created_at
                    FROM team_members tm
                    JOIN users u ON tm.user_id = u.id
                    WHERE u.is_active = TRUE
                """)
                
                all_members = await cursor.fetchall()
                
                updated_count = 0
                for member in all_members:
                    try:
                        # For monthly updates, use longer period for more stable scores
                        days_period = 60 if (datetime.now() - member['created_at']).days > 60 else 30
                        
                        score_data = await ProductivityScoreCalculator.calculate_comprehensive_score(
                            conn, member['id'], days_period
                        )
                        
                        # Update with monthly calculation
                        await cursor.execute("""
                            UPDATE team_members 
                            SET productivity_score = %s, 
                                updated_at = NOW()
                            WHERE id = %s
                        """, (score_data['overall_score'], member['id']))
                        
                        updated_count += 1
                        
                    except Exception as e:
                        logger.error(f"Failed monthly update for {member['full_name']}: {str(e)}")
                
                await conn.commit()
                logger.info(f"Monthly update completed: {updated_count} scores updated")
            
            await conn.ensure_closed()
            
        except Exception as e:
            logger.error(f"Monthly update task failed: {str(e)}")
    
    async def task_completion_trigger(self, task_id: int):
        """Update scores when a task is completed"""
        logger.info(f"Task completion trigger for task {task_id}")
        
        try:
            conn = await get_db_connection()
            
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # Get team members assigned to this task from JSON structure
                await cursor.execute("""
                    SELECT DISTINCT tm.id as team_member_id, u.full_name
                    FROM task_assignments ta
                    JOIN team_members tm ON (
                        JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.developer'), CAST(tm.id AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.tester'), CAST(tm.id AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.reviewer'), CAST(tm.id AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.project_manager'), CAST(tm.id AS JSON))
                        OR JSON_CONTAINS(JSON_EXTRACT(ta.team_members, '$.team_lead'), CAST(tm.id AS JSON))
                    )
                    JOIN users u ON tm.user_id = u.id
                    WHERE ta.task_id = %s AND ta.is_active = TRUE
                """, (task_id,))
                
                assigned_members = await cursor.fetchall()
                
                for member in assigned_members:
                    try:
                        success = await ProductivityScoreCalculator.update_team_member_score(
                            conn, member['team_member_id']
                        )
                        if success:
                            logger.info(f"Updated score for {member['full_name']} after task completion")
                    except Exception as e:
                        logger.error(f"Failed task completion update for {member['full_name']}: {str(e)}")
            
            await conn.ensure_closed()
            
        except Exception as e:
            logger.error(f"Task completion trigger failed: {str(e)}")
    
    def get_next_run_time(self, schedule_type: str) -> datetime:
        """Calculate next run time for a schedule type"""
        now = datetime.now()
        
        if schedule_type == "daily":
            next_run = now.replace(hour=self.daily_update_time.hour, 
                                 minute=self.daily_update_time.minute, 
                                 second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(days=1)
            return next_run
            
        elif schedule_type == "weekly":
            # Next Sunday
            days_until_sunday = (6 - now.weekday()) % 7
            if days_until_sunday == 0 and now.time() > self.weekly_update_time:
                days_until_sunday = 7
            
            next_run = now.replace(hour=self.weekly_update_time.hour,
                                 minute=self.weekly_update_time.minute,
                                 second=0, microsecond=0)
            next_run += timedelta(days=days_until_sunday)
            return next_run
            
        elif schedule_type == "monthly":
            # Next 1st of month
            if now.day == 1 and now.time() < self.monthly_update_time:
                # Today is 1st and we haven't run yet
                next_run = now.replace(hour=self.monthly_update_time.hour,
                                     minute=self.monthly_update_time.minute,
                                     second=0, microsecond=0)
            else:
                # Next month
                if now.month == 12:
                    next_run = now.replace(year=now.year + 1, month=1, day=1,
                                         hour=self.monthly_update_time.hour,
                                         minute=self.monthly_update_time.minute,
                                         second=0, microsecond=0)
                else:
                    next_run = now.replace(month=now.month + 1, day=1,
                                         hour=self.monthly_update_time.hour,
                                         minute=self.monthly_update_time.minute,
                                         second=0, microsecond=0)
            return next_run
        
        return now + timedelta(hours=1)  # Default fallback
    
    async def schedule_runner(self):
        """Main scheduler loop"""
        logger.info("Productivity scheduler started")
        
        while self.is_running:
            try:
                now = datetime.now()
                
                # Calculate next run times
                next_daily = self.get_next_run_time("daily")
                next_weekly = self.get_next_run_time("weekly")
                next_monthly = self.get_next_run_time("monthly")
                
                # Find the nearest scheduled task
                next_tasks = [
                    (next_daily, "daily"),
                    (next_weekly, "weekly"), 
                    (next_monthly, "monthly")
                ]
                
                next_task_time, task_type = min(next_tasks, key=lambda x: x[0])
                
                # Wait until the next scheduled time
                wait_seconds = (next_task_time - now).total_seconds()
                
                logger.info(f"Next {task_type} update scheduled for {next_task_time}")
                
                if wait_seconds > 0:
                    await asyncio.sleep(min(wait_seconds, 3600))  # Check at least every hour
                
                # Check if it's time to run the task
                if datetime.now() >= next_task_time:
                    if task_type == "daily":
                        await self.daily_update_task()
                    elif task_type == "weekly":
                        await self.weekly_update_task()
                    elif task_type == "monthly":
                        await self.monthly_update_task()
                
            except Exception as e:
                logger.error(f"Scheduler error: {str(e)}")
                await asyncio.sleep(300)  # Wait 5 minutes before retrying
    
    async def start(self):
        """Start the scheduler"""
        if not self.is_running:
            self.is_running = True
            await self.schedule_runner()
    
    def stop(self):
        """Stop the scheduler"""
        self.is_running = False
        logger.info("Productivity scheduler stopped")

# Global scheduler instance
productivity_scheduler = ProductivityScheduler()

async def start_productivity_scheduler():
    """Start the productivity scheduler"""
    await productivity_scheduler.start()

def stop_productivity_scheduler():
    """Stop the productivity scheduler"""
    productivity_scheduler.stop()