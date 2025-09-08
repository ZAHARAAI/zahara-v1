-- Zahara.ai Agent Clinic Database Initialization
-- This script sets up the initial database configuration

-- Create database if it doesn't exist
SELECT 'CREATE DATABASE zahara_clinic'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'zahara_clinic')\gexec

-- Connect to the zahara_clinic database
\c zahara_clinic;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create application user if it doesn't exist
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE  rolname = 'zahara_user') THEN
      
      CREATE ROLE zahara_user LOGIN PASSWORD 'zahara_password';
   END IF;
END
$do$;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE zahara_clinic TO zahara_user;
GRANT ALL ON SCHEMA public TO zahara_user;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO zahara_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO zahara_user;

-- Create performance monitoring view
CREATE OR REPLACE VIEW trace_performance_summary AS
SELECT 
    DATE_TRUNC('hour', timestamp) as hour,
    status,
    COUNT(*) as trace_count,
    AVG(total_duration) as avg_duration,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_duration) as p50_duration,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_duration) as p95_duration,
    SUM(total_tokens) as total_tokens,
    SUM(total_cost) as total_cost
FROM traces 
GROUP BY DATE_TRUNC('hour', timestamp), status
ORDER BY hour DESC;

-- Create indexes for common queries (will be created by Alembic migrations)
-- This is just for reference

COMMENT ON DATABASE zahara_clinic IS 'Zahara.ai Agent Clinic - LLM Trace Observability Database';

-- Log initialization
INSERT INTO pg_stat_statements_reset();

-- Display success message
\echo 'Database zahara_clinic initialized successfully!'
\echo 'Extensions enabled: uuid-ossp, pg_stat_statements'
\echo 'User created: zahara_user'
\echo 'Performance monitoring view: trace_performance_summary'
