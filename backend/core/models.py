from django.db import models
from django.contrib.auth.models import User


class StorageBackend(models.Model):
    """Storage backend configuration (S3, ClickHouse, etc.) - Used for application storage"""
    KIND_CHOICES = [
        ('s3', 'S3'),
        ('clickhouse', 'ClickHouse'),
    ]
    
    MODE_CHOICES = [
        ('single', 'Single'),
        ('cluster', 'Cluster'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='storage_backends')
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    name = models.CharField(max_length=255)
    
    # S3 fields
    endpoint = models.URLField(blank=True, null=True)
    region = models.CharField(max_length=100, blank=True, null=True)
    bucket = models.CharField(max_length=255, blank=True, null=True)
    access_key_id = models.CharField(max_length=255, blank=True, null=True)
    secret_access_key = models.CharField(max_length=255, blank=True, null=True)
    path_style = models.BooleanField(default=False)
    tls_verify = models.BooleanField(default=True)
    
    # ClickHouse fields
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, blank=True, null=True)
    hosts = models.JSONField(default=list, blank=True)  # [{"host": "localhost", "port": 9000}]
    database = models.CharField(max_length=255, blank=True, null=True)
    username = models.CharField(max_length=255, blank=True, null=True)
    password = models.CharField(max_length=255, blank=True, null=True)
    secure = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.name} ({self.kind})"


class DataSource(models.Model):
    """Data source configuration - API, Database, S3, SFTP, etc."""
    TYPE_CHOICES = [
        ('api', 'API'),
        ('database', 'Database'),
        ('s3', 'S3'),
        ('sftp', 'SFTP'),
    ]
    
    AUTH_TYPE_CHOICES = [
        ('none', 'None'),
        ('bearer', 'Bearer Token'),
        ('basic', 'Basic Auth'),
        ('header', 'Custom Header'),
        ('ssh_key', 'SSH Key'),
    ]
    
    DATABASE_TYPE_CHOICES = [
        ('postgresql', 'PostgreSQL'),
        ('mysql', 'MySQL'),
        ('mongodb', 'MongoDB'),
        ('sqlserver', 'SQL Server'),
        ('oracle', 'Oracle'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='data_sources')
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    
    # API fields
    base_url = models.URLField(blank=True, null=True)
    auth_type = models.CharField(max_length=20, choices=AUTH_TYPE_CHOICES, default='none')
    bearer_token = models.CharField(max_length=500, blank=True, null=True)
    basic_user = models.CharField(max_length=255, blank=True, null=True)
    basic_pass = models.CharField(max_length=255, blank=True, null=True)
    header_name = models.CharField(max_length=255, blank=True, null=True)
    header_value = models.CharField(max_length=500, blank=True, null=True)
    
    # Database fields
    database_type = models.CharField(max_length=20, choices=DATABASE_TYPE_CHOICES, blank=True, null=True)
    host = models.CharField(max_length=255, blank=True, null=True)
    port = models.IntegerField(blank=True, null=True)
    database_name = models.CharField(max_length=255, blank=True, null=True)
    username = models.CharField(max_length=255, blank=True, null=True)
    password = models.CharField(max_length=255, blank=True, null=True)
    
    # S3 fields
    s3_endpoint = models.URLField(blank=True, null=True)
    s3_region = models.CharField(max_length=100, blank=True, null=True)
    s3_bucket = models.CharField(max_length=255, blank=True, null=True)
    s3_access_key = models.CharField(max_length=255, blank=True, null=True)
    s3_secret_key = models.CharField(max_length=255, blank=True, null=True)
    
    # SFTP fields
    sftp_host = models.CharField(max_length=255, blank=True, null=True)
    sftp_port = models.IntegerField(default=22, blank=True, null=True)
    sftp_username = models.CharField(max_length=255, blank=True, null=True)
    sftp_password = models.CharField(max_length=255, blank=True, null=True)
    sftp_key = models.TextField(blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.name} ({self.type})"


class Stream(models.Model):
    """Stream definition - Maps data source object (table/file/endpoint) to data model"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='streams')
    data_source = models.ForeignKey(DataSource, on_delete=models.CASCADE, related_name='streams', null=True, blank=True)
    name = models.CharField(max_length=255)
    
    # Source object definition (varies by data source type)
    # For API: endpoint path and method
    # For Database: table/view name and query
    # For S3: bucket path pattern
    # For SFTP: file path pattern
    source_object = models.JSONField(default=dict)  # Flexible structure for different source types
    
    # API-specific fields (for backward compatibility)
    method = models.CharField(max_length=10, blank=True, null=True)
    path = models.CharField(max_length=500, blank=True, null=True)
    query_params = models.JSONField(default=list, blank=True)
    headers = models.JSONField(default=list, blank=True)
    body_template = models.TextField(blank=True, null=True)
    pagination = models.JSONField(default=dict, blank=True)
    
    # Schema and preview
    preview_json = models.JSONField(blank=True, null=True)
    inferred_schema = models.JSONField(blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return self.name


class DataPackage(models.Model):
    """Data packages - files produced/consumed from streams"""
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('queued', 'Queued'),
        ('materialized', 'Materialized'),
        ('failed', 'Failed'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='packages')
    stream = models.ForeignKey(Stream, on_delete=models.CASCADE, related_name='packages')
    destination = models.ForeignKey(StorageBackend, on_delete=models.SET_NULL, null=True, blank=True, related_name='packages')
    
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    row_count_estimate = models.IntegerField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return self.name


class Model(models.Model):
    """Data models - Dimensional or Data Vault"""
    TYPE_CHOICES = [
        ('dimensional', 'Dimensional'),
        ('data_vault', 'Data Vault'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='models')
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    packages = models.ManyToManyField(DataPackage, related_name='models', blank=True)
    
    # Data Vault fields
    hubs = models.JSONField(default=list, blank=True)  # [{"name": "Hub_Customer", "businessKey": "customer_id"}]
    links = models.JSONField(default=list, blank=True)  # [{"name": "Link_Order", "hubs": ["Hub_Customer", "Hub_Product"]}]
    satellites = models.JSONField(default=list, blank=True)  # [{"name": "Sat_Customer", "parent": "Hub_Customer", "attributes": ["name", "email"]}]
    
    # Dimensional fields
    facts = models.JSONField(default=list, blank=True)  # [{"name": "Fact_Sales", "grain": "transaction", "measures": ["amount"], "dimensions": ["Dim_Date"]}]
    dimensions = models.JSONField(default=list, blank=True)  # [{"name": "Dim_Date", "key": "date_id", "attributes": ["date", "year", "month"]}]
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.name} ({self.type})"
