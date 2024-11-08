import { tokenize, createStream, currentToken, TokenType } from "./lexer";
import {
  parseExpression,
  PositionLength,
  WildcardPattern as FirstPassWildcard,
} from "./first-pass-parser";
import { validateSearchQuery, ValidationError } from "./validator";
import { validateExpressionFields } from "./validate-expression-fields";
import { transformToExpression } from "./transform-to-expression";

// Schema types for range queries
interface FieldSchema {
  name: string;
  type: "string" | "number" | "date" | "boolean";
}

// Second Pass AST types (semantic analysis)
type SearchTerm = {
  readonly type: "SEARCH_TERM";
  readonly value: string;
} & PositionLength;

type WildcardPattern = {
  readonly type: "WILDCARD";
  readonly prefix: string;
  readonly quoted: boolean;
} & PositionLength;

type Field = {
  readonly type: "FIELD";
  readonly value: string;
} & PositionLength;

type Value = {
  readonly type: "VALUE";
  readonly value: string;
} & PositionLength;

type RangeOperator = ">=" | ">" | "<=" | "<" | "BETWEEN";

type RangeExpression = {
  readonly type: "RANGE";
  readonly field: Field;
  readonly operator: RangeOperator;
  readonly value: Value;
  readonly value2?: Value; // For BETWEEN
} & PositionLength;

export type FieldValue = {
  readonly type: "FIELD_VALUE";
  readonly field: Field;
  readonly value: Value;
};

type And = {
  readonly type: "AND";
  readonly left: Expression;
  readonly right: Expression;
} & PositionLength;

type Or = {
  readonly type: "OR";
  readonly left: Expression;
  readonly right: Expression;
} & PositionLength;

type Not = {
  readonly type: "NOT";
  readonly expression: Expression;
} & PositionLength;

type InExpression = {
  readonly type: "IN";
  readonly field: Field;
  readonly values: Value[];
} & PositionLength;

type Expression =
  | SearchTerm
  | WildcardPattern
  | FieldValue
  | RangeExpression
  | And
  | Or
  | Not
  | InExpression;

type SearchQuery = {
  readonly type: "SEARCH_QUERY";
  readonly expression: Expression | null;
};

type SearchQueryError = {
  readonly type: "SEARCH_QUERY_ERROR";
  readonly expression: null;
  readonly errors: ValidationError[];
};

// Helper function to stringify expressions
const stringify = (expr: Expression): string => {
  switch (expr.type) {
    case "SEARCH_TERM":
      return expr.value.includes(" ") ? `"${expr.value}"` : expr.value;
    case "WILDCARD":
      return expr.quoted ? `"${expr.prefix}*"` : `${expr.prefix}*`;
    case "FIELD_VALUE":
      return `${expr.field.value}:${expr.value.value}`;
    case "RANGE":
      if (expr.operator === "BETWEEN") {
        return `${expr.field.value}:${expr.value.value}..${expr.value2?.value}`;
      }
      return `${expr.field.value}:${expr.operator}${expr.value.value}`;
    case "NOT":
      return `NOT (${stringify(expr.expression)})`;
    case "AND":
      return `(${stringify(expr.left)} AND ${stringify(expr.right)})`;
    case "OR":
      return `(${stringify(expr.left)} OR ${stringify(expr.right)})`;
    case "IN": {
      const values = expr.values.map((v: { value: string }) => 
        v.value.includes(" ") ? `"${v.value}"` : v.value
      ).join(",");
      return `${expr.field.value}:IN(${values})`;
    }
  }
};

// Main parse function
export const parseSearchInputQuery = (
  input: string,
  fieldSchemas: FieldSchema[] = []
): SearchQuery | SearchQueryError => {
  try {
    const tokens = tokenize(input);
    const stream = createStream(tokens);

    if (currentToken(stream).type === TokenType.EOF) {
      return { type: "SEARCH_QUERY", expression: null };
    }

    const result = parseExpression(stream);

    const finalToken = currentToken(result.stream);
    if (finalToken.type !== TokenType.EOF) {
      throw {
        message: 'Unexpected ")"',
        position: finalToken.position,
        length: finalToken.length,
      };
    }

    const errors = validateSearchQuery(result.result);
    const fieldErrors: ValidationError[] = [];

    const allowedFields = fieldSchemas.map((s) => s.name.toLowerCase());

    if (allowedFields.length > 0) {
      const columnSet = new Set(allowedFields.map((col) => col.toLowerCase()));
      const schemaMap = new Map(
        fieldSchemas.map((s) => [s.name.toLowerCase(), s])
      );
      validateExpressionFields(
        result.result,
        columnSet,
        fieldErrors,
        schemaMap
      );
    }

    const fieldErrorKeys = fieldErrors.map(
      ({ position, length }) => `${position}-${length}`
    );
    const errorsToRemove = errors.filter(({ position, length }) =>
      fieldErrorKeys.includes(`${position}-${length}`)
    );
    const fieldErrorsFiltered = fieldErrors.filter(
      ({ position, length }) =>
        !errorsToRemove.some(
          (error) => error.position === position && error.length === length
        )
    );

    const allErrors = [...errors, ...fieldErrorsFiltered].sort(
      (a, b) => a.position - b.position
    );

    if (allErrors.length > 0) {
      return {
        type: "SEARCH_QUERY_ERROR",
        expression: null,
        errors: allErrors,
      };
    }

    const schemaMap = new Map(
      fieldSchemas.map((s) => [s.name.toLowerCase(), s])
    );
    const expression = transformToExpression(result.result, schemaMap);

    return { type: "SEARCH_QUERY", expression };
  } catch (error: any) {
    return {
      type: "SEARCH_QUERY_ERROR",
      expression: null,
      errors: [error],
    };
  }
};

export {
  type SearchQuery,
  type SearchQueryError,
  type Expression,
  type ValidationError,
  type FieldSchema,
  type RangeOperator,
  type RangeExpression,
  type WildcardPattern,
  type Value,
  stringify,
};
