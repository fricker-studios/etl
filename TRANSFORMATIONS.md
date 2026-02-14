# Data Transformation Components

This document describes the comprehensive set of data transformation components available in the ETL Pipeline Studio for use in the Data Model Canvas and backend data loading processes.

## Overview

Data transformations allow you to modify, clean, and prepare data as it flows from data sources through topics into your data models in ClickHouse. Transformations are applied during the data loading process using native ClickHouse SQL functions for optimal performance.

## How Transformations Work

1. **Define Field Mappings**: In the Data Model Canvas, you create field mappings from topic columns to model fields
2. **Add Transformations**: Each field mapping can include a transformation specification
3. **Transformation Applied**: During data loading, the transformation is converted to ClickHouse SQL and applied in the `INSERT INTO ... SELECT` statement
4. **Efficient Execution**: All transformations run in ClickHouse using native SQL functions (no intermediate processing)

## Transformation Categories

### String Transformations

String manipulation and formatting functions.

| Function | Parameters | Example | Description |
|----------|-----------|---------|-------------|
| `UPPER` | None | `UPPER` | Convert string to uppercase |
| `LOWER` | None | `LOWER` | Convert string to lowercase |
| `TRIM` | None | `TRIM` | Remove leading and trailing whitespace |
| `LTRIM` | None | `LTRIM` | Remove leading whitespace |
| `RTRIM` | None | `RTRIM` | Remove trailing whitespace |
| `SUBSTRING` | start, length | `SUBSTRING(0, 10)` | Extract substring from position with length |
| `CONCAT` | str1, str2, ... | `CONCAT(' ', last_name)` | Concatenate column with additional strings |
| `REPLACE` | old, new | `REPLACE('@', '[at]')` | Replace substring with another |
| `LENGTH` | None | `LENGTH` | Get string length |

**Example Usage:**
```json
{
  "model_field": "email_normalized",
  "topic_field": "email",
  "transformation": "LOWER"
}
```

### Numeric Transformations

Numeric calculations and arithmetic operations.

| Function | Parameters | Example | Description |
|----------|-----------|---------|-------------|
| `ROUND` | decimals | `ROUND(2)` | Round to specified decimal places |
| `FLOOR` | None | `FLOOR` | Round down to nearest integer |
| `CEIL` | None | `CEIL` | Round up to nearest integer |
| `ABS` | None | `ABS` | Get absolute value |
| `ADD` | value | `ADD(10)` | Add constant to column value |
| `SUBTRACT` | value | `SUBTRACT(5)` | Subtract constant from column value |
| `MULTIPLY` | value | `MULTIPLY(1.1)` | Multiply column by constant |
| `DIVIDE` | value | `DIVIDE(2)` | Divide column by constant |
| `MOD` | divisor | `MOD(10)` | Modulo operation |

**Example Usage:**
```json
{
  "model_field": "price_rounded",
  "topic_field": "price",
  "transformation": "ROUND(2)"
}
```

### DateTime Transformations

Date and time manipulation functions.

| Function | Parameters | Example | Description |
|----------|-----------|---------|-------------|
| `TO_DATE` | None | `TO_DATE` | Convert to date |
| `TO_DATETIME` | None | `TO_DATETIME` | Convert to datetime |
| `DATE_ADD` | value, unit | `DATE_ADD(7, DAY)` | Add time interval (YEAR/MONTH/DAY/HOUR/MINUTE/SECOND) |
| `DATE_SUB` | value, unit | `DATE_SUB(1, MONTH)` | Subtract time interval |
| `DATE_DIFF` | unit, date2 | `DATE_DIFF(DAY, end_date)` | Calculate difference between dates |
| `FORMAT_DATE` | format | `FORMAT_DATE('%Y-%m-%d')` | Format date as string |
| `YEAR` | None | `YEAR` | Extract year component |
| `MONTH` | None | `MONTH` | Extract month component |
| `DAY` | None | `DAY` | Extract day component |
| `HOUR` | None | `HOUR` | Extract hour component |
| `MINUTE` | None | `MINUTE` | Extract minute component |
| `SECOND` | None | `SECOND` | Extract second component |

**Example Usage:**
```json
{
  "model_field": "order_year",
  "topic_field": "order_date",
  "transformation": "YEAR"
}
```

### Type Casting Transformations

Data type conversion functions.

| Function | Parameters | Example | Description |
|----------|-----------|---------|-------------|
| `CAST` | type | `CAST(INTEGER)` | Cast to specified type (INTEGER/FLOAT/STRING/BOOLEAN/DATE/DATETIME) |
| `TO_INT` | None | `TO_INT` | Cast to integer (Int64) |
| `TO_FLOAT` | None | `TO_FLOAT` | Cast to float (Float64) |
| `TO_STRING` | None | `TO_STRING` | Cast to string |
| `TO_BOOL` | None | `TO_BOOL` | Cast to boolean |

**Example Usage:**
```json
{
  "model_field": "quantity_int",
  "topic_field": "quantity_str",
  "transformation": "TO_INT"
}
```

### Conditional Transformations

Conditional logic and null handling.

| Function | Parameters | Example | Description |
|----------|-----------|---------|-------------|
| `IF` | condition, true_value, false_value | `IF(column > 0, 'positive', 'negative')` | Simple if-then-else logic |
| `COALESCE` | value1, value2, ... | `COALESCE(0, default_value)` | Return first non-null value |
| `NULLIF` | value | `NULLIF(0)` | Return null if values are equal |
| `IS_NULL` | None | `IS_NULL` | Check if value is null (returns boolean) |
| `IS_NOT_NULL` | None | `IS_NOT_NULL` | Check if value is not null (returns boolean) |

