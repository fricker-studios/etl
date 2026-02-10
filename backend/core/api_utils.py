"""API utilities for making HTTP requests with pagination and authentication."""

import requests
import json
import logging
from typing import List, Dict, Any, Optional
from urllib.parse import urljoin, urlencode

logger = logging.getLogger(__name__)


class APIClient:
    """Handle API requests with authentication and pagination."""

    def __init__(
        self,
        base_url: str,
        auth_type: str = "none",
        bearer_token: Optional[str] = None,
        basic_user: Optional[str] = None,
        basic_pass: Optional[str] = None,
        header_name: Optional[str] = None,
        header_value: Optional[str] = None,
    ):
        """
        Initialize API client with authentication.

        Args:
            base_url: Base URL for the API
            auth_type: Type of authentication (none, bearer, basic, header)
            bearer_token: Bearer token for authentication
            basic_user: Username for basic auth
            basic_pass: Password for basic auth
            header_name: Custom header name
            header_value: Custom header value
        """
        self.base_url = base_url.rstrip("/")
        self.auth_type = auth_type
        self.bearer_token = bearer_token
        self.basic_user = basic_user
        self.basic_pass = basic_pass
        self.header_name = header_name
        self.header_value = header_value
        self.session = requests.Session()

        # Set up authentication
        if self.auth_type == "bearer" and self.bearer_token:
            self.session.headers["Authorization"] = f"Bearer {self.bearer_token}"
        elif self.auth_type == "basic" and self.basic_user and self.basic_pass:
            self.session.auth = (self.basic_user, self.basic_pass)
        elif self.auth_type == "header" and self.header_name and self.header_value:
            self.session.headers[self.header_name] = self.header_value

    def _build_url(self, path: str, query_params: List[Dict[str, str]] = None) -> str:
        """
        Build full URL with query parameters.

        Args:
            path: API endpoint path
            query_params: List of query parameter dicts with 'key' and 'value'

        Returns:
            Full URL with query parameters
        """
        # Ensure path starts with /
        if not path.startswith("/"):
            path = "/" + path

        url = urljoin(self.base_url, path)

        if query_params:
            params = {
                param["key"]: param["value"]
                for param in query_params
                if param.get("key")
            }
            if params:
                url = f"{url}?{urlencode(params)}"

        return url

    def _build_headers(
        self, custom_headers: List[Dict[str, str]] = None
    ) -> Dict[str, str]:
        """
        Build request headers.

        Args:
            custom_headers: List of header dicts with 'key' and 'value'

        Returns:
            Dictionary of headers
        """
        headers = {}

        if custom_headers:
            for header in custom_headers:
                if header.get("key"):
                    headers[header["key"]] = header.get("value", "")

        return headers

    def extract_records(
        self, data: Any, records_selector: Optional[str] = None
    ) -> List[Dict]:
        """
        Extract records from response data using the records selector.

        Args:
            data: Response data (can be dict, list, or primitive)
            records_selector: JSON path to extract records (e.g., "data", "results", "data.items")

        Returns:
            List of record dictionaries
        """
        if records_selector:
            # Navigate through the data using the selector path
            parts = records_selector.split(".")
            current = data

            for part in parts:
                if isinstance(current, dict):
                    current = current.get(part)
                    if current is None:
                        logger.warning(
                            f"Records selector path '{records_selector}' not found in response"
                        )
                        return []
                else:
                    logger.warning(f"Cannot navigate '{part}' in non-dict value")
                    return []

            # Current should now be the records array
            if isinstance(current, list):
                return [record for record in current if isinstance(record, dict)]
            else:
                logger.warning(
                    f"Records selector resulted in non-list value: {type(current)}"
                )
                return []
        else:
            # No selector - data should be a list
            if isinstance(data, list):
                return [record for record in data if isinstance(record, dict)]
            elif isinstance(data, dict):
                # Check if there's a common pattern
                for key in ["data", "results", "items", "records"]:
                    if key in data and isinstance(data[key], list):
                        logger.info(f"Auto-detected records at key '{key}'")
                        return [
                            record for record in data[key] if isinstance(record, dict)
                        ]

                # If no common pattern, treat the dict as a single record
                logger.info("Treating response dict as single record")
                return [data]
            else:
                logger.warning(f"Unexpected data type: {type(data)}")
                return []

    def fetch_paginated_data(
        self,
        method: str,
        path: str,
        query_params: List[Dict[str, str]] = None,
        headers: List[Dict[str, str]] = None,
        body_template: Optional[str] = None,
        pagination: Optional[Dict] = None,
        records_selector: Optional[str] = None,
        max_pages: int = 100,
    ) -> List[Dict]:
        """
        Fetch data from API with pagination support.

        Args:
            method: HTTP method (GET, POST, etc.)
            path: API endpoint path
            query_params: List of query parameter dicts
            headers: List of custom header dicts
            body_template: JSON body template for POST/PUT requests
            pagination: Pagination configuration dict
            records_selector: JSON path to extract records from response
            max_pages: Maximum number of pages to fetch

        Returns:
            List of all records fetched across all pages
        """
        all_records = []
        page_num = 1
        pages_fetched = 0

        # Parse pagination config
        pagination = pagination or {}
        pagination_type = pagination.get("type", "none")
        page_param = pagination.get("page_param", "page")
        page_size_param = pagination.get("page_size_param", "limit")
        page_size = pagination.get("page_size", 100)
        next_url_path = pagination.get("next_url_path") or pagination.get(
            "cursorUrlPathInResponse"
        )  # For URL-based pagination
        cursor_param = pagination.get(
            "cursorParam", "cursor"
        )  # For cursor-based pagination
        cursor_value = None  # Track cursor value for cursor-based pagination
        use_full_url = pagination.get(
            "useFullUrl", False
        )  # Whether to use full URL from response

        logger.info(f"Starting paginated fetch: {method} {path}")
        logger.info(f"Pagination type: {pagination_type}, max_pages: {max_pages}")

        while page_num <= max_pages:
            try:
                # Build request parameters
                current_query_params = list(query_params) if query_params else []

                # Add pagination parameters based on type
                if pagination_type == "page_number":
                    current_query_params.append(
                        {"key": page_param, "value": str(page_num)}
                    )
                    current_query_params.append(
                        {"key": page_size_param, "value": str(page_size)}
                    )
                elif pagination_type == "offset":
                    offset = (page_num - 1) * page_size
                    current_query_params.append({"key": "offset", "value": str(offset)})
                    current_query_params.append(
                        {"key": page_size_param, "value": str(page_size)}
                    )
                elif pagination_type == "cursor_url":
                    # For cursor-based pagination, add page size and cursor (if we have one)
                    if not use_full_url or not cursor_value:
                        # Add page size parameter if not using full URL or on first page
                        current_query_params.append(
                            {"key": page_size_param, "value": str(page_size)}
                        )
                    if cursor_value and not use_full_url:
                        # Add cursor as query parameter if not using full URL
                        current_query_params.append(
                            {"key": cursor_param, "value": cursor_value}
                        )

                # Build URL and headers
                if use_full_url and cursor_value and pagination_type == "cursor_url":
                    # Use the full URL from the previous response
                    url = cursor_value
                    request_headers = self._build_headers(headers)
                else:
                    # Build URL normally with query params
                    url = self._build_url(path, current_query_params)
                    request_headers = self._build_headers(headers)

                logger.info(f"Fetching page {page_num}: {url}")

                # Make request
                if method.upper() in ["POST", "PUT", "PATCH"]:
                    try:
                        body = json.loads(body_template) if body_template else {}
                    except json.JSONDecodeError as e:
                        raise ValueError(f"Invalid JSON in body_template: {str(e)}")

                    response = self.session.request(
                        method=method.upper(),
                        url=url,
                        headers=request_headers,
                        json=body,
                        timeout=30,
                    )
                else:
                    response = self.session.request(
                        method=method.upper(),
                        url=url,
                        headers=request_headers,
                        timeout=30,
                    )

                response.raise_for_status()

                # Parse response
                data = response.json()

                # Extract records
                records = self.extract_records(data, records_selector)

                if not records:
                    logger.info(
                        f"No records found on page {page_num}, stopping pagination"
                    )
                    break

                all_records.extend(records)
                pages_fetched += 1
                logger.info(
                    f"Page {page_num}: fetched {len(records)} records (total: {len(all_records)})"
                )

                # Check if there are more pages
                if pagination_type in ["url", "cursor_url"] and next_url_path:
                    # Extract next URL or cursor from response
                    next_value = data
                    for part in next_url_path.split("."):
                        if isinstance(next_value, dict):
                            next_value = next_value.get(part)
                        else:
                            next_value = None
                            break

                    if not next_value:
                        logger.info("No next URL/cursor found, stopping pagination")
                        break

                    if pagination_type == "cursor_url":
                        # For cursor pagination, store the value (either cursor or full URL)
                        cursor_value = next_value
                        if use_full_url:
                            logger.info(f"Next URL: {cursor_value}")
                        else:
                            logger.info(f"Next cursor: {cursor_value}")
                    else:
                        # For URL pagination, use the full next URL
                        path = next_value
                        current_query_params = []  # Next URL already contains params
                elif pagination_type in ["page_number", "offset"]:
                    # Check if we got fewer records than page size (last page)
                    if len(records) < page_size:
                        logger.info(
                            f"Received fewer records than page size, stopping pagination"
                        )
                        break
                elif pagination_type == "none":
                    # No pagination, stop after first page
                    logger.info("No pagination configured, stopping after first page")
                    break
                elif pagination_type not in ["cursor_url", "url"]:
                    # Unknown pagination type
                    logger.warning(
                        f"Unknown pagination type: {pagination_type}, stopping"
                    )
                    break

                page_num += 1

            except requests.exceptions.RequestException as e:
                logger.error(f"Error fetching page {page_num}: {e}")
                raise ValueError(f"API request failed: {str(e)}")
            except json.JSONDecodeError as e:
                logger.error(f"Error parsing JSON response: {e}")
                raise ValueError(f"Invalid JSON response: {str(e)}")

        logger.info(
            f"Completed fetch: {len(all_records)} total records across {pages_fetched} pages"
        )
        return all_records
