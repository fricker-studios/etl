"""S3 utilities for file discovery and operations."""

import boto3
import re
from typing import List, Dict, Optional
from botocore.exceptions import ClientError, NoCredentialsError
import logging

logger = logging.getLogger(__name__)


class S3FileDiscovery:
    """Handle S3 file discovery and pattern matching."""

    def __init__(
        self, 
        endpoint_url: Optional[str], 
        region: str, 
        access_key: str, 
        secret_key: str,
        use_path_style: bool = False
    ):
        """Initialize S3 client with credentials.
        
        Args:
            endpoint_url: S3 endpoint URL (None for AWS S3)
            region: AWS region
            access_key: Access key ID
            secret_key: Secret access key
            use_path_style: Use path-style addressing (required for some S3-compatible services like Ceph, MinIO)
        """
        config = None
        if use_path_style:
            from botocore.config import Config
            config = Config(s3={'addressing_style': 'path'})
        
        self.s3_client = boto3.client(
            "s3",
            endpoint_url=endpoint_url if endpoint_url else None,
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=config
        )

    def convert_pattern_to_regex(self, pattern: str) -> re.Pattern:
        """
        Convert a path pattern with wildcards to regex.
        Examples:
          'data/*.parquet' -> matches files like 'data/file1.parquet'
          'data/year=*/month=*/*.csv' -> matches hierarchical paths
        """
        # Escape special regex characters except * and ?
        escaped = re.escape(pattern)
        # Replace escaped wildcards with regex equivalents
        regex_pattern = escaped.replace(r"\*", ".*").replace(r"\?", ".")
        return re.compile(f"^{regex_pattern}$")

    def list_files(
        self, bucket: str, path_pattern: str, max_files: int = 100
    ) -> List[Dict]:
        """
        List files in S3 bucket matching the path pattern.

        Args:
            bucket: S3 bucket name
            path_pattern: Path pattern with wildcards (e.g., 'data/*.parquet')
            max_files: Maximum number of files to return

        Returns:
            List of file info dicts with keys: key, size, last_modified
        """
        try:
            # Extract prefix from pattern (part before first wildcard)
            prefix = path_pattern.split("*")[0].split("?")[0]

            # List objects with prefix
            paginator = self.s3_client.get_paginator("list_objects_v2")
            pages = paginator.paginate(Bucket=bucket, Prefix=prefix)

            # Convert pattern to regex for filtering
            pattern_regex = self.convert_pattern_to_regex(path_pattern)

            matched_files = []
            for page in pages:
                if "Contents" not in page:
                    continue

                for obj in page["Contents"]:
                    # Check if key matches pattern
                    if pattern_regex.match(obj["Key"]):
                        matched_files.append(
                            {
                                "key": obj["Key"],
                                "size": obj["Size"],
                                "last_modified": obj["LastModified"].isoformat(),
                            }
                        )

                        if len(matched_files) >= max_files:
                            return matched_files

            return matched_files

        except NoCredentialsError:
            logger.error("S3 credentials not available")
            raise ValueError("Invalid S3 credentials")
        except ClientError as e:
            logger.error(f"S3 client error: {e}")
            raise ValueError(f"S3 error: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error listing S3 files: {e}")
            raise ValueError(f"Error listing files: {str(e)}")

    def get_file_info(self, bucket: str, key: str) -> Optional[Dict]:
        """Get metadata for a specific S3 object."""
        try:
            response = self.s3_client.head_object(Bucket=bucket, Key=key)
            return {
                "key": key,
                "size": response["ContentLength"],
                "last_modified": response["LastModified"].isoformat(),
                "content_type": response.get("ContentType", "unknown"),
                "etag": response["ETag"].strip('"'),
            }
        except ClientError as e:
            logger.error(f"Error getting file info for {key}: {e}")
            return None
