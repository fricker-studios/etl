"""
Pandas-based transformation utilities for complex data preprocessing.

These utilities complement the ClickHouse SQL transformations by providing
advanced preprocessing capabilities using pandas. Use these for operations
that are more complex or not easily expressible in SQL.

Note: These transformations run in Python/pandas, so they may be slower
than native ClickHouse transformations for large datasets.
"""

import logging
from typing import Dict, Any, Callable, Optional
import pandas as pd

logger = logging.getLogger(__name__)


class PandasTransformationError(Exception):
    """Exception raised for errors in pandas transformations."""

    pass


def apply_pandas_transformation(
    df: pd.DataFrame, column: str, transformation: str, **kwargs
) -> pd.Series:
    """
    Apply a pandas-based transformation to a DataFrame column.

    This function provides advanced transformations that complement the
    ClickHouse SQL transformations. Use for complex operations that are
    difficult to express in SQL.

    Args:
        df: pandas DataFrame
        column: Column name to transform
        transformation: Transformation name
        **kwargs: Additional parameters for the transformation

    Returns:
        Transformed pandas Series

    Raises:
        PandasTransformationError: If transformation fails
    """
    if column not in df.columns:
        raise PandasTransformationError(f"Column {column} not found in DataFrame")

    func_name = transformation.upper()

    # Get the transformation function
    transformation_map = get_pandas_transformations()
    if func_name not in transformation_map:
        raise PandasTransformationError(f"Unknown transformation: {transformation}")

    try:
        func = transformation_map[func_name]
        return func(df[column], **kwargs)
    except Exception as e:
        raise PandasTransformationError(
            f"Error applying transformation {transformation}: {str(e)}"
        )


def get_pandas_transformations() -> Dict[str, Callable]:
    """
    Get dictionary of available pandas transformations.

    Returns:
        Dictionary mapping transformation names to functions
    """
    return {
        # String operations
        "FILLNA": lambda s, value="": s.fillna(value),
        "STRIP": lambda s: s.str.strip(),
        "SPLIT": lambda s, sep=",", index=0: s.str.split(sep).str[index],
        "EXTRACT_REGEX": lambda s, pattern: s.str.extract(pattern, expand=False),
        "CONTAINS": lambda s, pattern: s.str.contains(pattern, na=False),
        # Numeric operations
        "NORMALIZE": lambda s: (s - s.mean()) / s.std(),
        "ZSCORE": lambda s: (s - s.mean()) / s.std(),
        "PERCENTILE": lambda s, q=0.5: s.quantile(q),
        "CLIP": lambda s, lower=None, upper=None: s.clip(lower=lower, upper=upper),
        # Date operations
        "TO_DATETIME": lambda s, format=None: pd.to_datetime(s, format=format),
        "DATE_RANGE": lambda s, periods=1, freq="D": pd.date_range(
            start=s.min(), periods=periods, freq=freq
        ),
        # Advanced operations
        "RANK": lambda s, method="average": s.rank(method=method),
        "CUMSUM": lambda s: s.cumsum(),
        "ROLLING_MEAN": lambda s, window=3: s.rolling(window=window).mean(),
        "LAG": lambda s, periods=1: s.shift(periods),
        "LEAD": lambda s, periods=1: s.shift(-periods),
        # Categorical
        "FACTORIZE": lambda s: pd.factorize(s)[0],
        "GET_DUMMIES": lambda s: pd.get_dummies(s),
    }


