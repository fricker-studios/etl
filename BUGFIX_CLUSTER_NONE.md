# Bug Fix: Cluster Name 'None' String Error

## Problem

Users were encountering the following error when creating ClickHouse tables:

```
HTTPDriver for http://ch01.alexfricker.com:8123 returned response code 500
Code: 701. DB::Exception: Requested cluster 'None' not found. (CLUSTER_DOESNT_EXIST)
```

The error indicated that the literal string `'None'` was being passed as a cluster name to ClickHouse, instead of either:
1. A valid cluster name, or
2. Skipping cluster mode entirely

## Root Cause

In the `create_data_vault_hub_table()` function in `backend/core/clickhouse_utils.py`, there was a logic error at line 384:

```python
# Line 379: Correctly determine cluster_name
cluster_name = backend.detected_cluster_name if backend and backend.detected_cluster_name else (backend.cluster_name if backend else None)

# Line 381: Check that we have a valid cluster_name
if use_cluster and cluster_name:
    local_table_name = f"{table_name}_local"
    
    # Line 384: ❌ BUG - Overwrites cluster_name with backend.cluster_name
    cluster_name = backend.cluster_name  # This could be None!
    
    # Lines 388, 401, 402: Use cluster_name in SQL
    f"ON CLUSTER '{cluster_name}'"  # If None, becomes "ON CLUSTER 'None'"
```

### The Bug Flow

1. **Initial Assignment (Line 379)**: `cluster_name` is correctly set to either:
   - `backend.detected_cluster_name` (from auto-detection), or
   - `backend.cluster_name` (from manual configuration)

2. **Validation Check (Line 381)**: Code enters the cluster mode block only if `cluster_name` is truthy (not None, not empty string)

3. **Erroneous Reassignment (Line 384)**: `cluster_name` is overwritten with `backend.cluster_name`, which could be `None` even when `detected_cluster_name` has a valid value

4. **String Conversion**: When Python evaluates `f"ON CLUSTER '{cluster_name}'"` with `cluster_name = None`, it converts `None` to the string `'None'`

5. **ClickHouse Error**: ClickHouse receives SQL like `CREATE TABLE ... ON CLUSTER 'None'` and throws `CLUSTER_DOESNT_EXIST` error

### When This Occurred

This bug manifested specifically when:
- ClickHouse cluster was accessed through a load balancer
- Auto-detection successfully detected the cluster (set `detected_cluster_name`)
- User had not manually configured `cluster_name` (it remained `None`)
- System correctly entered cluster mode based on `detected_cluster_name`
- But then line 384 overwrote the good value with `None`

## Solution

**The Fix**: Remove line 384 entirely.

```python
# Line 379: Correctly determine cluster_name (with fallback logic)
cluster_name = backend.detected_cluster_name if backend and backend.detected_cluster_name else (backend.cluster_name if backend else None)

# Line 381: Check that we have a valid cluster_name
if use_cluster and cluster_name:
    local_table_name = f"{table_name}_local"
    # Line 384 removed - no longer overwrites cluster_name
    
    # Lines 387+: Use the correctly-determined cluster_name
    f"ON CLUSTER '{cluster_name}'"  # Now uses the valid cluster name
```

The `cluster_name` variable is already correctly set on line 379 with proper fallback logic:
1. First tries `backend.detected_cluster_name` (from auto-detection)
2. Falls back to `backend.cluster_name` (from manual configuration)  
3. Falls back to `None` (which causes the code to skip cluster mode)

## Testing

### Before Fix
```python
backend.detected_cluster_name = "my_cluster"
backend.cluster_name = None

# Line 379: cluster_name = "my_cluster" ✓
# Line 381: Enters cluster mode ✓
# Line 384: cluster_name = None ✗
# Line 388: f"ON CLUSTER '{None}'" → "ON CLUSTER 'None'" ✗
# Result: CLUSTER_DOESNT_EXIST error
```

### After Fix
```python
backend.detected_cluster_name = "my_cluster"
backend.cluster_name = None

# Line 379: cluster_name = "my_cluster" ✓
# Line 381: Enters cluster mode ✓
# (Line 384 removed)
# Line 387: f"ON CLUSTER 'my_cluster'" ✓
# Result: Table created successfully on cluster
```

## Impact

### Affected Scenarios
- ✅ **Fixed**: Auto-detected cluster with no manual configuration
- ✅ **Still Works**: Manual cluster configuration
- ✅ **Still Works**: Single node mode (no cluster)
- ✅ **Still Works**: Both auto-detected and manual configured

### No Breaking Changes
- The fix only removes a buggy line
- All valid scenarios continue to work
- Logic is now more straightforward and correct

## Prevention

This type of bug (variable reassignment after validation) can be prevented by:

1. **Code Review**: Look for variable reassignments inside conditional blocks
2. **Static Analysis**: Tools that detect "dead stores" or unnecessary assignments
3. **Testing**: Test with different combinations of configuration values
4. **Immutability**: Use constants or immutable patterns where possible

## Related Code

The same pattern exists in `drop_table_from_model()` but is implemented correctly there:

```python
# Correct implementation in drop_table_from_model()
use_cluster = backend.is_cluster or (backend.mode == "cluster" and backend.cluster_name)
cluster_name = backend.detected_cluster_name or backend.cluster_name

if use_cluster and cluster_name:
    # No reassignment here - cluster_name is used as-is ✓
    drop_sql = f"DROP TABLE ... ON CLUSTER '{cluster_name}'"
```

## Commit Details

- **File Changed**: `backend/core/clickhouse_utils.py`
- **Lines Changed**: 1 line removed (line 384)
- **Commit**: Fix cluster name 'None' string bug in table creation
- **Impact**: Non-breaking fix, resolves CLUSTER_DOESNT_EXIST error

## Verification

To verify the fix is working:

1. **Check Backend Logs**: Should see correct cluster name in CREATE TABLE statements
2. **Query ClickHouse**: Tables should be created successfully on cluster
3. **No Error**: Should not see "Requested cluster 'None' not found" error

Example log output after fix:
```
INFO: Creating local hub table with DDL: 
CREATE TABLE IF NOT EXISTS default.hub_customer_local ON CLUSTER 'my_cluster' (...)
```

Instead of:
```
ERROR: CREATE TABLE ... ON CLUSTER 'None' (...)
```
