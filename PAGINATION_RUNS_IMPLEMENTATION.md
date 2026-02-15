# Pagination Implementation for Runs Page

## Overview
Added pagination support to the Runs page to improve performance and user experience when dealing with large numbers of runs.

## Implementation Details

### Backend Changes

#### RunViewSet (`backend/core/views.py`)

Added a custom `list()` method to handle pagination:

```python
def list(self, request, *args, **kwargs):
    """List runs with pagination support"""
    # Get pagination parameters (defaults: page=1, per_page=10)
    page = int(request.query_params.get("page", 1))
    per_page = int(request.query_params.get("per_page", 10))
    
    # Validate parameters
    # - page must be >= 1
    # - per_page must be between 1 and 100
    
    # Apply pagination to queryset (ordered by -created_at)
    start_idx = (page - 1) * per_page
    end_idx = start_idx + per_page
    paginated_queryset = queryset[start_idx:end_idx]
    
    # Return response with results and pagination metadata
    return Response({
        "results": serializer.data,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total_count": total_count,
            "total_pages": total_pages,
        }
    })
```

**Features:**
- Validates pagination parameters
- Returns 400 Bad Request for invalid params
- Handles errors gracefully with 500 Internal Server Error
- Orders runs by creation date (newest first)

### Frontend Changes

#### API Layer (`frontend/src/utils/api.ts`)

Updated the `runs.list()` method:

```typescript
runs: {
  list: (page?: number, perPage?: number) => {
    const params = new URLSearchParams();
    if (page) params.append("page", page.toString());
    if (perPage) params.append("per_page", perPage.toString());
    const queryString = params.toString();
    return request(`/runs/${queryString ? "?" + queryString : ""}`);
  },
  // ... other methods
}
```

#### Hook Layer (`frontend/src/hooks/useRuns.ts`)

Updated the `useRuns` hook to support pagination:

```typescript
interface RunsResponse {
  results: Run[];
  pagination: {
    page: number;
    per_page: number;
    total_count: number;
    total_pages: number;
  };
}

export function useRuns(page?: number, perPage?: number) {
  return useQuery<RunsResponse>({
    queryKey: [...QUERY_KEY, page, perPage],
    queryFn: () => api.runs.list(page, perPage) as Promise<RunsResponse>,
  });
}
```

**Key Changes:**
- Returns `RunsResponse` type instead of `Run[]`
- Includes pagination params in query key for proper caching
- React Query will refetch when page/perPage changes

#### Page Component (`frontend/src/pages/RunsPage.tsx`)

Added pagination state and UI:

```typescript
export function RunsPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage] = useState(10);
  const { data, isLoading } = useRuns(currentPage, perPage);

  const runs = data?.results || [];
  const pagination = data?.pagination;

  return (
    <Stack>
      {/* ... table content ... */}
      
      {/* Pagination controls */}
      {pagination && pagination.total_pages > 1 && (
        <Group justify="center" mt="md">
          <Pagination
            total={pagination.total_pages}
            value={currentPage}
            onChange={setCurrentPage}
          />
        </Group>
      )}
    </Stack>
  );
}
```

**Key Features:**
- Pagination controls only show when total_pages > 1
- Centered below the table with margin-top
- Uses Mantine's `Pagination` component
- State managed with `useState` hook

## API Usage

### Request

**Endpoint:** `GET /api/runs/`

**Query Parameters:**
- `page` (optional): Page number (default: 1, min: 1)
- `per_page` (optional): Items per page (default: 10, min: 1, max: 100)

**Examples:**
```
GET /api/runs/                    # First page, 10 items
GET /api/runs/?page=2             # Second page, 10 items
GET /api/runs/?page=1&per_page=25 # First page, 25 items
GET /api/runs/?page=3&per_page=50 # Third page, 50 items
```

### Response

**Success (200 OK):**
```json
{
  "results": [
    {
      "id": 1,
      "name": "Load customers.csv into Hub_Customer",
      "status": "success",
      "started_at": "2024-02-15T10:30:00Z",
      "completed_at": "2024-02-15T10:35:00Z",
      "duration_seconds": 300,
      "rows_processed": 15000
    },
    // ... more runs
  ],
  "pagination": {
    "page": 1,
    "per_page": 10,
    "total_count": 45,
    "total_pages": 5
  }
}
```

**Error (400 Bad Request):**
```json
{
  "error": "page must be greater than 0"
}
```

or

```json
{
  "error": "per_page must be between 1 and 100"
}
```

## User Experience

### Before Pagination
- All runs loaded at once
- Could be slow with many runs
- Overwhelming to view large lists
- No way to navigate through historical runs

### After Pagination
- Shows 10 runs per page by default
- Fast loading even with thousands of runs
- Easy navigation with page numbers
- Clear indication of total pages
- Pagination hidden when <= 10 runs

## Design Decisions

### Why page-based pagination?
- Simple to implement and understand
- Works well with Django ORM slicing
- Predictable user experience
- Consistent with ModelDetailPage pattern

### Why default to 10 items per page?
- Balances between:
  - Reducing API calls (larger pages)
  - Keeping UI responsive (smaller pages)
  - Matching existing pattern in codebase

### Why order by -created_at?
- Most recent runs are most relevant
- Users typically want to see latest execution status
- Consistent with typical use case

