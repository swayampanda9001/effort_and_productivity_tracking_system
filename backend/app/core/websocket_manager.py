"""
WebSocket manager for real-time notifications
"""
import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, List, Set
from fastapi import WebSocket, WebSocketDisconnect
from app.models.notification import NotificationResponse, WebSocketMessage

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections for real-time notifications"""
    
    def __init__(self):
        # Dictionary mapping user_id to set of WebSocket connections
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        # Dictionary mapping WebSocket to user_id for cleanup
        self.connection_user_map: Dict[WebSocket, int] = {}
    
    async def connect(self, websocket: WebSocket, user_id: int):
        """Accept a new WebSocket connection"""
        await websocket.accept()
        
        # Add connection to user's set
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        
        self.active_connections[user_id].add(websocket)
        self.connection_user_map[websocket] = user_id
        
        logger.info(f"User {user_id} connected via WebSocket")
    
    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection"""
        if websocket in self.connection_user_map:
            user_id = self.connection_user_map[websocket]
            
            # Remove from user's connections
            if user_id in self.active_connections:
                self.active_connections[user_id].discard(websocket)
                
                # Remove user entry if no more connections
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]
            
            # Remove from connection map
            del self.connection_user_map[websocket]
            
            logger.info(f"User {user_id} disconnected from WebSocket")
    
    async def send_personal_message(self, message: str, user_id: int):
        """Send a message to all connections of a specific user"""
        if user_id not in self.active_connections:
            return
            
        connections_to_remove = []
        
        # Create a copy of the connections set to avoid modification during iteration
        connections_copy = self.active_connections[user_id].copy()
        
        for websocket in connections_copy:
            try:
                await websocket.send_text(message)
            except WebSocketDisconnect:
                logger.info(f"Connection closed for user {user_id} during message send")
                connections_to_remove.append(websocket)
            except Exception as e:
                logger.error(f"Error sending message to user {user_id}: {e}")
                connections_to_remove.append(websocket)
        
        # Remove failed connections
        for websocket in connections_to_remove:
            try:
                self.disconnect(websocket)
            except Exception as e:
                logger.error(f"Error during connection cleanup for user {user_id}: {e}")
    
    async def send_notification_to_user(self, notification: NotificationResponse):
        """Send a notification to a specific user"""
        message = WebSocketMessage(
            type="notification",
            notification=notification
        )
        
        await self.send_personal_message(
            message.model_dump_json(), 
            notification.recipient_id
        )
    
    async def send_bulk_notifications(self, notifications: List[NotificationResponse]):
        """Send multiple notifications to their respective users"""
        for notification in notifications:
            await self.send_notification_to_user(notification)
    
    def get_connected_users(self) -> List[int]:
        """Get list of currently connected user IDs"""
        return list(self.active_connections.keys())
    
    def get_total_connections(self) -> int:
        """Get total number of active connections"""
        return sum(len(connections) for connections in self.active_connections.values())
    
    async def disconnect_all(self):
        """Disconnect all active WebSocket connections gracefully"""
        logger.info("Disconnecting all WebSocket connections...")
        
        # Create a list of all connections to avoid modification during iteration
        all_connections = []
        for user_id, connections in self.active_connections.items():
            for websocket in connections.copy():
                all_connections.append((websocket, user_id))
        
        # Close all connections gracefully
        for websocket, user_id in all_connections:
            try:
                # Send shutdown notification
                await websocket.send_text(json.dumps({
                    "type": "server_shutdown",
                    "message": "Server is shutting down"
                }))
                
                # Close the connection
                await websocket.close(code=1001, reason="Server shutdown")
                logger.info(f"Closed WebSocket connection for user {user_id}")
                
            except Exception as e:
                logger.error(f"Error closing WebSocket for user {user_id}: {e}")
        
        # Clear all connection maps
        self.active_connections.clear()
        self.connection_user_map.clear()
        
        logger.info(f"Disconnected {len(all_connections)} WebSocket connections")


# Global connection manager instance
connection_manager = ConnectionManager()


class NotificationWebSocketHandler:
    """Handler for notification-specific WebSocket operations"""
    
    @staticmethod
    async def handle_connection(websocket: WebSocket, user_id: int):
        """Handle a new WebSocket connection"""
        try:
            await connection_manager.connect(websocket, user_id)
            
            try:
                # Send initial connection confirmation
                # await websocket.send_text(json.dumps({
                #     "type": "connection_confirmed",
                #     "message": "Connected to notification service",
                #     "user_id": user_id
                # }))
                
                # Keep connection alive and handle incoming messages
                while True:
                    try:
                        # Add timeout to prevent hanging connections
                        data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                        message_data = json.loads(data)
                        
                        # Handle ping/pong for connection health
                        if message_data.get("type") == "ping":
                            await websocket.send_text(json.dumps({
                                "type": "pong",
                                "timestamp": message_data.get("timestamp")
                            }))
                        
                    except asyncio.TimeoutError:
                        # Send ping to check if connection is still alive
                        try:
                            await websocket.send_text(json.dumps({
                                "type": "ping",
                                "timestamp": str(datetime.now().isoformat())
                            }))
                        except:
                            logger.info(f"Connection timeout for user {user_id}, disconnecting")
                            break
                    except WebSocketDisconnect:
                        logger.info(f"User {user_id} disconnected normally")
                        break  # Exit the loop when WebSocket disconnects
                    except json.JSONDecodeError:
                        logger.warning(f"Invalid JSON received from user {user_id}")
                        continue
                    except Exception as e:
                        logger.error(f"Error handling WebSocket message from user {user_id}: {e}")
                        break  # Exit on other errors to prevent infinite loops
                        
            except WebSocketDisconnect:
                logger.info(f"User {user_id} disconnected during initial setup")
            except Exception as e:
                logger.error(f"WebSocket error for user {user_id}: {e}")
                
        except Exception as e:
            logger.error(f"Failed to connect user {user_id}: {e}")
        finally:
            # Always ensure cleanup happens
            try:
                connection_manager.disconnect(websocket)
            except Exception as e:
                logger.error(f"Error during cleanup for user {user_id}: {e}")
    
    @staticmethod
    async def send_notification(notification: NotificationResponse):
        """Send a notification through WebSocket"""
        await connection_manager.send_notification_to_user(notification)
    
    @staticmethod
    async def send_bulk_notifications(notifications: List[NotificationResponse]):
        """Send multiple notifications through WebSocket"""
        await connection_manager.send_bulk_notifications(notifications)
    
    @staticmethod
    def get_connection_stats() -> Dict[str, int]:
        """Get WebSocket connection statistics"""
        return {
            "total_connections": connection_manager.get_total_connections(),
            "connected_users": len(connection_manager.get_connected_users()),
            "users": connection_manager.get_connected_users()
        }
    
    @staticmethod
    async def shutdown_all_connections():
        """Gracefully shutdown all WebSocket connections"""
        await connection_manager.disconnect_all()