# Changelog

## 0.2.0 — dbt model refs

- Peek dbt `{{ ref('model_name') }}` references the same way as CTE aliases
- New `sqlCtePeek.triggerMode` setting: `cte`, `dbt`, or `both` (default `both`)
- New `sqlCtePeek.hoverPreviewLines` setting controls dbt hover snippet length
- Hover for dbt refs renders the first N lines of the model file plus an "open file" link
- Side-panel and preview modes open the resolved dbt model file beside the source
- Drill-down works across CTEs and dbt model files in the same chain
- Activated on `jinja-sql` language id in addition to `sql` and `snowflake-sql`

## 0.1.0 — Initial Release

- CTE definition peek via side panel, read-only preview, or hover tooltip
- Go to Definition (Ctrl+Click / Cmd+Click) for CTE aliases
- Nested CTE drill-down with configurable max depth
- Support for SQL and Snowflake SQL languages
- Parser handles comments, string literals, nested parentheses, and quoted identifiers
- Cached parsing with automatic invalidation on document changes