def preprocess_dataframe(
    df: pd.DataFrame, transformations: Dict[str, Dict[str, Any]]
) -> pd.DataFrame:
    """
    Apply multiple pandas transformations to a DataFrame.

    This is useful for batch preprocessing before loading data into ClickHouse.

    Args:
        df: pandas DataFrame to transform
        transformations: Dictionary mapping column names to transformation specs
            Example: {
                "price": {"transformation": "CLIP", "lower": 0, "upper": 1000},
                "date_str": {"transformation": "TO_DATETIME", "format": "%Y-%m-%d"}
            }

    Returns:
        Transformed DataFrame

    Example:
        >>> df = pd.DataFrame({"price": [100, -50, 2000], "date": ["2024-01-01", "2024-01-02", "2024-01-03"]})
        >>> transformations = {
        ...     "price": {"transformation": "CLIP", "lower": 0, "upper": 1000},
        ...     "date": {"transformation": "TO_DATETIME"}
        ... }
        >>> result = preprocess_dataframe(df, transformations)
    """
    result_df = df.copy()

    for column, spec in transformations.items():
        if column not in result_df.columns:
            logger.warning(f"Column {column} not found in DataFrame, skipping")
            continue

        transformation = spec.get("transformation")
        if not transformation:
            logger.warning(f"No transformation specified for column {column}, skipping")
            continue

        # Extract kwargs (all keys except 'transformation')
        kwargs = {k: v for k, v in spec.items() if k != "transformation"}

        try:
            result_df[column] = apply_pandas_transformation(
                result_df, column, transformation, **kwargs
            )
            logger.info(f"Applied {transformation} to column {column}")
        except PandasTransformationError as e:
            logger.error(f"Failed to transform column {column}: {str(e)}")
            # Continue with other transformations even if one fails

    return result_df


def validate_and_clean_data(
    df: pd.DataFrame,
    validation_rules: Optional[Dict[str, Dict[str, Any]]] = None,
) -> pd.DataFrame:
    """
    Validate and clean data using pandas operations.

    Common cleaning operations:
    - Remove duplicates
    - Fill missing values
    - Convert data types
    - Remove outliers
    - Standardize formats

    Args:
        df: pandas DataFrame
        validation_rules: Optional validation rules per column
            Example: {
                "email": {"type": "string", "regex": r"^[\\w\\.-]+@[\\w\\.-]+\\.\\w+$"},
                "age": {"type": "int", "min": 0, "max": 120}
            }

    Returns:
        Cleaned DataFrame
    """
    cleaned_df = df.copy()

    # Remove duplicate rows
    initial_rows = len(cleaned_df)
    cleaned_df = cleaned_df.drop_duplicates()
    if len(cleaned_df) < initial_rows:
        logger.info(f"Removed {initial_rows - len(cleaned_df)} duplicate rows")

    # Apply validation rules if provided
    if validation_rules:
        for column, rules in validation_rules.items():
            if column not in cleaned_df.columns:
                continue

            # Type validation
            expected_type = rules.get("type")
            if expected_type == "int":
                cleaned_df[column] = pd.to_numeric(
                    cleaned_df[column], errors="coerce"
                ).astype("Int64")
            elif expected_type == "float":
                cleaned_df[column] = pd.to_numeric(cleaned_df[column], errors="coerce")
            elif expected_type == "datetime":
                cleaned_df[column] = pd.to_datetime(
                    cleaned_df[column], errors="coerce"
                )
            elif expected_type == "string":
                cleaned_df[column] = cleaned_df[column].astype(str)

            # Range validation for numeric columns
            if "min" in rules:
                mask = cleaned_df[column] < rules["min"]
                if mask.any():
                    logger.warning(
                        f"Found {mask.sum()} values below min {rules['min']} in {column}"
                    )
                    cleaned_df.loc[mask, column] = rules.get(
                        "default", rules["min"]
                    )

            if "max" in rules:
                mask = cleaned_df[column] > rules["max"]
                if mask.any():
                    logger.warning(
                        f"Found {mask.sum()} values above max {rules['max']} in {column}"
                    )
                    cleaned_df.loc[mask, column] = rules.get(
                        "default", rules["max"]
                    )

            # Regex validation for string columns
            if "regex" in rules:
                pattern = rules["regex"]
                mask = ~cleaned_df[column].astype(str).str.match(pattern, na=False)
                if mask.any():
                    logger.warning(
                        f"Found {mask.sum()} invalid values in {column} (regex: {pattern})"
                    )
                    # Set invalid values to None or a default
                    cleaned_df.loc[mask, column] = rules.get("default", None)

    return cleaned_df


