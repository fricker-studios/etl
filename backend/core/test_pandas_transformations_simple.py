#!/usr/bin/env python3
"""
Simple test script for pandas transformation utilities (no Django required).
"""

import sys
import os

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(__file__))

# Check if pandas is available
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False
    print("⚠ pandas not installed - skipping pandas transformation tests")

if PANDAS_AVAILABLE:
    from pandas_transformations import (
        apply_pandas_transformation,
        preprocess_dataframe,
        validate_and_clean_data,
        aggregate_data,
        pivot_data,
        merge_dataframes,
        get_pandas_transformations,
        PandasTransformationError,
    )


def test_basic_transformations():
    """Test basic pandas transformations."""
    print("Testing basic transformations...")
    
    # Create sample data
    df = pd.DataFrame({
        "name": ["  Alice  ", "Bob", "Charlie  "],
        "price": [100.5, 200.3, 300.7],
        "date_str": ["2024-01-01", "2024-01-02", "2024-01-03"]
    })
    
    # Test STRIP
    result = apply_pandas_transformation(df, "name", "STRIP")
    assert result[0] == "Alice", "STRIP failed"
    
    # Test NORMALIZE
    result = apply_pandas_transformation(df, "price", "NORMALIZE")
    assert abs(result.mean()) < 1e-10, "NORMALIZE failed (mean should be ~0)"
    
    print("✓ Basic transformations passed")


def test_preprocessing():
    """Test batch preprocessing."""
    print("Testing batch preprocessing...")
    
    df = pd.DataFrame({
        "price": [100, -50, 2000],
        "date_str": ["2024-01-01", "2024-01-02", "2024-01-03"]
    })
    
    transformations = {
        "price": {"transformation": "CLIP", "lower": 0, "upper": 1000},
        "date_str": {"transformation": "TO_DATETIME"}
    }
    
    result = preprocess_dataframe(df, transformations)
    assert result["price"][1] == 0, "CLIP lower bound failed"
    assert result["price"][2] == 1000, "CLIP upper bound failed"
    assert pd.api.types.is_datetime64_any_dtype(result["date_str"]), "TO_DATETIME failed"
    
    print("✓ Batch preprocessing passed")


def test_validation_and_cleaning():
    """Test data validation and cleaning."""
    print("Testing validation and cleaning...")
    
    df = pd.DataFrame({
        "age": [25, -5, 150, 30],
        "email": ["alice@example.com", "invalid", "bob@example.com", "charlie@example.com"]
    })
    
    validation_rules = {
        "age": {"type": "int", "min": 0, "max": 120, "default": 0},
    }
    
    result = validate_and_clean_data(df, validation_rules)
    assert result["age"][1] == 0, "Min validation failed"
    assert result["age"][2] == 0, "Max validation failed"
    
    print("✓ Validation and cleaning passed")


def test_aggregation():
    """Test group-by aggregation."""
    print("Testing aggregation...")
    
    df = pd.DataFrame({
        "date": ["2024-01-01", "2024-01-01", "2024-01-02", "2024-01-02"],
        "category": ["A", "B", "A", "B"],
        "sales": [100, 200, 150, 250]
    })
    
    result = aggregate_data(df, ["date", "category"], {"sales": "sum"})
    assert len(result) == 4, "Aggregation failed - wrong number of groups"
    assert result[result["category"] == "A"]["sales"].sum() == 250, "Aggregation sum failed"
    
    print("✓ Aggregation passed")


def test_pivot():
    """Test pivot operation."""
    print("Testing pivot...")
    
    df = pd.DataFrame({
        "date": ["2024-01-01", "2024-01-01", "2024-01-02"],
        "product": ["A", "B", "A"],
        "sales": [100, 200, 150]
    })
    
    result = pivot_data(df, index="date", columns="product", values="sales")
    assert "A" in result.columns, "Pivot failed - column A not found"
    assert "B" in result.columns, "Pivot failed - column B not found"
    
    print("✓ Pivot passed")


def test_merge():
    """Test DataFrame merge."""
    print("Testing merge...")
    
    customers = pd.DataFrame({
        "customer_id": [1, 2, 3],
        "name": ["Alice", "Bob", "Charlie"]
    })
    
    orders = pd.DataFrame({
        "customer_id": [1, 1, 2],
        "amount": [100, 150, 200]
    })
    
    result = merge_dataframes(customers, orders, on="customer_id", how="left")
    assert len(result) == 4, "Merge failed - wrong number of rows"
    assert result[result["customer_id"] == 3]["amount"].isna().any(), "Merge failed - should have NaN"
    
    print("✓ Merge passed")


def test_supported_transformations():
    """Test get_pandas_transformations."""
    print("Testing supported transformations...")
    
    transformations = get_pandas_transformations()
    assert isinstance(transformations, dict), "Should return dict"
    assert "FILLNA" in transformations, "Should have FILLNA"
    assert "NORMALIZE" in transformations, "Should have NORMALIZE"
    assert "CLIP" in transformations, "Should have CLIP"
    
    print("✓ Supported transformations test passed")


def main():
    """Run all tests."""
    if not PANDAS_AVAILABLE:
        print("Skipping pandas transformation tests (pandas not installed)")
        return 0
    
    print("=" * 60)
    print("Running pandas transformation utilities tests...")
    print("=" * 60)
    
    try:
        test_basic_transformations()
        test_preprocessing()
        test_validation_and_cleaning()
        test_aggregation()
        test_pivot()
        test_merge()
        test_supported_transformations()
        
        print("=" * 60)
        print("✓ All pandas transformation tests passed!")
        print("=" * 60)
        return 0
    except AssertionError as e:
        print(f"\n✗ Test failed: {e}")
        return 1
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
