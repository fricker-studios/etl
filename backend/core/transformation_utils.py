"""
Data transformation utilities for ETL pipeline.

This module provides a comprehensive set of transformation functions
that can be applied to data during the loading process from data packages
into ClickHouse tables.

Transformations are defined in field mappings and converted to ClickHouse SQL.
"""

import logging
import re
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


class TransformationError(Exception):
    """Exception raised for errors in transformation definitions."""

    pass


def get_transformation(mapping: Dict[str, Any]) -> str:
    """
    Get the transformation value from a field mapping.
    Supports both 'transformation' and 'transform' keys for backward compatibility.

    Args:
        mapping: Field mapping dictionary

    Returns:
        Transformation string or empty string if not found
    """
    return mapping.get("transformation", mapping.get("transform", ""))


def parse_transformation_params(transform_str: str) -> tuple[str, List[str]]:
    """
    Parse a transformation string into function name and parameters.

    Examples:
        "hash_MD5" -> ("hash", ["MD5"])
        "UPPER" -> ("UPPER", [])
        "SUBSTRING(0, 10)" -> ("SUBSTRING", ["0", "10"])
        "CAST(integer)" -> ("CAST", ["integer"])

    Args:
        transform_str: Transformation string

    Returns:
        Tuple of (function_name, parameters)
    """
    if not transform_str:
        return "", []

    # Handle hash transformations (legacy format)
    if transform_str.startswith("hash_"):
        parts = transform_str.split("_", 1)
        return "hash", [parts[1]] if len(parts) > 1 else []

    # Parse function with parameters: FUNC(param1, param2, ...)
    match = re.match(r"(\w+)\((.*)\)", transform_str)
    if match:
        func_name = match.group(1)
        params_str = match.group(2).strip()
        if params_str:
            # Split by comma but respect nested parentheses
            params = [p.strip() for p in params_str.split(",")]
        else:
            params = []
        return func_name, params

    # Simple function without parameters
    return transform_str, []


def apply_string_transformation(
    column_expr: str, func_name: str, params: List[str]
) -> str:
    """
    Apply string transformation functions.

    Supported transformations:
    - UPPER: Convert to uppercase
    - LOWER: Convert to lowercase
    - TRIM: Remove leading/trailing whitespace
    - LTRIM: Remove leading whitespace
    - RTRIM: Remove trailing whitespace
    - SUBSTRING(start, length): Extract substring
    - CONCAT(str1, str2, ...): Concatenate strings
    - REPLACE(old, new): Replace substring
    - LENGTH: Get string length

    Args:
        column_expr: Column expression or name
        func_name: Transformation function name
        params: Function parameters

    Returns:
        ClickHouse SQL expression

    Raises:
        TransformationError: If transformation is invalid
    """
    func_upper = func_name.upper()

    if func_upper == "UPPER":
        return f"upper({column_expr})"

    elif func_upper == "LOWER":
        return f"lower({column_expr})"

    elif func_upper == "TRIM":
        return f"trim(BOTH ' ' FROM {column_expr})"

    elif func_upper == "LTRIM":
        return f"trim(LEADING ' ' FROM {column_expr})"

    elif func_upper == "RTRIM":
        return f"trim(TRAILING ' ' FROM {column_expr})"

    elif func_upper == "SUBSTRING":
        if len(params) < 2:
            raise TransformationError(
                f"SUBSTRING requires 2 parameters (start, length), got {len(params)}"
            )
        start, length = params[0], params[1]
        return f"substring({column_expr}, {start}, {length})"

    elif func_upper == "CONCAT":
        if len(params) < 1:
            raise TransformationError("CONCAT requires at least 1 parameter")
        # Concat the column with additional strings
        all_parts = [column_expr] + params
        return f"concat({', '.join(all_parts)})"

    elif func_upper == "REPLACE":
        if len(params) < 2:
            raise TransformationError(
                f"REPLACE requires 2 parameters (old, new), got {len(params)}"
            )
        old_str, new_str = params[0], params[1]
        return f"replace({column_expr}, {old_str}, {new_str})"

    elif func_upper == "LENGTH":
        return f"length({column_expr})"

    else:
        raise TransformationError(f"Unknown string transformation: {func_name}")


