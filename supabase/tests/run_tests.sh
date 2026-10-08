#!/usr/bin/env bash
# Rebuilds a throwaway Postgres database from the migrations and runs the workflow tests.
# Usage: ./supabase/tests/run_tests.sh   (needs a local Postgres 15+ and a superuser connection)
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${HEMS_TEST_DB:-hems_test}
PSQL=${PSQL:-"psql -q -v ON_ERROR_STOP=1"}
$PSQL -d postgres -c "drop database if exists $DB" -c "create database $DB"
$PSQL -d "$DB" -f tests/_stub_supabase.sql
for f in migrations/*.sql; do echo "-> $f"; $PSQL -d "$DB" -f "$f"; done
$PSQL -d "$DB" -f seed.sql
$PSQL -d "$DB" -f tests/001_core_workflow.sql
