import { useState } from "react";
import {
  FieldSchema,
  Expression,
  SearchQuery,
} from "../../search-input-query-parser/src/parser";
import {
  searchQueryToSql,
  SearchType,
} from "../../search-input-query-parser/src/search-query-to-sql";
import type { ValidationError } from "../../search-input-query-parser/src/validator";
import { ExpressionDescription } from "./ExpressionDescription";
import { SearchInputQuery } from "./SearchInputQuery";
import { type Product, searchProducts } from "./db-service";

// Define available fields and searchable columns
const schemas: FieldSchema[] = [
  { name: "title", type: "string" },
  { name: "description", type: "string" },
  { name: "status", type: "string" },
  { name: "category", type: "string" },
  { name: "price", type: "number" },
  { name: "date", type: "date" },
];

const allowedFields = schemas.map((schema) => schema.name);
const searchableColumns = ["title", "description"];

const searchTypes: Array<{
  value: SearchType;
  label: string;
  description: string;
}> = [
  {
    value: "ilike",
    label: "ILIKE",
    description: "Case-insensitive pattern matching using case insensitive LIKE",
  },
  {
    value: "tsvector",
    label: "Full Text Search",
    description: "PostgreSQL native full text search using tsvector/tsquery",
  },
  {
    value: "paradedb",
    label: "ParadeDB",
    description: "Full text search using ParadeDB's @@@ operator",
  },
];

const SearchComponent = () => {
  const [expression, setExpression] = useState<Expression | null>(null);
  const [parsedResult, setParsedResult] = useState<string>("");
  const [sqlQuery, setSqlQuery] = useState<{
    text: string;
    values: string[];
  } | null>(null);
  const [sqlSearchType, setSqlSearchType] = useState<SearchType>("ilike");
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [showSql, setShowSql] = useState(true);
  const [searchResults, setSearchResults] = useState<Product[]>([]);

  const handleSearchResult = async (result: {
    expression: Expression | null;
    parsedResult: string;
    errors: ValidationError[];
  }): Promise<void> => {
    setExpression(result.expression);
    setParsedResult(result.parsedResult);
    setErrors(result.errors);

    if (result.errors.length === 0 && result.expression) {
      try {
        // Generate SQL query
        const parseResult: SearchQuery = {
          type: "SEARCH_QUERY",
          expression: result.expression,
        };

        const sql = searchQueryToSql(parseResult, searchableColumns, schemas, {
          searchType: sqlSearchType,
        });

        setSqlQuery(sql);

        // Execute the search query against the database
        const results = await searchProducts(sql.text, sql.values);
        setSearchResults(results);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "An unknown error occurred";
        setErrors([{ message: errorMessage, position: 0, length: 0 }]);
        setSqlQuery(null);
        setSearchResults([]);
      }
    } else {
      setSqlQuery(null);
      setSearchResults([]);
    }
  };

  return (
    <div className="search-container">
      <div className="available-fields">
        Available fields:{" "}
        {allowedFields.map((field) => (
          <span key={field} className="field-badge">
            {field}
          </span>
        ))}
      </div>

      <SearchInputQuery schemas={schemas} onSearchResult={handleSearchResult} />

      {/* Display search results */}
      {searchResults.length > 0 && (
        <div className="search-results mt-4">
          <h3>Search Results:</h3>
          <div className="results-grid">
            {searchResults.map((product) => (
              <div key={product.id} className="result-card">
                <h4>{product.title}</h4>
                <p>{product.description}</p>
                <div className="result-details">
                  <span className="price">${product.price.toFixed(2)}</span>
                  <span
                    className={`status status-${product.status.replace(
                      /\s+/g,
                      "-"
                    )}`}
                  >
                    {product.status}
                  </span>
                </div>
                <div className="result-meta">
                  <span className="category">{product.category}</span>
                  <span className="date">
                    {new Date(product.date).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="error-container">
          {errors.map((error, index) => (
            <div key={index} className="error-message">
              {error.message}
            </div>
          ))}
        </div>
      )}

      {parsedResult && !errors.length && (
        <div className="result-container">
          <ExpressionDescription expression={expression} />
          <div className="parsed-query">
            <h3>Parsed Query:</h3>
            <code>{parsedResult}</code>
          </div>

          <div className="sql-toggle">
            <label className="toggle">
              <span className="toggle-label">Show SQL</span>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={showSql}
                  onChange={(e) => setShowSql(e.target.checked)}
                />
                <span className="slider"></span>
              </div>
            </label>
          </div>

          {showSql && sqlQuery && (
            <>
              <div className="search-type-selector">
                <h3>Search Type:</h3>
                <div className="radio-group">
                  {searchTypes.map((type) => (
                    <label key={type.value} className="radio-label">
                      <input
                        type="radio"
                        name="searchType"
                        value={type.value}
                        checked={sqlSearchType === type.value}
                        onChange={(e) => {
                          const newSearchType = e.target.value as SearchType;
                          setSqlSearchType(newSearchType);
                          // Regenerate SQL if we have a valid expression
                          if (expression) {
                            const parseResult: SearchQuery = {
                              type: "SEARCH_QUERY",
                              expression,
                            };
                            const sql = searchQueryToSql(
                              parseResult,
                              searchableColumns,
                              schemas,
                              {
                                searchType: newSearchType,
                              }
                            );
                            setSqlQuery(sql);
                          }
                        }}
                      />
                      <div>
                        <strong>{type.label}</strong>
                        <p className="search-type-description">
                          {type.description}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="sql-query">
                <h3>SQL WHERE Clause:</h3>
                <code>{sqlQuery.text}</code>
                {sqlQuery.values.length > 0 && (
                  <div className="sql-params">
                    <h4>Parameters:</h4>
                    <code>
                      [
                      {sqlQuery.values.map((v) => JSON.stringify(v)).join(", ")}
                      ]
                    </code>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchComponent;
