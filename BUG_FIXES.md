# Bug Fixes for Table Creation Issues

## Issues Fixed

### 1. Table Stats Error: `'Model' object has no attribute 'definition'`

**Problem:** The `table_stats` endpoint was trying to access `model_instance.definition` which doesn't exist on the Model class.

**Root Cause:** The Model class has attributes like `type`, `hubs`, `links`, etc. but no `definition` attribute.

**Fix:** 
- Changed the code to directly access model attributes (`model_instance.type`, `model_instance.hubs`, etc.)
- Now uses the stored `table_name` when available instead of regenerating it
- Falls back to generation logic only if table not yet created

**Files Changed:**
- `backend/core/views.py` (lines 922-942)

**Code:**
```python
# Use the stored table_name if available, otherwise generate it
database = clickhouse_backend.database or "default"

if model_instance.table_created and model_instance.table_name:
    # Use the stored table name from when it was created
    table_name = model_instance.table_name
else:
    # Generate table name based on model structure
    entity_type = "entity"
    if model_instance.type == "data_vault":
        if model_instance.hubs:
            entity_type = "hub"
        elif model_instance.links:
            entity_type = "link"
        elif model_instance.satellites:
            entity_type = "satellite"
    # ... rest of generation logic
```

---

### 2. Hash Key Duplication in Hub Tables

**Problem:** 
- UI creates a field called `hash_key` with hash transformation
- Backend was hardcoding `hub_hash_key` as a standard column
- This caused duplication - the same hash key appeared twice with different names

**Root Cause:**
- Frontend sends field mappings with `transformation: "hash_SHA-256"` 
- Backend was looking for `transform: "hash"` (wrong key name)
- Backend was always adding `hub_hash_key` regardless of what was in mappings

**Fix:**

**Table Creation (`clickhouse_utils.py`):**
- Dynamically detects the hash key field name from field mappings
- Looks for any field with a transformation starting with "hash"
- Uses that field name instead of hardcoding `hub_hash_key`
- Only adds standard columns (`load_datetime`, `record_source`) if not already in mappings

```python
# Determine the hash key column name from mappings
hash_key_field = None
for mapping in field_mappings:
    transform = mapping.get("transformation", mapping.get("transform", ""))
    if transform and transform.startswith("hash"):
        hash_key_field = mapping.get("model_field")
        break

# If no hash key field found in mappings, use standard name
if not hash_key_field:
    hash_key_field = "hub_hash_key"
```

**Data Loading (`tasks.py`):**
- Now checks for both `transformation` and `transform` keys
- Detects which field should receive the hash key value
- Avoids duplicate generation of hash key
- Tracks processed fields to prevent duplication

```python
# Determine the hash key field name from mappings
hash_key_field = None
business_key_source = None
for mapping in field_mappings:
    transform = mapping.get("transformation", mapping.get("transform", ""))
    if transform and transform.startswith("hash"):
        hash_key_field = mapping.get("model_field")
        business_key_source = mapping.get("topic_field")
        break

# For Data Vault hubs, calculate the hash key if found in mappings
if model.type == "data_vault" and model.hubs and hash_key_field and business_key_source:
    select_columns.append(f"MD5(toString({business_key_source})) as {hash_key_field}")
    processed_fields.add(hash_key_field)
```

**Files Changed:**
- `backend/core/clickhouse_utils.py` (create_data_vault_hub_table function)
- `backend/core/tasks.py` (load_data_package_task function)

---

### 3. Standard Data Vault Columns Not Shown as Readonly in UI

**Problem:** The standard Data Vault columns (`load_datetime`, `record_source`) were not displayed in the UI, making it unclear that they would be automatically added.

**Solution:** Added these fields to the UI as readonly/system fields

**Frontend Changes (`ModelCanvasPage.tsx`):**

