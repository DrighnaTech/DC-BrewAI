-- BrewAI Local Database Setup
-- Run: psql -U postgres -h localhost -p 5432 -f setup-local-databases.sql

-- Create user if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'brewai') THEN
    CREATE ROLE brewai WITH LOGIN PASSWORD 'myStrongPass123';
  END IF;
END
$$;

-- Create database if not exists
SELECT 'CREATE DATABASE brewai OWNER brewai'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'brewai')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE brewai TO brewai;

\echo 'BrewAI database ready.'
