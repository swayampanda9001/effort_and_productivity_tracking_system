import aiomysql
import asyncio
from typing import Optional
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

class Database:
    def __init__(self):
        self.pool: Optional[aiomysql.Pool] = None
    
    async def connect(self):
        """Create database connection pool"""
        try:
            self.pool = await aiomysql.create_pool(
                host=settings.DATABASE_HOST,
                port=settings.DATABASE_PORT,
                user=settings.DATABASE_USER,
                password=settings.DATABASE_PASSWORD,
                db=settings.DATABASE_NAME,
                charset='utf8mb4',
                autocommit=True,
                maxsize=100,  # Increased from 20 to 100 for better concurrency
                minsize=5,    # Increased from 1 to 5 for better performance
                echo=False,   # Set to True for SQL query debugging
                pool_recycle=3600,  # Recycle connections every hour
                connect_timeout=30,  # Connection timeout in seconds
                init_command="SET time_zone = 'Asia/Kolkata';" # Set timezone on connection start
            )
            logger.info("Database connection pool created successfully")
        except Exception as e:
            logger.error(f"Failed to create database connection pool: {e}")
            raise
    
    async def disconnect(self):
        """Close database connection pool with timeout"""
        if self.pool:
            try:
                # Close the pool (stops accepting new connections)
                self.pool.close()
                
                # Wait for existing connections to close with a timeout
                await asyncio.wait_for(self.pool.wait_closed(), timeout=5.0)
                logger.info("Database connection pool closed gracefully")
                
            except asyncio.TimeoutError:
                logger.warning("Database pool close timeout - forcing termination")
                # Force terminate any remaining connections
                self.pool.terminate()
                await self.pool.wait_closed()
                logger.info("Database connection pool forcefully closed")
                
            except Exception as e:
                logger.error(f"Error closing database pool: {e}")
                # Force close as fallback
                try:
                    self.pool.terminate()
                    await self.pool.wait_closed()
                    logger.info("Database connection pool forcefully closed after error")
                except Exception as fallback_error:
                    logger.error(f"Failed to force close database pool: {fallback_error}")
            
            finally:
                self.pool = None
    
    async def get_connection(self):
        """Get database connection from pool with monitoring"""
        if not self.pool:
            await self.connect()
        
        # Log pool status for monitoring
        pool_size = self.pool.size
        pool_free = self.pool.freesize
        pool_used = pool_size - pool_free
        
        if pool_used > (pool_size * 0.9):  # Warn if 90% pool usage (increased from 80% due to larger pool)
            logger.warning(f"High database pool usage: {pool_used}/{pool_size} connections in use")
        
        try:
            return await asyncio.wait_for(self.pool.acquire(), timeout=30)
        except asyncio.TimeoutError:
            logger.error(f"Connection pool timeout! Pool status: {pool_used}/{pool_size} connections used")
            raise Exception("Database connection pool exhausted - please try again")

    async def release_connection(self, conn):
        """Release connection back to pool"""
        if self.pool and conn:
            try:
                await self.pool.release(conn)
            except Exception as e:
                logger.error(f"Error releasing connection: {e}")
                # Force close the connection if release fails
                try:
                    conn.close()
                except:
                    pass
    
    def get_pool_stats(self) -> dict:
        """Get connection pool statistics"""
        if not self.pool:
            return {"status": "disconnected"}
        
        pool_size = self.pool.size
        pool_free = self.pool.freesize
        pool_used = pool_size - pool_free
        
        return {
            "status": "connected",
            "total_connections": pool_size,
            "free_connections": pool_free,
            "used_connections": pool_used,
            "usage_percentage": round((pool_used / pool_size) * 100, 2) if pool_size > 0 else 0
        }

# Global database instance
database = Database()

async def get_db_connection():
    """Dependency to get database connection with proper cleanup and retry logic"""
    conn = None
    max_retries = 3
    retry_delay = 1
    
    for attempt in range(max_retries):
        try:
            conn = await database.get_connection()
            break  # Success, exit retry loop
            
        except Exception as e:
            if conn:
                # Force close the connection on error
                try:
                    conn.close()
                except:
                    pass
                conn = None
            
            if attempt < max_retries - 1:
                logger.warning(f"Database connection attempt {attempt + 1} failed: {e}. Retrying in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
            else:
                logger.error(f"Database connection failed after {max_retries} attempts: {e}")
                raise
    
    # Yield the connection and ensure cleanup happens
    try:
        yield conn
    finally:
        # Cleanup in finally block to ensure it always runs
        if conn:
            try:
                await database.release_connection(conn)
            except Exception as e:
                logger.error(f"Error releasing database connection: {e}")
                # Force close if release fails
                try:
                    conn.close()
                except:
                    pass
