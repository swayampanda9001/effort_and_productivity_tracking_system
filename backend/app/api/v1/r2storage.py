import logging
import time
import boto3
from botocore.client import Config
from fastapi import APIRouter, Depends, HTTPException, status, Query
from app.api.dependencies import get_current_user
from app.core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

s3_client = boto3.client(
    "s3",
    endpoint_url=settings.R2_ENDPOINT_URL,
    aws_access_key_id=settings.R2_ACCESS_KEY_ID,
    aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
    config=Config(signature_version="s3v4"),
    region_name="auto"
)

allowed_file_types = [
    "image/png",
    "image/jpg",
    "image/jpeg",
    "image/webp",
    "image/svg"
]

def delete_file_from_r2(file_key: str):
    try:
        s3_client.delete_object(
            Bucket=settings.R2_BUCKET,
            Key=file_key
        )
        return True
    except Exception as e:
        logger.error(f"Failed to delete file from R2: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete file from R2"
        )

@router.get("/generate-presigned-url")
def get_presigned_url(current_user: dict = Depends(get_current_user), content_type: str = Query(..., description="MIME type of the file to be uploaded")):
    try:
        if content_type not in allowed_file_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file type"
            )
        filename = f"{current_user['id']}_{int(time.time())}.{content_type.split('/')[1]}"
        url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.R2_BUCKET,
                "Key": filename,
                "ContentType": content_type,
            },
            ExpiresIn=600,  # 10 minutes
        )
        return {
            "upload_url": url, 
            "file_url": f"{settings.R2_ENDPOINT_URL}/{settings.R2_BUCKET}/{filename}", 
            "filename": filename
        }
    except Exception as e:
        logger.error(f"Failed to generate presigned URL: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate upload URL"
        )