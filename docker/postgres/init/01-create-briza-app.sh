#!/bin/bash
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE briza_app'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'briza_app')\gexec
    GRANT ALL PRIVILEGES ON DATABASE briza_app TO evolution;
EOSQL
