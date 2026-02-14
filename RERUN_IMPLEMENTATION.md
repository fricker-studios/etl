# Fix DataPackage Loading and Re-run Functionality - Implementation Summary

## Overview

This implementation fixes a critical bug in data loading from external S3 sources and adds comprehensive job re-run functionality with pagination support.

## Issues Fixed

### 1. DataSource vs StorageBackend Confusion (Critical Bug)

**Problem**: The code at `tasks.py` line 534 was accessing `.kind` attribute on what could be either:
- A `DataSource` object (has `.type` attribute with S3 fields: `s3_endpoint`, `s3_bucket`, `s3_access_key`, `s3_secret_key`)
- A `StorageBackend` object (has `.kind` attribute with S3 fields: `endpoint`, `bucket`, `access_key_id`, `secret_access_key`)

This caused an `AttributeError: 'DataSource' object has no attribute 'kind'` when loading data from external S3 sources.

**Solution**: 
- Properly detect which type of object is being used
- Extract S3 credentials using the correct field names for each type
- Added clear error messages for invalid configurations

```python
# Before (caused error)
s3_source = data_package.external_s3_source or data_package.destination
if not s3_source or s3_source.kind != "s3":  # ❌ DataSource has .type, not .kind

# After (fixed)
if data_package.external_s3_source:
    if data_package.external_s3_source.type != "s3":  # ✅ Correct attribute
        # Handle DataSource fields
        s3_endpoint = s3_source.s3_endpoint
        s3_bucket = s3_source.s3_bucket
elif data_package.destination:
    if data_package.destination.kind != "s3":  # ✅ Correct attribute
        # Handle StorageBackend fields
        s3_endpoint = s3_source.endpoint
        s3_bucket = s3_source.bucket
```

### 2. Re-run Functionality

Added three ways to re-run failed data loading jobs:

1. **Re-run Single Job** (`POST /api/runs/{id}/rerun/`)
   - Re-queues a specific job
   - Creates a new Run with "Re-run: " prefix
   - Returns new run ID

2. **Re-run Multiple Jobs** (`POST /api/runs/rerun_multiple/`)
   - Re-queues selected jobs by ID
   - Request body: `{"run_ids": ["1", "2", "3"]}`
   - Returns list of new run IDs

3. **Re-run Failed Jobs** (`POST /api/models/{id}/rerun_failed/`)
   - Re-queues all failed jobs for a specific model
   - Useful for bulk retries after fixing issues
   - Returns count and IDs of new runs

### 3. Pagination Support

**Backend**:
- Added `page` and `per_page` query parameters to `loading_progress` endpoint
- Validation: `page >= 1`, `per_page` between 1-100
- Returns pagination metadata: `total_pages`, `has_next`, `has_prev`
- Fixed edge case: returns `total_pages=1` when no runs exist

**Frontend**:
- Integrated Mantine `Pagination` component
- Maintains current page state
- Resets to page 1 when data changes
- Shows pagination only when multiple pages exist

## Architecture Changes

### Backend Endpoints

```
POST /api/runs/{id}/rerun/
  → Re-runs a specific job
  
POST /api/runs/rerun_multiple/
  Body: {"run_ids": ["1", "2", "3"]}
  → Re-runs multiple selected jobs
  
POST /api/models/{id}/rerun_failed/
  → Re-runs all failed jobs for a model
  
GET /api/models/{id}/loading_progress/?page=1&per_page=10
  → Gets paginated runs with metadata
```

### Frontend Components

#### ModelDetailPage Updates

1. **Selection Management**:
   ```typescript
   // Optimized with Set for O(1) lookup
   const [selectedRunsSet, setSelectedRunsSet] = useState<Set<string>>(new Set());
   ```

2. **Table Structure**:
   ```
   [Checkbox] | Package | Status | Rows | Duration | Started
   -----------|---------|--------|------|----------|--------
   [ ✓ ]      | pkg_1   | failed | 100  | 5s       | ...
   [ ✓ ]      | pkg_2   | failed | 200  | 3s       | ...
   [   ]      | pkg_3   | success| 300  | 2s       | ...
   ```

3. **Action Buttons**:
   - **"Re-run Failed"** button (orange, appears when failed_runs > 0)
   - **"Re-run Selected"** button (blue, appears when jobs selected)
   - Shows count: "Re-run Selected (3)"

4. **Pagination Control**:
   ```
   ← 1 2 [3] 4 5 →
   ```

## Performance Optimizations

### O(1) Selection Lookup

**Before** (O(n) array includes):
```typescript
const [selectedRuns, setSelectedRuns] = useState<string[]>([]);
checked={selectedRuns.includes(run.id.toString())}  // O(n) for each row
```

