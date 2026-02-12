from django.db import models
from django.contrib.auth.models import User
from .encryption import encrypt_value, decrypt_value


class StorageBackend(models.Model):
    """Storage backend configuration (S3, ClickHouse, etc.) - Used for application storage"""

    KIND_CHOICES = [
        ("s3", "S3"),
        ("clickhouse", "ClickHouse"),
    ]

    MODE_CHOICES = [
        ("single", "Single"),
        ("cluster", "Cluster"),
    ]

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="storage_backends"
    )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    name = models.CharField(max_length=255)

    # S3 fields
    endpoint = models.URLField(blank=True, null=True)
    region = models.CharField(max_length=100, blank=True, null=True)
    bucket = models.CharField(max_length=255, blank=True, null=True)
    access_key_id = models.CharField(max_length=255, blank=True, null=True)
    secret_access_key = models.CharField(
        max_length=1000, blank=True, null=True
    )  # Encrypted
    path_style = models.BooleanField(default=False)
    tls_verify = models.BooleanField(default=True)

    # ClickHouse fields
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, blank=True, null=True)
    hosts = models.JSONField(
        default=list, blank=True
    )  # [{"host": "localhost", "port": 9000}]
    database = models.CharField(max_length=255, blank=True, null=True)
    username = models.CharField(max_length=255, blank=True, null=True)
    password = models.CharField(max_length=1000, blank=True, null=True)  # Encrypted
    secure = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.kind})"

    def save(self, *args, **kwargs):
        """Override save to encrypt sensitive fields."""
        # Encrypt S3 credentials
        if self.secret_access_key and not self._is_encrypted(self.secret_access_key):
            self.secret_access_key = encrypt_value(self.secret_access_key)

        # Encrypt ClickHouse credentials
        if self.password and not self._is_encrypted(self.password):
            self.password = encrypt_value(self.password)

        super().save(*args, **kwargs)

    def _is_encrypted(self, value):
        """Check if a value is already encrypted (Fernet encrypted strings start with 'gAAAAA')."""
        return value and len(value) > 20 and value.startswith("gAAAAA")

    def get_decrypted_secret_access_key(self):
        """Get decrypted S3 secret access key."""
        return decrypt_value(self.secret_access_key) if self.secret_access_key else None

    def get_decrypted_password(self):
        """Get decrypted ClickHouse password."""
        return decrypt_value(self.password) if self.password else None


class DataSource(models.Model):
    """Data source configuration - API, Database, S3, SFTP, etc."""

    TYPE_CHOICES = [
        ("api", "API"),
        ("database", "Database"),
        ("s3", "S3"),
        ("sftp", "SFTP"),
    ]

    AUTH_TYPE_CHOICES = [
        ("none", "None"),
        ("bearer", "Bearer Token"),
        ("basic", "Basic Auth"),
        ("header", "Custom Header"),
        ("ssh_key", "SSH Key"),
    ]

    DATABASE_TYPE_CHOICES = [
        ("postgresql", "PostgreSQL"),
        ("mysql", "MySQL"),
        ("mongodb", "MongoDB"),
        ("sqlserver", "SQL Server"),
        ("oracle", "Oracle"),
    ]

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="data_sources"
    )
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)

    # API fields
    base_url = models.URLField(blank=True, null=True)
    auth_type = models.CharField(
        max_length=20, choices=AUTH_TYPE_CHOICES, default="none"
    )
    bearer_token = models.CharField(max_length=1000, blank=True, null=True)  # Encrypted
    basic_user = models.CharField(max_length=255, blank=True, null=True)
    basic_pass = models.CharField(max_length=1000, blank=True, null=True)  # Encrypted
    header_name = models.CharField(max_length=255, blank=True, null=True)
    header_value = models.CharField(max_length=1000, blank=True, null=True)  # Encrypted

    # Database fields
    database_type = models.CharField(
        max_length=20, choices=DATABASE_TYPE_CHOICES, blank=True, null=True
    )
    host = models.CharField(max_length=255, blank=True, null=True)
    port = models.IntegerField(blank=True, null=True)
    database_name = models.CharField(max_length=255, blank=True, null=True)
    username = models.CharField(max_length=255, blank=True, null=True)
    password = models.CharField(max_length=1000, blank=True, null=True)  # Encrypted

    # S3 fields
    s3_endpoint = models.URLField(blank=True, null=True)
    s3_region = models.CharField(max_length=100, blank=True, null=True)
    s3_bucket = models.CharField(max_length=255, blank=True, null=True)
    s3_access_key = models.CharField(max_length=255, blank=True, null=True)
    s3_secret_key = models.CharField(
        max_length=1000, blank=True, null=True
    )  # Encrypted

    # SFTP fields
    sftp_host = models.CharField(max_length=255, blank=True, null=True)
    sftp_port = models.IntegerField(default=22, blank=True, null=True)
    sftp_username = models.CharField(max_length=255, blank=True, null=True)
    sftp_password = models.CharField(
        max_length=1000, blank=True, null=True
    )  # Encrypted
    sftp_key = models.TextField(blank=True, null=True)  # Encrypted

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.type})"

    def save(self, *args, **kwargs):
        """Override save to encrypt sensitive fields."""
        # Encrypt API credentials
        if self.bearer_token and not self._is_encrypted(self.bearer_token):
            self.bearer_token = encrypt_value(self.bearer_token)
        if self.basic_pass and not self._is_encrypted(self.basic_pass):
            self.basic_pass = encrypt_value(self.basic_pass)
        if self.header_value and not self._is_encrypted(self.header_value):
            self.header_value = encrypt_value(self.header_value)

        # Encrypt database credentials
        if self.password and not self._is_encrypted(self.password):
            self.password = encrypt_value(self.password)

        # Encrypt S3 credentials
        if self.s3_secret_key and not self._is_encrypted(self.s3_secret_key):
            self.s3_secret_key = encrypt_value(self.s3_secret_key)

        # Encrypt SFTP credentials
        if self.sftp_password and not self._is_encrypted(self.sftp_password):
            self.sftp_password = encrypt_value(self.sftp_password)
        if self.sftp_key and not self._is_encrypted(self.sftp_key):
            self.sftp_key = encrypt_value(self.sftp_key)

        super().save(*args, **kwargs)

    def _is_encrypted(self, value):
        """Check if a value is already encrypted (Fernet encrypted strings start with 'gAAAAA')."""
        return value and len(value) > 20 and value.startswith("gAAAAA")

    def get_decrypted_bearer_token(self):
        """Get decrypted bearer token."""
        return decrypt_value(self.bearer_token) if self.bearer_token else None

    def get_decrypted_basic_pass(self):
        """Get decrypted basic password."""
        return decrypt_value(self.basic_pass) if self.basic_pass else None

    def get_decrypted_header_value(self):
        """Get decrypted header value."""
        return decrypt_value(self.header_value) if self.header_value else None

    def get_decrypted_password(self):
        """Get decrypted database password."""
        return decrypt_value(self.password) if self.password else None

    def get_decrypted_s3_secret_key(self):
        """Get decrypted S3 secret key."""
        return decrypt_value(self.s3_secret_key) if self.s3_secret_key else None

    def get_decrypted_sftp_password(self):
        """Get decrypted SFTP password."""
        return decrypt_value(self.sftp_password) if self.sftp_password else None

    def get_decrypted_sftp_key(self):
        """Get decrypted SFTP key."""
        return decrypt_value(self.sftp_key) if self.sftp_key else None


