import { InExpression } from "./first-pass-parser";
import { ValidationError, reservedWords, SearchQueryErrorCode } from "./validator";

export const validateInExpression = (
  expr: InExpression,
  errors: ValidationError[]
): void => {
  // Validate field name pattern
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(expr.field)) {
    errors.push({
      message: "Invalid characters in field name",
      code: SearchQueryErrorCode.INVALID_FIELD_CHARS,
      position: expr.position,
      length: expr.field.length,
    });
  }

  // Check for reserved words
  if (reservedWords.has(expr.field.toUpperCase())) {
    errors.push({
      message: `${expr.field} is a reserved word`,
      code: SearchQueryErrorCode.RESERVED_WORD_AS_FIELD,
      value: expr.field,
      position: expr.position,
      length: expr.field.length,
    });
  }

  // Validate value format based on field type
  expr.values.forEach((value, index) => {
    if (value.includes(",")) {
      errors.push({
        message: "Invalid character in IN value",
        code: SearchQueryErrorCode.INVALID_IN_VALUE,
        position: expr.position + expr.field.length + 3 + index * (value.length + 1),
        length: value.length,
      });
    }
  });
};
