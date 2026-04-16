"""
WebSocket endpoints for real-time notifications
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from app.core.websocket_manager import NotificationWebSocketHandler
from app.api.dependencies import get_current_user
from app.core.security import verify_token
from app.core.database import database
import aiomysql
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

async def get_user_from_token(token: str):
    """Get user from token for WebSocket authentication"""
    from app.core.database import database
    
    payload = verify_token(token)
    if payload is None:
        return None
    
    user_id: int = payload.get("sub")
    if user_id is None:
        return None
    
    # Get user from database
    async with await database.get_connection() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(
                "SELECT * FROM users WHERE id = %s AND is_active = TRUE",
                (user_id,)
            )
            user = await cursor.fetchone()
            return user


@router.websocket("/notifications")
async def notification_websocket(websocket: WebSocket, token: str = None):
    """WebSocket endpoint for real-time notifications"""
    user_id = None
    try:
        # Authenticate user from token
        if not token:
            await websocket.close(code=4001, reason="Authentication required")
            return
        
        # Get user from token
        try:
            user = await get_user_from_token(token)
            if not user:
                await websocket.close(code=4001, reason="Invalid token")
                return
            user_id = user["id"]
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            await websocket.close(code=4001, reason="Authentication failed")
            return
        
        # Handle the WebSocket connection
        await NotificationWebSocketHandler.handle_connection(websocket, user_id)
        
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for user {user_id}")
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        try:
            if not websocket.client_state.DISCONNECTED:
                await websocket.close(code=4000, reason="Internal server error")
        except Exception as close_error:
            logger.error(f"Error closing WebSocket for user {user_id}: {close_error}")
    finally:
        # Ensure cleanup happens even if there are exceptions
        if user_id:
            logger.info(f"WebSocket cleanup completed for user {user_id}")


@router.get("/stats")
async def get_websocket_stats(current_user: dict = Depends(get_current_user)):
    """Get WebSocket connection statistics (admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    return NotificationWebSocketHandler.get_connection_stats()