### Why validate per_page max at 100?
- Prevents abuse/large requests
- Maintains reasonable API response times
- Sufficient for most use cases

## Testing

### Manual Testing Steps

1. **No runs:**
   - Navigate to Runs page
   - Should see "No runs yet" message
   - No pagination controls visible

2. **Few runs (1-10):**
   - Create/have 5 runs
   - Navigate to Runs page
   - All 5 runs visible
   - No pagination controls visible

3. **Many runs (>10):**
   - Create/have 25 runs
   - Navigate to Runs page
   - Shows first 10 runs
   - Pagination controls visible showing "1 2 3" (3 pages)
   - Click page 2: Shows runs 11-20
   - Click page 3: Shows runs 21-25
   - Page number highlights current page

4. **Parameter validation:**
   - Try `GET /api/runs/?page=0` → Should return 400 error
   - Try `GET /api/runs/?page=-1` → Should return 400 error
   - Try `GET /api/runs/?per_page=0` → Should return 400 error
   - Try `GET /api/runs/?per_page=101` → Should return 400 error
   - Try `GET /api/runs/?page=abc` → Should return 400 error

### Automated Testing (Future)

Consider adding:
```python
# backend/core/tests.py
def test_runs_pagination_default():
    """Test default pagination (page 1, 10 items)"""
    response = client.get('/api/runs/')
    assert response.status_code == 200
    assert 'pagination' in response.data
    assert response.data['pagination']['page'] == 1
    assert response.data['pagination']['per_page'] == 10

def test_runs_pagination_custom():
    """Test custom pagination parameters"""
    response = client.get('/api/runs/?page=2&per_page=5')
    assert response.status_code == 200
    assert response.data['pagination']['page'] == 2
    assert response.data['pagination']['per_page'] == 5

def test_runs_pagination_validation():
    """Test pagination parameter validation"""
    response = client.get('/api/runs/?page=0')
    assert response.status_code == 400
    
    response = client.get('/api/runs/?per_page=101')
    assert response.status_code == 400
```

## Migration Notes

### Backward Compatibility

The implementation is **partially backward compatible**:

**Breaking Change:**
- API response format changed from `Run[]` to `{ results: Run[], pagination: {...} }`
- Clients expecting array directly will need updates

**If needed for full backward compatibility:**
- Could check for a query param like `paginated=true`
- Return array format when param not present
- Return object format when param present

**Current approach chosen because:**
- RunsPage is the only consumer
- No external API clients exist yet
- Cleaner to have consistent pagination pattern
- Matches ModelDetailPage pattern

### Database Performance

**Current implementation:**
- Uses Django ORM slicing: `queryset[start:end]`
- Translates to SQL `LIMIT` and `OFFSET`
- Performance characteristics:
  - `OFFSET` can be slow for large offsets
  - Each page requires counting total records
  
**Future optimizations (if needed):**
- Add database index on `created_at` field
- Use cursor-based pagination for very large datasets
- Cache total_count for a short period
- Consider keyset pagination for better performance

### Monitoring

Consider adding metrics for:
- Average response time by page number
- Most frequently accessed pages
- Distribution of per_page values
- Error rate for pagination params

## Future Enhancements

### 1. Configurable Page Size
Allow users to choose items per page:
```typescript
const [perPage, setPerPage] = useState(10);

<Select
  value={perPage.toString()}
  onChange={(value) => setPerPage(Number(value))}
  data={[
    { value: "10", label: "10 per page" },
    { value: "25", label: "25 per page" },
    { value: "50", label: "50 per page" },
  ]}
/>
```

### 2. Filtering
Add filters to reduce results:
```typescript
// Filter by status
<Select
  value={statusFilter}
  onChange={setStatusFilter}
  data={["all", "success", "failed", "running"]}
/>
```

### 3. Sorting
Allow sorting by different columns:
```typescript
// Sort by started_at, duration, etc.
const [sortBy, setSortBy] = useState("created_at");
const [sortOrder, setSortOrder] = useState("desc");
```

### 4. Search
Add search functionality:
```typescript
// Search by run name
<TextInput
  placeholder="Search runs..."
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
/>
```

### 5. URL State
Store page in URL for bookmarking:
```typescript
import { useSearchParams } from "react-router-dom";

const [searchParams, setSearchParams] = useSearchParams();
const currentPage = Number(searchParams.get("page")) || 1;

const handlePageChange = (page: number) => {
  setSearchParams({ page: page.toString() });
};
```

## Summary

This implementation adds essential pagination functionality to the Runs page following existing patterns in the codebase. It improves performance and usability while maintaining clean code structure and proper error handling.

**Key Benefits:**
- ✅ Better performance with large datasets
- ✅ Improved user experience
- ✅ Consistent with existing patterns
- ✅ Proper validation and error handling
- ✅ Clean separation of concerns (API → Hook → Component)
- ✅ Type-safe TypeScript implementation

**Files Changed:**
- `backend/core/views.py` - Added pagination to RunViewSet
- `frontend/src/utils/api.ts` - Updated API method signature
- `frontend/src/hooks/useRuns.ts` - Updated hook to handle pagination
- `frontend/src/pages/RunsPage.tsx` - Added pagination UI

**Total Impact:**
- ~60 lines added (backend)
- ~20 lines added (frontend API/hook)
- ~30 lines modified (frontend page)
- ~110 total lines changed