def apply_numeric_transformation(
    column_expr: str, func_name: str, params: List[str]
) -> str:
    """
    Apply numeric transformation functions.

    Supported transformations:
    - ROUND(decimals): Round to specified decimal places
    - FLOOR: Round down to nearest integer
    - CEIL/CEILING: Round up to nearest integer
    - ABS: Absolute value
    - ADD(value): Add constant value
    - SUBTRACT(value): Subtract constant value
    - MULTIPLY(value): Multiply by constant value
    - DIVIDE(value): Divide by constant value
    - MOD(divisor): Modulo operation

    Args:
        column_expr: Column expression or name
        func_name: Transformation function name
        params: Function parameters

    Returns:
        ClickHouse SQL expression

    Raises:
        TransformationError: If transformation is invalid
    """
    func_upper = func_name.upper()

    if func_upper == "ROUND":
        decimals = params[0] if params else "0"
        return f"round({column_expr}, {decimals})"

    elif func_upper == "FLOOR":
        return f"floor({column_expr})"

    elif func_upper in ("CEIL", "CEILING"):
        return f"ceil({column_expr})"

    elif func_upper == "ABS":
        return f"abs({column_expr})"

    elif func_upper == "ADD":
        if len(params) < 1:
            raise TransformationError("ADD requires 1 parameter (value)")
        return f"({column_expr} + {params[0]})"

    elif func_upper == "SUBTRACT":
        if len(params) < 1:
            raise TransformationError("SUBTRACT requires 1 parameter (value)")
        return f"({column_expr} - {params[0]})"

    elif func_upper == "MULTIPLY":
        if len(params) < 1:
            raise TransformationError("MULTIPLY requires 1 parameter (value)")
        return f"({column_expr} * {params[0]})"

    elif func_upper == "DIVIDE":
        if len(params) < 1:
            raise TransformationError("DIVIDE requires 1 parameter (value)")
        return f"({column_expr} / {params[0]})"

    elif func_upper == "MOD":
        if len(params) < 1:
            raise TransformationError("MOD requires 1 parameter (divisor)")
        return f"({column_expr} % {params[0]})"

    else:
        raise TransformationError(f"Unknown numeric transformation: {func_name}")


