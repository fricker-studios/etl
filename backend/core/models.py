from django.db import models
from django.contrib.auth.models import User


class StorageBackend(models.Model):
    """Storage backend configuration (S3, ClickHouse, etc.)"""
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


class ApiSource(models.Model):
    """API source configuration with authentication"""
    AUTH_TYPE_CHOICES = [
        ('none', 'None'),
        ('bearer', 'Bearer Token'),
        ('basic', 'Basic Auth'),
        ('header', 'Custom Header'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='api_sources')
    name = models.CharField(max_length=255)
    base_url = models.URLField()
    auth_type = models.CharField(max_length=20, choices=AUTH_TYPE_CHOICES, default='none')
    
    # Auth fields
    bearer_token = models.CharField(max_length=500, blank=True, null=True)
    basic_user = models.CharField(max_length=255, blank=True, null=True)
    basic_pass = models.CharField(max_length=255, blank=True, null=True)
    header_name = models.CharField(max_length=255, blank=True, null=True)
    header_value = models.CharField(max_length=500, blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return self.name


class Stream(models.Model):
    """Stream definition - Source -> Model mappings with schedule"""
    METHOD_CHOICES = [
        ('GET', 'GET'),
        ('POST', 'POST'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='streams')
    api_source = models.ForeignKey(ApiSource, on_delete=models.CASCADE, related_name='streams')
    name = models.CharField(max_length=255)
    method = models.CharField(max_length=10, choices=METHOD_CHOICES, default='GET')
    path = models.CharField(max_length=500)
    
    query_params = models.JSONField(default=list, blank=True)  # [{"key": "page", "value": "1"}]
    headers = models.JSONField(default=list, blank=True)  # [{"key": "Accept", "value": "application/json"}]
    body_template = models.TextField(blank=True, null=True)
    
    pagination = models.JSONField(default=dict, blank=True)  # {"type": "page", "pageParam": "page", ...}
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
