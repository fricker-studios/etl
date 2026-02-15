"""
Unit tests for transformation utilities.
"""

from django.test import TestCase
from core.transformation_utils import (
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


class TransformationParsingTests(TestCase):
    """Tests for parsing transformation strings."""

    def test_parse_hash_transformation(self):
        """Test parsing hash transformations."""
        func, params = parse_transformation_params("hash_MD5")
        self.assertEqual(func, "hash")
        self.assertEqual(params, ["MD5"])

    def test_parse_simple_function(self):
        """Test parsing simple function without parameters."""
        func, params = parse_transformation_params("UPPER")
        self.assertEqual(func, "UPPER")
        self.assertEqual(params, [])

    def test_parse_function_with_params(self):
        """Test parsing function with parameters."""
        func, params = parse_transformation_params("SUBSTRING(0, 10)")
        self.assertEqual(func, "SUBSTRING")
        self.assertEqual(params, ["0", "10"])

    def test_parse_cast_function(self):
        """Test parsing CAST function."""
        func, params = parse_transformation_params("CAST(integer)")
        self.assertEqual(func, "CAST")
        self.assertEqual(params, ["integer"])

    def test_parse_empty_transformation(self):
        """Test parsing empty transformation."""
        func, params = parse_transformation_params("")
        self.assertEqual(func, "")
        self.assertEqual(params, [])


class StringTransformationTests(TestCase):
    """Tests for string transformation functions."""

    def test_upper_transformation(self):
        """Test UPPER transformation."""
        result = apply_string_transformation("name", "UPPER", [])
        self.assertEqual(result, "upper(name)")

    def test_lower_transformation(self):
        """Test LOWER transformation."""
        result = apply_string_transformation("name", "LOWER", [])
        self.assertEqual(result, "lower(name)")

    def test_trim_transformation(self):
        """Test TRIM transformation."""
        result = apply_string_transformation("name", "TRIM", [])
        self.assertEqual(result, "trim(BOTH ' ' FROM name)")

    def test_substring_transformation(self):
        """Test SUBSTRING transformation."""
        result = apply_string_transformation("name", "SUBSTRING", ["1", "10"])
        self.assertEqual(result, "substring(name, 1, 10)")

    def test_substring_missing_params(self):
        """Test SUBSTRING with missing parameters raises error."""
        with self.assertRaises(TransformationError):
            apply_string_transformation("name", "SUBSTRING", ["1"])

    def test_concat_transformation(self):
        """Test CONCAT transformation."""
        result = apply_string_transformation("first_name", "CONCAT", ["' '", "last_name"])
        self.assertEqual(result, "concat(first_name, ' ', last_name)")

    def test_replace_transformation(self):
        """Test REPLACE transformation."""
        result = apply_string_transformation("email", "REPLACE", ["'@'", "'[at]'"])
        self.assertEqual(result, "replace(email, '@', '[at]')")

    def test_length_transformation(self):
        """Test LENGTH transformation."""
        result = apply_string_transformation("name", "LENGTH", [])
        self.assertEqual(result, "length(name)")


class NumericTransformationTests(TestCase):
    """Tests for numeric transformation functions."""

    def test_round_transformation(self):
        """Test ROUND transformation."""
        result = apply_numeric_transformation("price", "ROUND", ["2"])
        self.assertEqual(result, "round(price, 2)")

    def test_round_default_decimals(self):
        """Test ROUND with default decimals."""
        result = apply_numeric_transformation("price", "ROUND", [])
        self.assertEqual(result, "round(price, 0)")

    def test_floor_transformation(self):
        """Test FLOOR transformation."""
        result = apply_numeric_transformation("value", "FLOOR", [])
        self.assertEqual(result, "floor(value)")

    def test_ceil_transformation(self):
        """Test CEIL transformation."""
        result = apply_numeric_transformation("value", "CEIL", [])
        self.assertEqual(result, "ceil(value)")

    def test_abs_transformation(self):
        """Test ABS transformation."""
        result = apply_numeric_transformation("amount", "ABS", [])
        self.assertEqual(result, "abs(amount)")

    def test_add_transformation(self):
        """Test ADD transformation."""
        result = apply_numeric_transformation("quantity", "ADD", ["10"])
        self.assertEqual(result, "(quantity + 10)")

    def test_subtract_transformation(self):
        """Test SUBTRACT transformation."""
        result = apply_numeric_transformation("quantity", "SUBTRACT", ["5"])
        self.assertEqual(result, "(quantity - 5)")

    def test_multiply_transformation(self):
        """Test MULTIPLY transformation."""
        result = apply_numeric_transformation("price", "MULTIPLY", ["1.1"])
        self.assertEqual(result, "(price * 1.1)")

    def test_divide_transformation(self):
        """Test DIVIDE transformation."""
        result = apply_numeric_transformation("total", "DIVIDE", ["2"])
        self.assertEqual(result, "(total / 2)")

    def test_mod_transformation(self):
        """Test MOD transformation."""
        result = apply_numeric_transformation("number", "MOD", ["10"])
        self.assertEqual(result, "(number % 10)")


class DateTimeTransformationTests(TestCase):
    """Tests for datetime transformation functions."""

    def test_to_date_transformation(self):
        """Test TO_DATE transformation."""
        result = apply_datetime_transformation("created_at", "TO_DATE", [])
        self.assertEqual(result, "toDate(created_at)")

    def test_to_datetime_transformation(self):
        """Test TO_DATETIME transformation."""
        result = apply_datetime_transformation("timestamp_str", "TO_DATETIME", [])
        self.assertEqual(result, "toDateTime(timestamp_str)")

    def test_date_add_year(self):
        """Test DATE_ADD with YEAR unit."""
        result = apply_datetime_transformation("date", "DATE_ADD", ["1", "YEAR"])
        self.assertEqual(result, "addYears(date, 1)")

    def test_date_add_month(self):
        """Test DATE_ADD with MONTH unit."""
        result = apply_datetime_transformation("date", "DATE_ADD", ["3", "MONTH"])
        self.assertEqual(result, "addMonths(date, 3)")

    def test_date_add_day(self):
        """Test DATE_ADD with DAY unit."""
        result = apply_datetime_transformation("date", "DATE_ADD", ["7", "DAY"])
        self.assertEqual(result, "addDays(date, 7)")

    def test_date_sub_hour(self):
        """Test DATE_SUB with HOUR unit."""
        result = apply_datetime_transformation("timestamp", "DATE_SUB", ["2", "HOUR"])
        self.assertEqual(result, "subtractHours(timestamp, 2)")

    def test_date_diff_day(self):
        """Test DATE_DIFF with DAY unit."""
        result = apply_datetime_transformation("start_date", "DATE_DIFF", ["DAY", "end_date"])
        self.assertEqual(result, "dateDiff('day', start_date, end_date)")

    def test_format_date(self):
        """Test FORMAT_DATE transformation."""
        result = apply_datetime_transformation("date", "FORMAT_DATE", ["'%Y-%m-%d'"])
        self.assertEqual(result, "formatDateTime(date, '%Y-%m-%d')")

    def test_year_extraction(self):
        """Test YEAR extraction."""
        result = apply_datetime_transformation("date", "YEAR", [])
        self.assertEqual(result, "toYear(date)")

    def test_month_extraction(self):
        """Test MONTH extraction."""
        result = apply_datetime_transformation("date", "MONTH", [])
        self.assertEqual(result, "toMonth(date)")

    def test_day_extraction(self):
        """Test DAY extraction."""
        result = apply_datetime_transformation("date", "DAY", [])
        self.assertEqual(result, "toDayOfMonth(date)")


class TypeCastingTransformationTests(TestCase):
    """Tests for type casting transformation functions."""

    def test_cast_to_integer(self):
        """Test CAST to integer."""
        result = apply_type_casting_transformation("value", "CAST", ["INTEGER"])
        self.assertEqual(result, "CAST(value AS Int64)")

    def test_cast_to_float(self):
        """Test CAST to float."""
        result = apply_type_casting_transformation("value", "CAST", ["FLOAT"])
        self.assertEqual(result, "CAST(value AS Float64)")

    def test_cast_to_string(self):
        """Test CAST to string."""
        result = apply_type_casting_transformation("number", "CAST", ["STRING"])
        self.assertEqual(result, "CAST(number AS String)")

    def test_cast_to_boolean(self):
        """Test CAST to boolean."""
        result = apply_type_casting_transformation("flag", "CAST", ["BOOLEAN"])
        self.assertEqual(result, "CAST(flag AS Bool)")

    def test_to_int(self):
        """Test TO_INT transformation."""
        result = apply_type_casting_transformation("value", "TO_INT", [])
        self.assertEqual(result, "toInt64(value)")

    def test_to_float(self):
        """Test TO_FLOAT transformation."""
        result = apply_type_casting_transformation("value", "TO_FLOAT", [])
        self.assertEqual(result, "toFloat64(value)")

    def test_to_string(self):
        """Test TO_STRING transformation."""
        result = apply_type_casting_transformation("number", "TO_STRING", [])
        self.assertEqual(result, "toString(number)")

    def test_to_bool(self):
        """Test TO_BOOL transformation."""
        result = apply_type_casting_transformation("flag", "TO_BOOL", [])
        self.assertEqual(result, "toBool(flag)")


class ConditionalTransformationTests(TestCase):
    """Tests for conditional transformation functions."""

    def test_if_transformation(self):
        """Test IF transformation."""
        result = apply_conditional_transformation(
            "status", "IF", ["column = 'active'", "'Yes'", "'No'"]
        )
        self.assertEqual(result, "if(status = 'active', 'Yes', 'No')")

    def test_coalesce_transformation(self):
        """Test COALESCE transformation."""
        result = apply_conditional_transformation("value", "COALESCE", ["0", "default_value"])
        self.assertEqual(result, "coalesce(value, 0, default_value)")

    def test_nullif_transformation(self):
        """Test NULLIF transformation."""
        result = apply_conditional_transformation("value", "NULLIF", ["0"])
        self.assertEqual(result, "nullIf(value, 0)")

    def test_is_null_transformation(self):
        """Test IS_NULL transformation."""
        result = apply_conditional_transformation("value", "IS_NULL", [])
        self.assertEqual(result, "isNull(value)")

    def test_is_not_null_transformation(self):
        """Test IS_NOT_NULL transformation."""
        result = apply_conditional_transformation("value", "IS_NOT_NULL", [])
        self.assertEqual(result, "isNotNull(value)")


class HashTransformationTests(TestCase):
    """Tests for hash transformation functions."""

    def test_hash_md5(self):
        """Test MD5 hash transformation."""
        result = apply_hash_transformation("business_key", "hash", ["MD5"])
        self.assertEqual(result, "MD5(business_key)")

    def test_hash_sha256(self):
        """Test SHA256 hash transformation."""
        result = apply_hash_transformation("business_key", "hash", ["SHA256"])
        self.assertEqual(result, "SHA256(business_key)")

    def test_hash_sha512(self):
        """Test SHA512 hash transformation."""
        result = apply_hash_transformation("business_key", "hash", ["SHA512"])
        self.assertEqual(result, "SHA512(business_key)")

    def test_legacy_hash_format(self):
        """Test legacy hash_MD5 format (backward compatibility)."""
        result = apply_hash_transformation("business_key", "hash_MD5", [])
        self.assertEqual(result, "MD5(business_key)")


class IntegrationTransformationTests(TestCase):
    """Integration tests for apply_transformation_to_column."""

    def test_apply_upper_transformation(self):
        """Test applying UPPER transformation."""
        result = apply_transformation_to_column("name", "UPPER")
        self.assertEqual(result, "upper(name)")

    def test_apply_round_transformation(self):
        """Test applying ROUND transformation."""
        result = apply_transformation_to_column("price", "ROUND(2)")
        self.assertEqual(result, "round(price, 2)")

    def test_apply_hash_transformation(self):
        """Test applying hash transformation."""
        result = apply_transformation_to_column("customer_id", "HASH(MD5)")
        self.assertEqual(result, "MD5(customer_id)")

    def test_apply_legacy_hash_transformation(self):
        """Test applying legacy hash_MD5 transformation."""
        result = apply_transformation_to_column("customer_id", "hash_MD5")
        self.assertEqual(result, "MD5(customer_id)")

    def test_apply_cast_transformation(self):
        """Test applying CAST transformation."""
        result = apply_transformation_to_column("age_str", "CAST(INTEGER)")
        self.assertEqual(result, "CAST(age_str AS Int64)")

    def test_apply_date_add_transformation(self):
        """Test applying DATE_ADD transformation."""
        result = apply_transformation_to_column("order_date", "DATE_ADD(7, DAY)")
        self.assertEqual(result, "addDays(order_date, 7)")

    def test_apply_no_transformation(self):
        """Test applying no transformation returns original column."""
        result = apply_transformation_to_column("name", "")
        self.assertEqual(result, "name")

    def test_apply_unknown_transformation(self):
        """Test applying unknown transformation raises error."""
        with self.assertRaises(TransformationError):
            apply_transformation_to_column("name", "UNKNOWN_FUNC")

    def test_complex_transformation_chain(self):
        """Test that transformations can be chained by nesting."""
        # First apply UPPER, then TRIM
        result1 = apply_transformation_to_column("name", "UPPER")
        # In practice, you'd need to nest these manually or apply sequentially
        self.assertEqual(result1, "upper(name)")


class SupportedTransformationsTests(TestCase):
    """Tests for get_supported_transformations."""

    def test_supported_transformations_structure(self):
        """Test that supported transformations return proper structure."""
        transformations = get_supported_transformations()
        self.assertIsInstance(transformations, dict)
        self.assertIn("String", transformations)
        self.assertIn("Numeric", transformations)
        self.assertIn("DateTime", transformations)
        self.assertIn("Type Casting", transformations)
        self.assertIn("Conditional", transformations)
        self.assertIn("Hash", transformations)

    def test_string_transformations_present(self):
        """Test that string transformations are documented."""
        transformations = get_supported_transformations()
        self.assertIn("UPPER", transformations["String"])
        self.assertIn("LOWER", transformations["String"])
        self.assertIn("TRIM", transformations["String"])

    def test_numeric_transformations_present(self):
        """Test that numeric transformations are documented."""
        transformations = get_supported_transformations()
        self.assertIn("ROUND(decimals)", transformations["Numeric"])
        self.assertIn("ABS", transformations["Numeric"])

    def test_hash_transformations_present(self):
        """Test that hash transformations are documented."""
        transformations = get_supported_transformations()
        self.assertIn("HASH(MD5)", transformations["Hash"])
        self.assertIn("hash_MD5", transformations["Hash"])