def apply_datetime_transformation(
    column_expr: str, func_name: str, params: List[str]
) -> str:
    """
    Apply date/time transformation functions.

    Supported transformations:
    - TO_DATE: Convert to date
    - TO_DATETIME: Convert to datetime
    - DATE_ADD(value, unit): Add time interval (units: YEAR, MONTH, DAY, HOUR, MINUTE, SECOND)
    - DATE_SUB(value, unit): Subtract time interval
    - DATE_DIFF(unit, date2): Get difference between dates
    - FORMAT_DATE(format): Format date as string
    - YEAR: Extract year
    - MONTH: Extract month
    - DAY: Extract day
    - HOUR: Extract hour
    - MINUTE: Extract minute
    - SECOND: Extract second

    Args:
        column_expr: Column expression or name
        func_name: Transformation function name
        params: Function parameters

    Returns:
        ClickHouse SQL expression

    Raises:
        TransformationError: If transformation is invalid
    """
    func_upper = func_name.upper()

    if func_upper == "TO_DATE":
        return f"toDate({column_expr})"

    elif func_upper == "TO_DATETIME":
        return f"toDateTime({column_expr})"

    elif func_upper == "DATE_ADD":
        if len(params) < 2:
            raise TransformationError(
                "DATE_ADD requires 2 parameters (value, unit: YEAR/MONTH/DAY/HOUR/MINUTE/SECOND)"
            )
        value, unit = params[0], params[1].upper()
        if unit == "YEAR":
            return f"addYears({column_expr}, {value})"
        elif unit == "MONTH":
            return f"addMonths({column_expr}, {value})"
        elif unit == "DAY":
            return f"addDays({column_expr}, {value})"
        elif unit == "HOUR":
            return f"addHours({column_expr}, {value})"
        elif unit == "MINUTE":
            return f"addMinutes({column_expr}, {value})"
        elif unit == "SECOND":
            return f"addSeconds({column_expr}, {value})"
        else:
            raise TransformationError(
                f"Invalid unit for DATE_ADD: {unit}. Must be YEAR/MONTH/DAY/HOUR/MINUTE/SECOND"
            )

    elif func_upper == "DATE_SUB":
        if len(params) < 2:
            raise TransformationError(
                "DATE_SUB requires 2 parameters (value, unit: YEAR/MONTH/DAY/HOUR/MINUTE/SECOND)"
            )
        value, unit = params[0], params[1].upper()
        if unit == "YEAR":
            return f"subtractYears({column_expr}, {value})"
        elif unit == "MONTH":
            return f"subtractMonths({column_expr}, {value})"
        elif unit == "DAY":
            return f"subtractDays({column_expr}, {value})"
        elif unit == "HOUR":
            return f"subtractHours({column_expr}, {value})"
        elif unit == "MINUTE":
            return f"subtractMinutes({column_expr}, {value})"
        elif unit == "SECOND":
            return f"subtractSeconds({column_expr}, {value})"
        else:
            raise TransformationError(
                f"Invalid unit for DATE_SUB: {unit}. Must be YEAR/MONTH/DAY/HOUR/MINUTE/SECOND"
            )

    elif func_upper == "DATE_DIFF":
        if len(params) < 2:
            raise TransformationError(
                "DATE_DIFF requires 2 parameters (unit, date2)"
            )
        unit, date2 = params[0].upper(), params[1]
        if unit == "YEAR":
            return f"dateDiff('year', {column_expr}, {date2})"
        elif unit == "MONTH":
            return f"dateDiff('month', {column_expr}, {date2})"
        elif unit == "DAY":
            return f"dateDiff('day', {column_expr}, {date2})"
        elif unit == "HOUR":
            return f"dateDiff('hour', {column_expr}, {date2})"
        elif unit == "MINUTE":
            return f"dateDiff('minute', {column_expr}, {date2})"
        elif unit == "SECOND":
            return f"dateDiff('second', {column_expr}, {date2})"
        else:
            raise TransformationError(
                f"Invalid unit for DATE_DIFF: {unit}. Must be YEAR/MONTH/DAY/HOUR/MINUTE/SECOND"
            )

    elif func_upper == "FORMAT_DATE":
        if len(params) < 1:
            raise TransformationError("FORMAT_DATE requires 1 parameter (format)")
        format_str = params[0]
        return f"formatDateTime({column_expr}, {format_str})"

    elif func_upper == "YEAR":
        return f"toYear({column_expr})"

    elif func_upper == "MONTH":
        return f"toMonth({column_expr})"

    elif func_upper == "DAY":
        return f"toDayOfMonth({column_expr})"

    elif func_upper == "HOUR":
        return f"toHour({column_expr})"

    elif func_upper == "MINUTE":
        return f"toMinute({column_expr})"

    elif func_upper == "SECOND":
        return f"toSecond({column_expr})"

    else:
        raise TransformationError(f"Unknown datetime transformation: {func_name}")


def apply_type_casting_transformation(
    column_expr: str, func_name: str, params: List[str]
) -> str:
    """
    Apply type casting transformation functions.

    Supported transformations:
    - CAST(type): Generic type casting
    - TO_INT/TO_INTEGER: Cast to integer
    - TO_FLOAT: Cast to float
    - TO_STRING: Cast to string
    - TO_BOOL/TO_BOOLEAN: Cast to boolean

    Args:
        column_expr: Column expression or name
        func_name: Transformation function name
        params: Function parameters

    Returns:
        ClickHouse SQL expression

    Raises:
        TransformationError: If transformation is invalid
    """
    func_upper = func_name.upper()

    if func_upper == "CAST":
        if len(params) < 1:
            raise TransformationError("CAST requires 1 parameter (type)")
        target_type = params[0].upper()
        # Map common type names to ClickHouse types
        type_mapping = {
            "INTEGER": "Int64",
            "INT": "Int64",
            "BIGINT": "Int64",
            "FLOAT": "Float64",
            "DOUBLE": "Float64",
            "STRING": "String",
            "TEXT": "String",
            "BOOLEAN": "Bool",
            "BOOL": "Bool",
            "DATE": "Date",
            "DATETIME": "DateTime",
            "TIMESTAMP": "DateTime64(3)",
        }
        ch_type = type_mapping.get(target_type, target_type)
        return f"CAST({column_expr} AS {ch_type})"

    elif func_upper in ("TO_INT", "TO_INTEGER"):
        return f"toInt64({column_expr})"

    elif func_upper == "TO_FLOAT":
        return f"toFloat64({column_expr})"

    elif func_upper == "TO_STRING":
        return f"toString({column_expr})"

    elif func_upper in ("TO_BOOL", "TO_BOOLEAN"):
        return f"toBool({column_expr})"

    else:
        raise TransformationError(f"Unknown type casting transformation: {func_name}")


