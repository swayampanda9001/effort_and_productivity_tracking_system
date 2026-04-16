"""
Notification API endpoints
"""
from typing import List, Optional
import aiomysql
from fastapi import APIRouter, HTTPException, Depends, Query
from app.core.database import get_db_connection
from app.models.notification import (
    NotificationCreate,
    NotificationResponse, 
    NotificationStats,
    BulkNotificationCreate
)
from app.services.notification_service import NotificationService
from app.api.dependencies import get_current_user
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/", response_model=List[NotificationResponse])
async def get_user_notifications(
    is_read: Optional[bool] = Query(None, description="Filter by read status"),
    limit: int = Query(50, ge=1, le=100, description="Number of notifications to retrieve"),
    offset: int = Query(0, ge=0, description="Number of notifications to skip"),
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get notifications for the current user"""
    try:
        notifications = await NotificationService.get_user_notifications(
            user_id=current_user["id"],
            is_read=is_read,
            limit=limit,
            offset=offset,
            conn=conn
        )
        return notifications
    except Exception as e:
        logger.error(f"Error fetching notifications for user {current_user['id']}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch notifications")


@router.get("/user")
async def get_user_notifications_with_counts(
    unread_only: Optional[bool] = Query(None, description="Only return unread notifications"),
    limit: int = Query(50, ge=1, le=100, description="Number of notifications to retrieve"),
    offset: int = Query(0, ge=0, description="Number of notifications to skip"),
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get notifications for the current user with count information (for frontend)"""
    try:
        # Get notifications based on unread_only parameter
        is_read_filter = False if unread_only else None
        
        notifications_list = await NotificationService.get_user_notifications(
            user_id=current_user["id"],
            is_read=is_read_filter,
            limit=limit,
            offset=offset,
            conn=conn
        )
        
        # Get counts efficiently
        counts = await NotificationService.get_user_notification_counts(current_user["id"], conn)
        
        return {
            "notifications": notifications_list,
            "total": counts["total"],
            "unread_count": counts["unread"]
        }
    except Exception as e:
        logger.error(f"Error fetching notifications for user {current_user['id']}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch notifications")


@router.get("/stats", response_model=NotificationStats)
async def get_notification_stats(
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get notification statistics for the current user"""
    try:
        stats = await NotificationService.get_notification_stats(current_user["id"], conn)
        return stats
    except Exception as e:
        logger.error(f"Error fetching notification stats for user {current_user['id']}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch notification statistics")


@router.get("/{notification_id}", response_model=NotificationResponse)
async def get_notification(
    notification_id: int,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Get a specific notification"""
    try:
        notification = await NotificationService.get_notification_by_id(notification_id, conn)
        
        if not notification:
            raise HTTPException(status_code=404, detail="Notification not found")
        
        # Check if user owns this notification
        if notification.recipient_id != current_user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        return notification
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching notification {notification_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch notification")


@router.post("/", response_model=NotificationResponse)
async def create_notification(
    notification_data: NotificationCreate,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Create a new notification (for managers/admins)"""
    try:
        # Only allow managers and admins to create notifications
        if current_user["role"] not in ["pm", "admin"]:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        
        # Set sender_id to current user if not provided
        if not notification_data.sender_id:
            notification_data.sender_id = current_user["id"]
        
        notification = await NotificationService.create_notification(notification_data, conn)
        return notification
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating notification: {e}")
        raise HTTPException(status_code=500, detail="Failed to create notification")


@router.post("/bulk", response_model=List[NotificationResponse])
async def create_bulk_notifications(
    bulk_data: BulkNotificationCreate,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Create bulk notifications (for managers/admins)"""
    try:
        # Only allow managers and admins to create bulk notifications
        if current_user["role"] not in ["pm", "admin"]:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        
        # Set sender_id to current user if not provided
        if not bulk_data.sender_id:
            bulk_data.sender_id = current_user["id"]
        
        notifications = await NotificationService.create_bulk_notifications(bulk_data, conn)
        return notifications
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating bulk notifications: {e}")
        raise HTTPException(status_code=500, detail="Failed to create bulk notifications")


@router.patch("/{notification_id}/read")
async def mark_notification_as_read(
    notification_id: int,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Mark a notification as read"""
    try:
        success = await NotificationService.mark_notification_as_read(
            notification_id, current_user["id"], conn
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="Notification not found")
        
        return {"message": "Notification marked as read"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error marking notification {notification_id} as read: {e}")
        raise HTTPException(status_code=500, detail="Failed to mark notification as read")


@router.patch("/read-all")
async def mark_all_notifications_as_read(
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Mark all notifications as read for the current user"""
    try:
        count = await NotificationService.mark_all_notifications_as_read(current_user["id"], conn)
        return {"message": f"Marked {count} notifications as read"}
    except Exception as e:
        logger.error(f"Error marking all notifications as read for user {current_user['id']}: {e}")
        raise HTTPException(status_code=500, detail="Failed to mark notifications as read")


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    current_user: dict = Depends(get_current_user),
    conn: aiomysql.Connection = Depends(get_db_connection)
):
    """Delete a notification"""
    try:
        success = await NotificationService.delete_notification(
            notification_id, current_user["id"], conn
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="Notification not found")
        
        return {"message": "Notification deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting notification {notification_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete notification")


# Admin-only endpoints

@router.post("/admin/cleanup")
async def cleanup_old_notifications(
    days: int = Query(30, ge=1, le=365, description="Delete notifications older than this many days"),
    current_user: dict = Depends(get_current_user)
):
    """Clean up old read notifications (admin only)"""
    try:
        # Only allow admins to cleanup notifications
        if current_user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        count = await NotificationService.cleanup_old_notifications(days)
        return {"message": f"Deleted {count} old notifications"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cleaning up old notifications: {e}")
        raise HTTPException(status_code=500, detail="Failed to cleanup notifications")