**Example Usage:**
```json
{
  "model_field": "quantity_cleaned",
  "topic_field": "quantity",
  "transformation": "COALESCE(0)"
}
```

### Hash Transformations

Hash functions for Data Vault hash keys and unique identifiers.

| Function | Parameters | Example | Description |
|----------|-----------|---------|-------------|
| `HASH` | algorithm | `HASH(MD5)` | Hash with specified algorithm (MD5/SHA256/SHA512) |
| `hash_MD5` | None | `hash_MD5` | MD5 hash (legacy format, backward compatible) |
| `hash_SHA256` | None | `hash_SHA256` | SHA-256 hash (legacy format) |

**Example Usage:**
```json
{
  "model_field": "customer_hash_key",
  "topic_field": "customer_id",
  "transformation": "HASH(MD5)"
}
```

## Using Transformations in Field Mappings

### In Data Models (Backend)

Field mappings are stored in the Model's entity definitions (hubs, links, satellites, facts, dimensions) as JSON:

```json
{
  "name": "Hub_Customer",
  "topic": 1,
  "business_key": "customer_id",
  "field_mappings": [
    {
      "model_field": "customer_hash_key",
      "topic_field": "customer_id",
      "transformation": "HASH(MD5)"
    },
    {
      "model_field": "customer_name_upper",
      "topic_field": "customer_name",
      "transformation": "UPPER"
    },
    {
      "model_field": "signup_year",
      "topic_field": "signup_date",
      "transformation": "YEAR"
    }
  ]
}
```

### In Data Model Canvas (Frontend)

The Data Model Canvas UI allows users to:
1. Drag columns from topics to model fields
2. Click on the field mapping connection
3. Select a transformation from a dropdown
4. Configure transformation parameters if needed

## API Endpoint

Get all supported transformations via the API:

```bash
GET /api/transformations/
```

Response format:
```json
{
  "String": {
    "description": "String manipulation and formatting functions",
    "functions": [
      {
        "name": "UPPER",
        "params": [],
        "example": "UPPER",
        "description": "Convert to uppercase"
      },
      ...
    ]
  },
  ...
}
```

## Implementation Details

### Architecture

1. **Transformation Utilities Module** (`transformation_utils.py`): Core transformation logic
2. **Parser**: Parses transformation strings into function names and parameters
3. **Appliers**: Category-specific functions that generate ClickHouse SQL
4. **Integration**: Used in `tasks.py` during data loading to apply transformations

### ClickHouse SQL Generation

Transformations are converted to ClickHouse SQL expressions. For example:

- `UPPER` → `upper(column_name)`
- `ROUND(2)` → `round(column_name, 2)`
- `HASH(MD5)` → `MD5(toString(column_name))`
- `DATE_ADD(7, DAY)` → `addDays(column_name, 7)`

### Performance Considerations

- **Native SQL**: All transformations use ClickHouse native functions for maximum performance
- **No Intermediate Processing**: Transformations occur directly in the `INSERT INTO ... SELECT` statement
- **Vectorized Execution**: ClickHouse processes transformations in vectorized batches
- **Efficient for Large Datasets**: Suitable for transforming millions of rows

## Error Handling

If a transformation fails:
1. An error is logged with details
2. The system falls back to direct column mapping (no transformation)
3. Data loading continues without interruption
4. Users can review logs to identify and fix transformation issues

## Best Practices

1. **Test Transformations**: Always test transformations with sample data before production use
2. **Use Appropriate Types**: Ensure source data types are compatible with transformations
3. **Chain Thoughtfully**: While transformations can be powerful, overly complex logic may be better in dbt or separate processing
4. **Document Custom Logic**: Add comments explaining business logic behind transformations
5. **Monitor Performance**: Track execution times for transformations on large datasets

## Future Enhancements

Planned features for future releases:

- **Aggregate Transformations**: SUM, COUNT, AVG, MIN, MAX with GROUP BY support
- **Window Functions**: ROW_NUMBER, RANK, LAG, LEAD for analytical transformations
- **Custom SQL**: Allow advanced users to write custom ClickHouse SQL expressions
- **Transformation Chains**: Apply multiple transformations in sequence
- **Validation**: Pre-validate transformations before data loading

## Examples

### Example 1: Customer Data Vault Hub

```json
{
  "name": "Hub_Customer",
  "topic": 1,
  "field_mappings": [
    {
      "model_field": "customer_hash_key",
      "topic_field": "customer_id",
      "transformation": "HASH(MD5)"
    },
    {
      "model_field": "customer_id",
      "topic_field": "customer_id",
      "transformation": ""
    }
  ]
}
```

### Example 2: Sales Fact with Derived Fields

```json
{
  "name": "Fact_Sales",
  "topic": 2,
  "field_mappings": [
    {
      "model_field": "amount_rounded",
      "topic_field": "amount",
      "transformation": "ROUND(2)"
    },
    {
      "model_field": "order_year",
      "topic_field": "order_date",
      "transformation": "YEAR"
    },
    {
      "model_field": "order_month",
      "topic_field": "order_date",
      "transformation": "MONTH"
    }
  ]
}
```

### Example 3: String Cleaning

```json
{
  "field_mappings": [
    {
      "model_field": "email_normalized",
      "topic_field": "email",
      "transformation": "LOWER"
    },
    {
      "model_field": "name_trimmed",
      "topic_field": "name",
      "transformation": "TRIM"
    }
  ]
}
```

## Support

For questions or issues with transformations:
- Check the API documentation at `/api/docs`
- Review server logs for transformation errors
- Consult the transformation utilities source code: `backend/core/transformation_utils.py`
