-- This is a top-level comment
WITH
    -- CTE for active users
    active AS (
        SELECT id, name
        FROM users
        -- WHERE active = true (old filter)
        WHERE status = 'active'
    ),
    /* Another CTE
       with a block comment (containing parens) */
    recent AS (
        SELECT id /* user id (pk) */, created_at
        FROM events
        WHERE created_at > '2024-01-01'
    )
SELECT *
FROM active a
JOIN recent r ON a.id = r.id
