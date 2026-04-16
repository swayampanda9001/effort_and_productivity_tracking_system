# ```python file="backend/app/api/v1/__init__.py"
from fastapi import APIRouter
from app.api.v1 import auth, users, team_members, sprints, tasks, effort_logs, comments, dashboard, alerts, r2storage, admin, notifications, websocket

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(team_members.router, prefix="/team-members", tags=["team-members"])
api_router.include_router(sprints.router, prefix="/sprints", tags=["sprints"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(effort_logs.router, prefix="/effort-logs", tags=["effort-logs"])
api_router.include_router(comments.router, prefix="/comments", tags=["comments"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
api_router.include_router(r2storage.router, prefix="/r2storage", tags=["r2storage"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(websocket.router, prefix="/ws", tags=["websocket"])