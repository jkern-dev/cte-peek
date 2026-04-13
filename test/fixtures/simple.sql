WITH active_users AS (
    SELECT id, name, email
    FROM users
    WHERE active = true
)
SELECT * FROM active_users
