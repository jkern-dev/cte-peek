WITH filtered AS (
    SELECT *
    FROM (
        SELECT id, name, ROW_NUMBER() OVER (PARTITION BY group_id ORDER BY created_at DESC) AS rn
        FROM users
        WHERE id IN (SELECT user_id FROM active_sessions)
    ) sub
    WHERE sub.rn = 1
)
SELECT * FROM filtered