def apply_conditional_transformation(
    column_expr: str, func_name: str, params: List[str]
) -> str:
    """
    Apply conditional transformation functions.

    Supported transformations:
    - IF(condition, true_value, false_value): Simple if-then-else
    - COALESCE(value1, value2, ...): Return first non-null value
    - NULLIF(value1, value2): Return null if values are equal
    - IS_NULL: Check if value is null
    - IS_NOT_NULL: Check if value is not null

    Note: For CASE WHEN statements, use the transformation string directly as SQL.

    Args:
        column_expr: Column expression or name
        func_name: Transformation function name
        params: Function parameters

    Returns:
        ClickHouse SQL expression

    Raises:
        TransformationError: If transformation is invalid
    """
    func_upper = func_name.upper()

    if func_upper == "IF":
        if len(params) < 3:
            raise TransformationError(
                "IF requires 3 parameters (condition, true_value, false_value)"
            )
        condition, true_val, false_val = params[0], params[1], params[2]
        # Replace 'column' placeholder in condition with actual column
        condition = condition.replace("column", column_expr)
        return f"if({condition}, {true_val}, {false_val})"

    elif func_upper == "COALESCE":
        if len(params) < 1:
            raise TransformationError(
                "COALESCE requires at least 1 parameter (value)"
            )
        all_values = [column_expr] + params
        return f"coalesce({', '.join(all_values)})"

    elif func_upper == "NULLIF":
        if len(params) < 1:
            raise TransformationError("NULLIF requires 1 parameter (value)")
        return f"nullIf({column_expr}, {params[0]})"

    elif func_upper == "IS_NULL":
        return f"isNull({column_expr})"

    elif func_upper == "IS_NOT_NULL":
        return f"isNotNull({column_expr})"

    else:
        raise TransformationError(f"Unknown conditional transformation: {func_name}")


def apply_hash_transformation(
    column_expr: str, func_name: str, params: List[str]
) -> str:
    """
    Apply hash transformation functions (for Data Vault hash keys).

    Supported transformations:
    - hash_MD5 or HASH(MD5): MD5 hash
    - hash_SHA256 or HASH(SHA256): SHA-256 hash
    - hash_SHA512 or HASH(SHA512): SHA-512 hash

    Args:
        column_expr: Column expression or name
        func_name: Transformation function name
        params: Function parameters

    Returns:
        ClickHouse SQL expression

    Raises:
        TransformationError: If transformation is invalid
    """
    # Handle legacy format (hash_MD5) or new format (HASH with params)
    if func_name.lower() == "hash":
        if len(params) < 1:
            raise TransformationError("HASH requires 1 parameter (algorithm)")
        algorithm = params[0].upper()
    else:
        algorithm = "MD5"  # Default for backward compatibility

    if algorithm == "MD5":
        return f"MD5({column_expr})"
    elif algorithm in ("SHA256", "SHA-256"):
        return f"SHA256({column_expr})"
    elif algorithm in ("SHA512", "SHA-512"):
        return f"SHA512({column_expr})"
    else:
        raise TransformationError(f"Unknown hash algorithm: {algorithm}")