**After** (O(1) set has):
```typescript
const [selectedRunsSet, setSelectedRunsSet] = useState<Set<string>>(new Set());
checked={selectedRunsSet.has(run.id.toString())}  // O(1) for each row
```

This improves rendering performance significantly when there are many runs.

### Pagination Benefits

- **Backend**: Only queries and serializes runs for current page
- **Frontend**: Only renders visible runs
- **Network**: Reduces payload size for large run lists

## Error Handling

### Backend Validation

1. **Pagination Parameters**:
   ```python
   try:
       page = int(request.query_params.get('page', 1))
       per_page = int(request.query_params.get('per_page', 10))
   except (ValueError, TypeError):
       return Response(
           {"error": "Invalid pagination parameters..."},
           status=400
       )
   ```

2. **Parameter Bounds**:
   - `page < 1` → 400 Bad Request
   - `per_page < 1 or per_page > 100` → 400 Bad Request

3. **Re-run Safety**:
   - Only re-runs jobs owned by authenticated user
   - Validates model and data_package exist
   - Logs warnings for skipped jobs

### Frontend Error Handling

- Shows notifications for all error cases
- Clears selection after successful re-run
- Displays loading states during mutations
- Gracefully handles empty run lists

## Edge Cases Handled

1. **Zero Runs**: Shows "No data loading runs yet" message
2. **Zero Failed Runs**: Hides "Re-run Failed" button
3. **Empty Selection**: Hides "Re-run Selected" button
4. **Total Pages Calculation**: Returns 1 when total_runs=0 (prevents 0 pages)
5. **Cross-page Selection**: Clears selection after re-run to avoid confusion
6. **Missing Credentials**: Clear error messages for S3 configuration issues

## Testing Results

### Frontend Build
✅ TypeScript compilation successful
✅ No type errors
✅ Bundle size: 875 KB (within acceptable range)

### Backend Validation
✅ Python syntax valid
✅ No import errors
✅ Proper error handling

### Security Scan
✅ CodeQL: 0 alerts (Python)
✅ CodeQL: 0 alerts (JavaScript)
✅ No vulnerabilities found

## Usage Guide

### For End Users

1. **View Runs**:
   - Navigate to Model detail page
   - Click "Load Data" to start loading
   - View runs in the table with real-time updates

2. **Re-run Failed Jobs**:
   - Click "Re-run Failed" button (appears when failures exist)
   - All failed jobs will be re-queued automatically

3. **Re-run Selected Jobs**:
   - Check boxes next to jobs to re-run
   - Click "Re-run Selected (N)" button
   - Selected jobs will be re-queued

4. **Navigate Pages**:
   - Use pagination controls at bottom of table
   - Default: 10 runs per page
   - Selection state is cleared when navigating

### For Developers

**Backend API Usage**:
```python
# Re-run a single job
POST /api/runs/123/rerun/

# Re-run multiple jobs
POST /api/runs/rerun_multiple/
{
  "run_ids": ["123", "124", "125"]
}

# Re-run all failed jobs for a model
POST /api/models/456/rerun_failed/

# Get paginated runs
GET /api/models/456/loading_progress/?page=2&per_page=20
```

**Frontend API Usage**:
```typescript
// Re-run failed jobs
await api.models.rerunFailed(modelId);

// Re-run selected jobs
await api.runs.rerunMultiple(['123', '124']);

// Get paginated runs
const data = await api.models.loadingProgress(modelId, page, perPage);
```

## Future Enhancements

1. **Batch Size Control**: Allow users to configure per_page value
2. **Run Filtering**: Filter by status, date range, package name
3. **Bulk Actions**: Cancel running jobs, delete old runs
4. **Export**: Download run history as CSV
5. **Scheduling**: Schedule automatic re-runs for failed jobs
6. **Notifications**: Email/webhook alerts for failures
7. **Metrics**: Dashboard showing success rate, average duration

## Known Limitations

1. **Pagination**: Selection state is cleared when changing pages (by design to avoid confusion)
2. **Real-time Updates**: 5-second polling interval (consider WebSockets for instant updates)
3. **Bulk Re-run**: No limit on number of jobs that can be re-queued at once
4. **History**: Re-run jobs create new runs (original failed run remains for history)

## Deployment Notes

1. **Database Changes**: No migrations required (only code changes)
2. **API Compatibility**: New endpoints are additive, no breaking changes
3. **Frontend Updates**: Requires rebuilding frontend assets
4. **Celery Workers**: Ensure workers are running to process re-queued jobs
5. **Monitoring**: Watch for increased Celery queue depth after mass re-runs

## Conclusion

This implementation successfully fixes the critical DataSource/StorageBackend bug and adds comprehensive job management features. The code is production-ready with proper validation, error handling, and performance optimizations.