class Stream(models.Model):
    """Stream definition - Maps data source object (table/file/endpoint) to data model"""

    INGESTION_STRATEGY_CHOICES = [
        ("full_refresh", "Full Refresh"),
        ("incremental", "Incremental Load"),
        ("snapshot", "Snapshot"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="streams")
    data_source = models.ForeignKey(
        DataSource,
        on_delete=models.CASCADE,
        related_name="streams",
        null=True,
        blank=True,
    )
    topic = models.ForeignKey(
        "Topic",
        on_delete=models.SET_NULL,
        related_name="streams",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=255)

    # Source object definition (varies by data source type)
    # For API: endpoint path and method
    # For Database: table/view name and query
    # For S3: bucket path pattern
    # For SFTP: file path pattern
    source_object = models.JSONField(
        default=dict
    )  # Flexible structure for different source types

    # API-specific fields (for backward compatibility)
    method = models.CharField(max_length=10, blank=True, null=True)
    path = models.CharField(max_length=500, blank=True, null=True)
    query_params = models.JSONField(default=list, blank=True)
    headers = models.JSONField(default=list, blank=True)
    body_template = models.TextField(blank=True, null=True)
    pagination = models.JSONField(default=dict, blank=True)

    # Database-specific fields
    table_name = models.CharField(max_length=255, blank=True, null=True)
    ingestion_strategy = models.CharField(
        max_length=20, choices=INGESTION_STRATEGY_CHOICES, blank=True, null=True
    )
    incremental_key = models.CharField(
        max_length=255, blank=True, null=True
    )  # Column name for incremental loads

    # S3-specific fields
    s3_path_pattern = models.CharField(
        max_length=1000, blank=True, null=True
    )  # e.g., "data/year={year}/month={month}/*.parquet"
    s3_file_format = models.CharField(
        max_length=50, blank=True, null=True
    )  # e.g., "parquet", "csv", "json"

    # SFTP-specific fields
    sftp_path_pattern = models.CharField(
        max_length=1000, blank=True, null=True
    )  # e.g., "/data/*.csv"
    sftp_file_format = models.CharField(
        max_length=50, blank=True, null=True
    )  # e.g., "csv", "json", "xml"

    # Scheduling
    schedule_enabled = models.BooleanField(default=False)
    schedule_cron = models.CharField(
        max_length=100, blank=True, null=True
    )  # Cron expression
    schedule_interval_minutes = models.IntegerField(
        blank=True, null=True
    )  # Alternative to cron

    # Schema and preview (for API sources)
    preview_json = models.JSONField(blank=True, null=True)
    inferred_schema = models.JSONField(blank=True, null=True)
    records_selector = models.CharField(
        max_length=255, blank=True, null=True
    )  # JSON path to extract records array (e.g., "data", "results")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        """Override save to handle scheduling with Celery Beat."""
        super().save(*args, **kwargs)

        # Create or update Celery Beat periodic task for this stream
        from core.celery_utils import create_or_update_stream_task
        create_or_update_stream_task(self)

    def delete(self, *args, **kwargs):
        """Override delete to clean up any scheduled tasks."""
        # Delete the associated Celery Beat periodic task
        from core.celery_utils import delete_stream_task
        delete_stream_task(self)
        super().delete(*args, **kwargs)


class Topic(models.Model):
    """Topic - Collection of data packages with a defined schema"""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="topics")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    @property
    def current_revision(self):
        """Get the current (latest) revision of this topic."""
        return self.revisions.order_by("-revision_number").first()