def apply_transformation_to_column(
    column_expr: str, transformation: str
) -> str:
    """
    Apply a transformation to a column expression and return ClickHouse SQL.

    This is the main entry point for applying transformations during data loading.

    Args:
        column_expr: Column expression or name
        transformation: Transformation string (e.g., "UPPER", "SUBSTRING(0, 10)", "hash_MD5")

    Returns:
        ClickHouse SQL expression with transformation applied

    Raises:
        TransformationError: If transformation is invalid or not supported
    """
    if not transformation:
        return column_expr

    # Parse transformation
    func_name, params = parse_transformation_params(transformation)
    if not func_name:
        return column_expr

    func_upper = func_name.upper()

    # Determine transformation category and apply
    # String transformations
    string_funcs = {
        "UPPER",
        "LOWER",
        "TRIM",
        "LTRIM",
        "RTRIM",
        "SUBSTRING",
        "CONCAT",
        "REPLACE",
        "LENGTH",
    }
    if func_upper in string_funcs:
        return apply_string_transformation(column_expr, func_name, params)

    # Numeric transformations
    numeric_funcs = {
        "ROUND",
        "FLOOR",
        "CEIL",
        "CEILING",
        "ABS",
        "ADD",
        "SUBTRACT",
        "MULTIPLY",
        "DIVIDE",
        "MOD",
    }
    if func_upper in numeric_funcs:
        return apply_numeric_transformation(column_expr, func_name, params)

    # DateTime transformations
    datetime_funcs = {
        "TO_DATE",
        "TO_DATETIME",
        "DATE_ADD",
        "DATE_SUB",
        "DATE_DIFF",
        "FORMAT_DATE",
        "YEAR",
        "MONTH",
        "DAY",
        "HOUR",
        "MINUTE",
        "SECOND",
    }
    if func_upper in datetime_funcs:
        return apply_datetime_transformation(column_expr, func_name, params)

    # Type casting transformations
    casting_funcs = {
        "CAST",
        "TO_INT",
        "TO_INTEGER",
        "TO_FLOAT",
        "TO_STRING",
        "TO_BOOL",
        "TO_BOOLEAN",
    }
    if func_upper in casting_funcs:
        return apply_type_casting_transformation(column_expr, func_name, params)

    # Conditional transformations
    conditional_funcs = {"IF", "COALESCE", "NULLIF", "IS_NULL", "IS_NOT_NULL"}
    if func_upper in conditional_funcs:
        return apply_conditional_transformation(column_expr, func_name, params)

    # Hash transformations
    if func_upper == "HASH" or func_name.lower().startswith("hash"):
        return apply_hash_transformation(column_expr, func_name, params)

    # If we get here, it's an unknown transformation
    raise TransformationError(f"Unknown transformation: {transformation}")


def get_supported_transformations() -> Dict[str, List[str]]:
    """
    Get a dictionary of all supported transformations grouped by category.

    Returns:
        Dictionary with transformation categories and their functions
    """
    return {
        "String": [
            "UPPER",
            "LOWER",
            "TRIM",
            "LTRIM",
            "RTRIM",
            "SUBSTRING(start, length)",
            "CONCAT(str1, str2, ...)",
            "REPLACE(old, new)",
            "LENGTH",
        ],
        "Numeric": [
            "ROUND(decimals)",
            "FLOOR",
            "CEIL",
            "ABS",
            "ADD(value)",
            "SUBTRACT(value)",
            "MULTIPLY(value)",
            "DIVIDE(value)",
            "MOD(divisor)",
        ],
        "DateTime": [
            "TO_DATE",
            "TO_DATETIME",
            "DATE_ADD(value, unit)",
            "DATE_SUB(value, unit)",
            "DATE_DIFF(unit, date2)",
            "FORMAT_DATE(format)",
            "YEAR",
            "MONTH",
            "DAY",
            "HOUR",
            "MINUTE",
            "SECOND",
        ],
        "Type Casting": [
            "CAST(type)",
            "TO_INT",
            "TO_FLOAT",
            "TO_STRING",
            "TO_BOOL",
        ],
        "Conditional": [
            "IF(condition, true_value, false_value)",
            "COALESCE(value1, value2, ...)",
            "NULLIF(value1, value2)",
            "IS_NULL",
            "IS_NOT_NULL",
        ],
        "Hash": [
            "HASH(MD5)",
            "HASH(SHA256)",
            "HASH(SHA512)",
            "hash_MD5",  # Legacy format
        ],
    }
