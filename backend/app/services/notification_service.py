"""
Notification service for handling notification CRUD operations
"""
import json
import logging
from datetime import datetime
from typing import List, Optional, Dict, Any
import aiomysql
from app.core.database import database  # Only needed for cleanup_old_notifications when no conn provided
from app.models.notification import (
    NotificationCreate, 
    NotificationUpdate, 
    NotificationResponse, 
    NotificationStats,
    BulkNotificationCreate,
    NotificationType
)

logger = logging.getLogger(__name__)


class NotificationService:
    """Service class for notification operations"""
    
    @staticmethod
    async def create_notification(notification_data: NotificationCreate, conn: aiomysql.Connection) -> NotificationResponse:
        """Create a new notification"""
        async with conn.cursor(aiomysql.DictCursor) as cursor:
                try:
                    # Insert notification and fetch created record in single transaction
                    await cursor.execute(
                        """
                        INSERT INTO notifications (recipient_id, sender_id, type, title, message, data)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        (
                            notification_data.recipient_id,
                            notification_data.sender_id,
                            notification_data.type.value,
                            notification_data.title,
                            notification_data.message,
                            json.dumps(notification_data.data) if notification_data.data else None
                        )
                    )
                    
                    notification_id = cursor.lastrowid
                    
                    # Fetch the created notification with sender info in same transaction
                    await cursor.execute(
                        """
                        SELECT 
                            n.*,
                            sender.full_name as sender_name,
                            sender.email as sender_email
                        FROM notifications n
                        LEFT JOIN users sender ON n.sender_id = sender.id
                        WHERE n.id = %s
                        """,
                        (notification_id,)
                    )
                    
                    result = await cursor.fetchone()
                    await conn.commit()
                    
                    if result:
                        return NotificationService._convert_db_row_to_response(result)
                    else:
                        raise Exception("Failed to retrieve created notification")
                    
                except Exception as e:
                    await conn.rollback()
                    logger.error(f"Error creating notification: {e}")
                    raise

    @staticmethod
    async def create_bulk_notifications(bulk_data: BulkNotificationCreate, conn: aiomysql.Connection) -> List[NotificationResponse]:
        """Create multiple notifications for different recipients using batch insert"""
        async with conn.cursor(aiomysql.DictCursor) as cursor:
                try:
                    if not bulk_data.recipient_ids:
                        return []
                    
                    # Prepare batch insert data
                    insert_data = []
                    for recipient_id in bulk_data.recipient_ids:
                        insert_data.append((
                            recipient_id,
                            bulk_data.sender_id,
                            bulk_data.type.value,
                            bulk_data.title,
                            bulk_data.message,
                            json.dumps(bulk_data.data) if bulk_data.data else None
                        ))
                    
                    # Batch insert all notifications
                    await cursor.executemany(
                        """
                        INSERT INTO notifications (recipient_id, sender_id, type, title, message, data)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        insert_data
                    )
                    
                    # Get the range of inserted IDs
                    first_notification_id = cursor.lastrowid
                    num_notifications = len(bulk_data.recipient_ids)
                    
                    # Fetch all created notifications with sender info in one query
                    await cursor.execute(
                        """
                        SELECT 
                            n.*,
                            sender.full_name as sender_name,
                            sender.email as sender_email
                        FROM notifications n
                        LEFT JOIN users sender ON n.sender_id = sender.id
                        WHERE n.id >= %s AND n.id < %s
                        ORDER BY n.id
                        """,
                        (first_notification_id, first_notification_id + num_notifications)
                    )
                    
                    results = await cursor.fetchall()
                    await conn.commit()
                    
                    return [NotificationService._convert_db_row_to_response(row) for row in results]
                    
                except Exception as e:
                    await conn.rollback()
                    logger.error(f"Error creating bulk notifications: {e}")
                    raise

    @staticmethod
    async def get_notification_by_id(notification_id: int, conn: aiomysql.Connection) -> Optional[NotificationResponse]:
        """Get notification by ID with sender information"""
        async with conn.cursor(aiomysql.DictCursor) as cursor:
                await cursor.execute(
                    """
                    SELECT 
                        n.*,
                        sender.full_name as sender_name,
                        sender.email as sender_email
                    FROM notifications n
                    LEFT JOIN users sender ON n.sender_id = sender.id
                    WHERE n.id = %s
                    """,
                    (notification_id,)
                )
                
                result = await cursor.fetchone()
                if result:
                    return NotificationService._convert_db_row_to_response(result)
                return None

    @staticmethod
    async def get_user_notifications(
        user_id: int, 
        is_read: Optional[bool] = None, 
        limit: int = 50, 
        offset: int = 0,
        conn: aiomysql.Connection = None
    ) -> List[NotificationResponse]:
        """Get notifications for a specific user"""
        async with conn.cursor(aiomysql.DictCursor) as cursor:
                
                where_clause = "WHERE n.recipient_id = %s"
                params = [user_id]
                
                if is_read is not None:
                    where_clause += " AND n.is_read = %s"
                    params.append(is_read)
                
                await cursor.execute(
                    f"""
                    SELECT 
                        n.*,
                        sender.full_name as sender_name,
                        sender.email as sender_email
                    FROM notifications n
                    LEFT JOIN users sender ON n.sender_id = sender.id
                    {where_clause}
                    ORDER BY n.created_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    params + [limit, offset]
                )
                
                results = await cursor.fetchall()
                return [NotificationService._convert_db_row_to_response(row) for row in results]

    @staticmethod
    async def get_user_notification_counts(user_id: int, conn: aiomysql.Connection) -> dict:
        """Get notification counts for a user (total and unread)"""
        async with conn.cursor(aiomysql.DictCursor) as cursor:
                # Get total count
                await cursor.execute(
                    "SELECT COUNT(*) as total_count FROM notifications WHERE recipient_id = %s",
                    (user_id,)
                )
                total_result = await cursor.fetchone()
                total_count = total_result['total_count'] if total_result else 0
                
                # Get unread count
                await cursor.execute(
                    "SELECT COUNT(*) as unread_count FROM notifications WHERE recipient_id = %s AND is_read = 0",
                    (user_id,)
                )
                unread_result = await cursor.fetchone()
                unread_count = unread_result['unread_count'] if unread_result else 0
                
                return {
                    "total": total_count,
                    "unread": unread_count
                }

    @staticmethod
    async def mark_notification_as_read(notification_id: int, user_id: int, conn: aiomysql.Connection) -> bool:
        """Mark a notification as read"""
        async with conn.cursor() as cursor:
                try:
                    await cursor.execute(
                        """
                        UPDATE notifications 
                        SET is_read = TRUE, read_at = NOW()
                        WHERE id = %s AND recipient_id = %s
                        """,
                        (notification_id, user_id)
                    )
                    
                    await conn.commit()
                    return cursor.rowcount > 0
                    
                except Exception as e:
                    await conn.rollback()
                    logger.error(f"Error marking notification as read: {e}")
                    raise

    @staticmethod
    async def mark_all_notifications_as_read(user_id: int, conn: aiomysql.Connection) -> int:
        """Mark all notifications as read for a user"""
        async with conn.cursor() as cursor:
                try:
                    await cursor.execute(
                        """
                        UPDATE notifications 
                        SET is_read = TRUE, read_at = NOW()
                        WHERE recipient_id = %s AND is_read = FALSE
                        """,
                        (user_id,)
                    )
                    
                    await conn.commit()
                    return cursor.rowcount
                    
                except Exception as e:
                    await conn.rollback()
                    logger.error(f"Error marking all notifications as read: {e}")
                    raise

    @staticmethod
    async def delete_notification(notification_id: int, user_id: int, conn: aiomysql.Connection) -> bool:
        """Delete a notification"""
        async with conn.cursor() as cursor:
                try:
                    await cursor.execute(
                        """
                        DELETE FROM notifications 
                        WHERE id = %s AND recipient_id = %s
                        """,
                        (notification_id, user_id)
                    )
                    
                    await conn.commit()
                    return cursor.rowcount > 0
                    
                except Exception as e:
                    await conn.rollback()
                    logger.error(f"Error deleting notification: {e}")
                    raise

    @staticmethod
    async def get_notification_stats(user_id: int, conn: aiomysql.Connection) -> NotificationStats:
        """Get notification statistics for a user"""
        async with conn.cursor(aiomysql.DictCursor) as cursor:
                await cursor.execute(
                    """
                    SELECT 
                        COUNT(*) as total_count,
                        SUM(CASE WHEN is_read = FALSE THEN 1 ELSE 0 END) as unread_count,
                        SUM(CASE WHEN is_read = TRUE THEN 1 ELSE 0 END) as read_count
                    FROM notifications 
                    WHERE recipient_id = %s
                    """,
                    (user_id,)
                )
                
                result = await cursor.fetchone()
                return NotificationStats(
                    total_count=result["total_count"] or 0,
                    unread_count=result["unread_count"] or 0,
                    read_count=result["read_count"] or 0
                )

    @staticmethod
    async def cleanup_old_notifications(days: int = 30, conn: aiomysql.Connection = None) -> int:
        """Clean up old read notifications"""
        # If no connection provided, create one (for scheduled cleanup tasks)
        if conn is None:
            async with await database.get_connection() as conn:
                return await NotificationService.cleanup_old_notifications(days, conn)
        
        async with conn.cursor() as cursor:
                try:
                    await cursor.execute(
                        """
                        DELETE FROM notifications 
                        WHERE is_read = TRUE 
                        AND created_at < DATE_SUB(NOW(), INTERVAL %s DAY)
                        """,
                        (days,)
                    )
                    
                    await conn.commit()
                    deleted_count = cursor.rowcount
                    logger.info(f"Cleaned up {deleted_count} old notifications")
                    return deleted_count
                    
                except Exception as e:
                    await conn.rollback()
                    logger.error(f"Error cleaning up old notifications: {e}")
                    raise

    @staticmethod
    def _convert_db_row_to_response(row: Dict[str, Any]) -> NotificationResponse:
        """Convert database row to NotificationResponse"""
        return NotificationResponse(
            id=row["id"],
            recipient_id=row["recipient_id"],
            sender_id=row["sender_id"],
            type=NotificationType(row["type"]),
            title=row["title"],
            message=row["message"],
            data=json.loads(row["data"]) if row["data"] else None,
            is_read=row["is_read"],
            created_at=row["created_at"],
            read_at=row["read_at"],
            sender_name=row.get("sender_name"),
            sender_email=row.get("sender_email")
        )