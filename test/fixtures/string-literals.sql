WITH escaped AS (
    SELECT id, name
    FROM users
    WHERE name = 'it''s a (test)'
    AND description LIKE '%(foo)%'
)
SELECT * FROM escaped