class TopicRevision(models.Model):
    """Topic revision - Represents a schema version for a topic"""

    topic = models.ForeignKey(Topic, on_delete=models.CASCADE, related_name="revisions")
    revision_number = models.IntegerField()

    # Schema definition - array of column definitions
    # [{"name": "user_id", "position": 1, "data_type": "integer", "nullable": false}, ...]
    schema = models.JSONField(default=list)

    # Change description
    change_description = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["topic", "-revision_number"]
        unique_together = ["topic", "revision_number"]

    def __str__(self):
        return f"{self.topic.name} - Rev {self.revision_number}"


class DataPackage(models.Model):
    """Data packages - files produced/consumed from streams, linked to topic revisions"""

    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("queued", "Queued"),
        ("materialized", "Materialized"),
        ("failed", "Failed"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="packages")
    topic_revision = models.ForeignKey(
        TopicRevision,
        on_delete=models.CASCADE,
        related_name="packages",
        null=True,
        blank=True,
    )
    stream = models.ForeignKey(
        Stream, on_delete=models.CASCADE, related_name="packages", null=True, blank=True
    )
    destination = models.ForeignKey(
        StorageBackend,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="packages",
    )

    name = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    row_count_estimate = models.IntegerField(null=True, blank=True)

    # For S3 data sources: file path/key
    file_path = models.CharField(max_length=1000, blank=True, null=True)
    file_size_bytes = models.BigIntegerField(null=True, blank=True)

    # Reference to external S3 data source for loading data later
    external_s3_source = models.ForeignKey(
        DataSource,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="external_packages",
        help_text="External S3 data source where this package's data is located",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class Model(models.Model):
    """Data models - Dimensional or Data Vault"""

    TYPE_CHOICES = [
        ("dimensional", "Dimensional"),
        ("data_vault", "Data Vault"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="models")
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    topics = models.ManyToManyField(Topic, related_name="models", blank=True)

    # Data Vault fields
    # Each entity contains: name, topic_id, fields mapping, and field_mappings for source tracking
    # Example hub: [{"name": "Hub_Customer", "topic": 1, "business_key": "customer_id", "fields": ["customer_id", "customer_name"], "field_mappings": [{"model_field": "customer_id", "topic_field": "id", "topic_id": 1}]}]
    hubs = models.JSONField(default=list, blank=True)
    # Example link: [{"name": "Link_Order", "topic": 1, "hub_references": ["Hub_Customer", "Hub_Product"], "fields": ["order_id"], "field_mappings": [...]}]
    links = models.JSONField(default=list, blank=True)
    # Example satellite: [{"name": "Sat_Customer", "topic": 1, "parent": "Hub_Customer", "fields": ["email", "phone", "address"], "field_mappings": [...]}]
    satellites = models.JSONField(default=list, blank=True)

    # Dimensional fields
    # Each entity contains: name, topic_id, fields mapping, and field_mappings for source tracking
    # Example fact: [{"name": "Fact_Sales", "topic": 1, "grain": "transaction", "measures": ["amount", "quantity"], "dimension_keys": ["date_id", "customer_id"], "field_mappings": [...]}]
    facts = models.JSONField(default=list, blank=True)
    # Example dimension: [{"name": "Dim_Date", "topic": 1, "key": "date_id", "fields": ["date", "year", "month", "day"], "field_mappings": [...]}]
    dimensions = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.type})"


class Run(models.Model):
    """Execution run history for streams/pipelines"""

    STATUS_CHOICES = [
        ("queued", "Queued"),
        ("running", "Running"),
        ("success", "Success"),
        ("failed", "Failed"),
        ("cancelled", "Cancelled"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="runs")
    stream = models.ForeignKey(
        Stream, on_delete=models.CASCADE, related_name="runs", null=True, blank=True
    )
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="queued")

    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.IntegerField(null=True, blank=True)

    rows_processed = models.IntegerField(null=True, blank=True)
    error_message = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.status})"
