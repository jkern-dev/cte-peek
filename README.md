<p align="center">
  <img src="cte-peek.png" width="128" alt="SQL CTE Peek logo" />
</p>

# SQL CTE Peek

Navigate complex SQL with ease. Click on a CTE alias — or a dbt `{{ ref('...') }}` — to instantly see its definition. No more scrolling through hundreds of lines, and no more jumping between dbt model files by hand.

## Features

### Two Reference Types

**CTE aliases** — Click on a CTE name inside a `WITH` clause to peek its body.

**dbt model refs** — Click on the model name in `{{ ref('my_model') }}` to peek the referenced model file. The extension searches your workspace for `my_model.sql` (excluding `target/`) and opens it beside your current file.

Toggle which references trigger a preview via `sqlCtePeek.triggerMode` (`cte`, `dbt`, or `both` — default `both`).

### Three Display Modes

**Side Panel** (default) — Opens the definition in an editable split editor beside your current file. Edit the CTE or dbt model directly without leaving context.

**Preview** — Opens a read-only preview in a side panel. For CTEs the body is rendered into a virtual document; for dbt refs the model file itself is opened beside.

**Hover** — Shows the definition in an inline popup when you hover over a reference. For dbt refs, hover renders the first N lines of the model file (configurable via `sqlCtePeek.hoverPreviewLines`) plus an "open file" link.

### Nested Drill-Down

References chain. In side-panel and preview modes, you can click through the chain across CTEs *and* dbt models:

```
Source → click "enriched" → Panel 1 → click {{ ref('orders') }} → Panel 2 (orders.sql) → click "raw_orders" CTE inside orders.sql → Panel 3
```

Each click opens another panel beside the last. Click away from a reference to close the panels. The maximum nesting depth is configurable.

### Go to Definition

`Ctrl+Click` (or `Cmd+Click` on Mac) on any CTE alias or dbt `ref()` model name to jump to its definition. Works in all display modes.

### Auto-Close

Panels close automatically when you click on a non-reference word in the source file, keeping your workspace clean.

## Supported Languages

- `sql` — Standard SQL files
- `snowflake-sql` — Snowflake SQL (when the Snowflake extension is installed)
- `jinja-sql` — dbt-flavored SQL (when a dbt extension is installed)

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sqlCtePeek.displayMode` | `string` | `"side-panel"` | How to display previews: `"hover"`, `"preview"`, or `"side-panel"` |
| `sqlCtePeek.triggerMode` | `string` | `"both"` | Which references trigger a preview: `"cte"`, `"dbt"`, or `"both"` |
| `sqlCtePeek.maxNestingDepth` | `integer` | `3` | Maximum number of nested preview panels (1–10) |
| `sqlCtePeek.hoverPreviewLines` | `integer` | `50` | Maximum lines of a dbt model file shown in hover previews (5–500) |

### Example `settings.json`

```json
{
  "sqlCtePeek.displayMode": "preview",
  "sqlCtePeek.triggerMode": "both",
  "sqlCtePeek.maxNestingDepth": 5
}
```

## How It Works

The extension uses a zero-dependency CTE parser that scans SQL files character-by-character to extract CTE definitions from `WITH` clauses. It handles:

- Multiple CTEs (`WITH a AS (...), b AS (...), c AS (...)`)
- Nested subqueries with balanced parentheses
- String literals (including `''` escaped quotes)
- Single-line (`--`) and block (`/* */`) comments
- `WITH RECURSIVE` syntax
- Double-quoted identifiers
- dbt Jinja templates (`{{ ref('model') }}`, `{{ config(...) }}`)

For dbt refs, a separate parser detects `{{ ref('name') }}` (single- and double-quoted, two-arg `ref('pkg', 'name')`, version kwarg, whitespace-trim `{{- -}}`) and resolves the model name via a workspace file search (`**/<name>.sql`, excluding `target/`). Lookup results are cached and invalidated by a file watcher on `.sql` changes.

Parse results are cached per document and invalidated on edit, so hover and click responses are instant.

## Development

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
git clone https://github.com/joshkern/sql-cte-peek.git
cd sql-cte-peek
npm install
```

### Build

```bash
npm run compile    # One-time build
npm run watch      # Watch mode for development
```

### Test

```bash
npm test
```

### Debug

Open the project in VS Code and press `F5` to launch an Extension Development Host with the extension loaded. Open any `.sql` file to test.

### Package

```bash
npm run package
```

Produces `sql-cte-peek-<version>.vsix` which can be installed locally:

```bash
code --install-extension sql-cte-peek-0.1.0.vsix
```

## Known Limitations

- Parses only the first top-level `WITH` clause per file. Multi-statement SQL files with separate `WITH` clauses will only recognize CTEs from the first one.
- CTE name matching is purely text-based — if a table or column happens to share a name with a CTE, the extension will treat it as a reference.
- dbt model lookup is by basename. If two `.sql` files in the workspace share the same name (which dbt itself disallows), the first match returned by VS Code's file search wins.
- `{{ source('...', '...') }}` is not currently resolved.

## Installation

Search for **SQL CTE Peek** in the VS Code Extensions view, or install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=joshkern.sql-cte-peek).

## License

[MIT](LICENSE)