1. **Auto-create standard columns:**
```typescript
if (entityType === "hub") {
  requiredFields.push("hash_key", "business_key");
  fieldTypes["hash_key"] = "string";
  fieldTypes["business_key"] = "string";
  
  // Add standard Data Vault columns as readonly
  requiredFields.push("load_datetime", "record_source");
  fieldTypes["load_datetime"] = "timestamp";
  fieldTypes["record_source"] = "string";
  readonlyFields.push("load_datetime", "record_source");
}
```

2. **Visual distinction for system fields:**
```typescript
const isSystemField = fieldName === "load_datetime" || fieldName === "record_source";

<Paper
  bg={
    isSystemField
      ? colorScheme === "dark" ? "gray.9" : "gray.1"  // Gray background
      : // normal background logic
  }
  style={{
    opacity: isSystemField ? 0.7 : 1,  // Reduced opacity
  }}
>
```

3. **System badge:**
```typescript
{isSystemField && (
  <Badge size="xs" color="gray" variant="light">
    system
  </Badge>
)}
```

4. **Prevent editing/deletion:**
```typescript
const handleRemoveModelField = (fieldName: string) => {
  // Prevent deletion of system fields
  if (fieldName === "load_datetime" || fieldName === "record_source") {
    notifications.show({
      message: "Cannot delete system fields",
      color: "red",
    });
    return;
  }
  // ... rest of delete logic
};

// Hide edit button for system fields
{!isSystemField && (
  <ActionIcon onClick={() => handleStartEditField(fieldName)}>
    <IconEdit size={12} />
  </ActionIcon>
)}

// Hide delete button for system fields
{!isSystemField && (
  <ActionIcon onClick={() => handleRemoveModelField(fieldName)}>
    <IconX size={16} />
  </ActionIcon>
)}
```

**Files Changed:**
- `frontend/src/pages/ModelCanvasPage.tsx`

---

## Testing Recommendations

1. **Create a new Hub model:**
   - Use the Model Canvas
   - Map a topic field to `hash_key` with hash transformation
   - Map another field to `business_key`
   - Verify `load_datetime` and `record_source` appear as system fields
   - Try to delete them (should fail)

2. **Create the table:**
   - Click "Create Table" on model detail page
   - Verify table has:
     - `hash_key` (or your chosen name) - String
     - `business_key` - mapped type
     - `load_datetime` - DateTime64(3)
     - `record_source` - String
   - No duplicate columns

3. **Load data:**
   - Click "Load Data"
   - Verify data loads correctly
   - Check that hash_key column has MD5 values
   - Check that load_datetime and record_source have values

4. **Verify table stats:**
   - Should show table exists
   - Should show row count, columns, size
   - No error about `model.definition`

---

## Database Schema Example

After creating a Hub model with these fixes, the ClickHouse table should look like:

```sql
CREATE TABLE default.hub_customer (
    hash_key String,           -- From field mapping with hash transformation
    load_datetime DateTime64(3) DEFAULT now64(3),  -- System field
    record_source String,      -- System field
    business_key String,       -- From field mapping
    customer_name String,      -- From field mapping
    customer_email String      -- From field mapping
)
ENGINE = MergeTree()
ORDER BY (hash_key)
```

**Data Loading:**
```sql
INSERT INTO default.hub_customer
SELECT
    MD5(toString(id)) as hash_key,           -- Computed from business key
    now64(3) as load_datetime,               -- Auto-generated
    'customers_2024.parquet' as record_source,  -- Auto-generated
    id as business_key,                      -- Direct mapping
    name as customer_name,                   -- Direct mapping
    email as customer_email                  -- Direct mapping
FROM s3('https://...', 'key', 'secret', 'Parquet')
```

---

## Summary

All three issues have been resolved:
1. ✅ Table stats endpoint no longer throws `'Model' object has no attribute 'definition'` error
2. ✅ Hash key is no longer duplicated - uses the field name from mappings
3. ✅ Standard Data Vault columns are shown in the UI as readonly/system fields

The fixes ensure that:
- Users can see exactly what columns will be created
- Users can specify their own hash key field name
- System fields are clearly marked and protected from accidental deletion
- Table creation and data loading work correctly together
