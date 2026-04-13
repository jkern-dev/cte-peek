{{ config(materialized='table') }}

WITH source AS (
    SELECT *
    FROM {{ ref('stg_appointments') }}
    WHERE appointment_status = 'Details Confirmed'
),
filtered AS (
    SELECT
        appointment_id,
        provider_id,
        patient_id,
        {{ dbt_utils.star(from=ref('stg_appointments'), except=['_fivetran_synced']) }}
    FROM source
    WHERE billing_type IN ('INSURANCE', 'EAP')
)
SELECT * FROM filtered
