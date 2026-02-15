#!/usr/bin/env python3
"""
Simple test script for transformation utilities (no Django required).
"""

import sys
import os

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(__file__))

# Import transformation utilities
from transformation_utils import (
    parse_transformation_params,
    apply_string_transformation,
    apply_numeric_transformation,
    apply_datetime_transformation,
    apply_type_casting_transformation,
    apply_conditional_transformation,
    apply_hash_transformation,
    apply_transformation_to_column,
    get_supported_transformations,
    TransformationError,
)


def test_string_transformations():
    """Test string transformations."""
    print("Testing string transformations...")
    
    # Test UPPER
    result = apply_string_transformation("name", "UPPER", [])
    assert result == "upper(name)", f"UPPER failed: {result}"
    
    # Test LOWER
    result = apply_string_transformation("name", "LOWER", [])
    assert result == "lower(name)", f"LOWER failed: {result}"
    
    # Test SUBSTRING
    result = apply_string_transformation("name", "SUBSTRING", ["1", "10"])
    assert result == "substring(name, 1, 10)", f"SUBSTRING failed: {result}"
    
    # Test CONCAT
    result = apply_string_transformation("first_name", "CONCAT", ["' '", "last_name"])
    assert result == "concat(first_name, ' ', last_name)", f"CONCAT failed: {result}"
    
    print("✓ String transformations passed")


def test_numeric_transformations():
    """Test numeric transformations."""
    print("Testing numeric transformations...")
    
    # Test ROUND
    result = apply_numeric_transformation("price", "ROUND", ["2"])
    assert result == "round(price, 2)", f"ROUND failed: {result}"
    
    # Test ABS
    result = apply_numeric_transformation("amount", "ABS", [])
    assert result == "abs(amount)", f"ABS failed: {result}"
    
    # Test ADD
    result = apply_numeric_transformation("quantity", "ADD", ["10"])
    assert result == "(quantity + 10)", f"ADD failed: {result}"
    
    # Test MULTIPLY
    result = apply_numeric_transformation("price", "MULTIPLY", ["1.1"])
    assert result == "(price * 1.1)", f"MULTIPLY failed: {result}"
    
    print("✓ Numeric transformations passed")


def test_datetime_transformations():
    """Test datetime transformations."""
    print("Testing datetime transformations...")
    
    # Test TO_DATE
    result = apply_datetime_transformation("created_at", "TO_DATE", [])
    assert result == "toDate(created_at)", f"TO_DATE failed: {result}"
    
    # Test DATE_ADD
    result = apply_datetime_transformation("date", "DATE_ADD", ["7", "DAY"])
    assert result == "addDays(date, 7)", f"DATE_ADD failed: {result}"
    
    # Test YEAR
    result = apply_datetime_transformation("date", "YEAR", [])
    assert result == "toYear(date)", f"YEAR failed: {result}"
    
    print("✓ DateTime transformations passed")


def test_type_casting_transformations():
    """Test type casting transformations."""
    print("Testing type casting transformations...")
    
    # Test CAST
    result = apply_type_casting_transformation("value", "CAST", ["INTEGER"])
    assert result == "CAST(value AS Int64)", f"CAST failed: {result}"
    
    # Test TO_INT
    result = apply_type_casting_transformation("value", "TO_INT", [])
    assert result == "toInt64(value)", f"TO_INT failed: {result}"
    
    # Test TO_STRING
    result = apply_type_casting_transformation("number", "TO_STRING", [])
    assert result == "toString(number)", f"TO_STRING failed: {result}"
    
    print("✓ Type casting transformations passed")


def test_hash_transformations():
    """Test hash transformations."""
    print("Testing hash transformations...")
    
    # Test MD5
    result = apply_hash_transformation("business_key", "hash", ["MD5"])
    assert result == "MD5(business_key)", f"MD5 failed: {result}"
    
    # Test SHA256
    result = apply_hash_transformation("business_key", "hash", ["SHA256"])
    assert result == "SHA256(business_key)", f"SHA256 failed: {result}"
    
    # Test legacy format
    result = apply_hash_transformation("business_key", "hash_MD5", [])
    assert result == "MD5(business_key)", f"Legacy hash failed: {result}"
    
    print("✓ Hash transformations passed")


def test_integration():
    """Test integration via apply_transformation_to_column."""
    print("Testing integration...")
    
    # Test UPPER
    result = apply_transformation_to_column("name", "UPPER")
    assert result == "upper(name)", f"Integration UPPER failed: {result}"
    
    # Test ROUND with params
    result = apply_transformation_to_column("price", "ROUND(2)")
    assert result == "round(price, 2)", f"Integration ROUND failed: {result}"
    
    # Test hash
    result = apply_transformation_to_column("customer_id", "HASH(MD5)")
    assert result == "MD5(customer_id)", f"Integration HASH failed: {result}"
    
    # Test legacy hash
    result = apply_transformation_to_column("customer_id", "hash_MD5")
    assert result == "MD5(customer_id)", f"Integration legacy hash failed: {result}"
    
    # Test no transformation
    result = apply_transformation_to_column("name", "")
    assert result == "name", f"Integration no transform failed: {result}"
    
    print("✓ Integration tests passed")


def test_supported_transformations():
    """Test get_supported_transformations."""
    print("Testing supported transformations...")
    
    transformations = get_supported_transformations()
    assert isinstance(transformations, dict), "Should return dict"
    assert "String" in transformations, "Should have String category"
    assert "Numeric" in transformations, "Should have Numeric category"
    assert "DateTime" in transformations, "Should have DateTime category"
    assert "Hash" in transformations, "Should have Hash category"
    
    print("✓ Supported transformations test passed")


def test_error_handling():
    """Test error handling."""
    print("Testing error handling...")
    
    # Test unknown transformation
    try:
        apply_transformation_to_column("name", "UNKNOWN_FUNC")
        assert False, "Should have raised TransformationError"
    except TransformationError as e:
        assert "Unknown transformation" in str(e)
    
    # Test missing parameters
    try:
        apply_string_transformation("name", "SUBSTRING", ["1"])
        assert False, "Should have raised TransformationError"
    except TransformationError as e:
        assert "requires 2 parameters" in str(e)
    
    print("✓ Error handling tests passed")


def main():
    """Run all tests."""
    print("=" * 60)
    print("Running transformation utilities tests...")
    print("=" * 60)
    
    try:
        test_string_transformations()
        test_numeric_transformations()
        test_datetime_transformations()
        test_type_casting_transformations()
        test_hash_transformations()
        test_integration()
        test_supported_transformations()
        test_error_handling()
        
        print("=" * 60)
        print("✓ All tests passed!")
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
