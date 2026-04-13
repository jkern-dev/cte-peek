WITH
    orders AS (
        SELECT order_id, customer_id, total
        FROM raw_orders
        WHERE status = 'completed'
    ),
    customers AS (
        SELECT customer_id, name
        FROM raw_customers
    ),
    enriched AS (
        SELECT
            o.order_id,
            c.name AS customer_name,
            o.total
        FROM orders o
        JOIN customers c ON o.customer_id = c.customer_id
    )
SELECT * FROM enriched
