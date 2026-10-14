-- Runs only on a fresh postgres volume (first boot). Gives each service its
-- own database; idempotent so re-running the script is harmless.
SELECT 'CREATE DATABASE identity'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'identity')\gexec

SELECT 'CREATE DATABASE orders'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'orders')\gexec
