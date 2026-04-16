import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
from datetime import datetime
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.database import database
from app.core.websocket_manager import NotificationWebSocketHandler
from app.api.v1 import api_router

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting up...")
    await database.connect()
    yield
    # Shutdown
    logger.info("Shutting down...")
    # First close all WebSocket connections gracefully
    try:
        await NotificationWebSocketHandler.shutdown_all_connections()
        logger.info("All WebSocket connections closed.")
    except Exception as e:
        logger.error(f"Error shutting down WebSocket connections: {e}")
    # Then close database connections
    await database.disconnect()

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# Set up CORS
app.add_middleware( 
    CORSMiddleware,
    allow_origins=["https://sprintsync.adambaba.app", "https://sprint-sync-admin.vercel.app", "http://localhost:5173", "http://localhost:5174"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
async def root():
    return {"message": "The Future of Agile Management API"}

@app.get("/health")
async def health_check():
    """Enhanced health check with database pool status"""
    pool_stats = database.get_pool_stats()
    
    # Determine overall health based on database connection
    is_healthy = pool_stats.get("status") == "connected"
    
    # Warn if pool usage is high
    usage_pct = pool_stats.get("usage_percentage", 0)
    if usage_pct > 80:
        status = "warning"
    elif is_healthy:
        status = "healthy"
    else:
        status = "unhealthy"
    
    return {
        "status": status,
        "database": pool_stats,
        "timestamp": datetime.now().isoformat()
    }

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