def aggregate_data(
    df: pd.DataFrame, group_by: list, aggregations: Dict[str, str]
) -> pd.DataFrame:
    """
    Perform group-by aggregations on a DataFrame.

    This provides aggregation capabilities that complement ClickHouse SQL.
    Use this for complex aggregations during preprocessing.

    Args:
        df: pandas DataFrame
        group_by: List of columns to group by
        aggregations: Dictionary mapping columns to aggregation functions
            Example: {"sales": "sum", "quantity": "mean", "customer_id": "count"}

    Returns:
        Aggregated DataFrame

    Example:
        >>> df = pd.DataFrame({
        ...     "date": ["2024-01-01", "2024-01-01", "2024-01-02"],
        ...     "category": ["A", "B", "A"],
        ...     "sales": [100, 200, 150]
        ... })
        >>> result = aggregate_data(df, ["date", "category"], {"sales": "sum"})
    """
    if not group_by:
        raise ValueError("group_by must contain at least one column")

    try:
        result = df.groupby(group_by).agg(aggregations).reset_index()
        logger.info(
            f"Aggregated {len(df)} rows into {len(result)} groups by {group_by}"
        )
        return result
    except Exception as e:
        logger.error(f"Aggregation failed: {str(e)}")
        raise PandasTransformationError(f"Aggregation error: {str(e)}")


def pivot_data(
    df: pd.DataFrame,
    index: str,
    columns: str,
    values: str,
    aggfunc: str = "sum",
) -> pd.DataFrame:
    """
    Pivot a DataFrame for wide-format analysis.

    Args:
        df: pandas DataFrame
        index: Column to use as index
        columns: Column to pivot on
        values: Column containing values
        aggfunc: Aggregation function (default: 'sum')

    Returns:
        Pivoted DataFrame

    Example:
        >>> df = pd.DataFrame({
        ...     "date": ["2024-01-01", "2024-01-01", "2024-01-02"],
        ...     "product": ["A", "B", "A"],
        ...     "sales": [100, 200, 150]
        ... })
        >>> result = pivot_data(df, index="date", columns="product", values="sales")
    """
    try:
        result = df.pivot_table(
            index=index, columns=columns, values=values, aggfunc=aggfunc, fill_value=0
        )
        logger.info(f"Pivoted data on {columns} with {aggfunc} aggregation")
        return result.reset_index()
    except Exception as e:
        logger.error(f"Pivot failed: {str(e)}")
        raise PandasTransformationError(f"Pivot error: {str(e)}")


def merge_dataframes(
    left: pd.DataFrame,
    right: pd.DataFrame,
    on: str,
    how: str = "inner",
) -> pd.DataFrame:
    """
    Merge two DataFrames (equivalent to SQL JOIN).

    Args:
        left: Left DataFrame
        right: Right DataFrame
        on: Column name to join on
        how: Type of join ('inner', 'left', 'right', 'outer')

    Returns:
        Merged DataFrame

    Example:
        >>> customers = pd.DataFrame({"customer_id": [1, 2, 3], "name": ["Alice", "Bob", "Charlie"]})
        >>> orders = pd.DataFrame({"customer_id": [1, 1, 2], "amount": [100, 150, 200]})
        >>> result = merge_dataframes(customers, orders, on="customer_id", how="left")
    """
    try:
        result = pd.merge(left, right, on=on, how=how)
        logger.info(
            f"Merged DataFrames: {len(left)} + {len(right)} → {len(result)} rows ({how} join)"
        )
        return result
    except Exception as e:
        logger.error(f"Merge failed: {str(e)}")
        raise PandasTransformationError(f"Merge error: {str(e)}")
