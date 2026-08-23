#!/usr/bin/env bash
#
# Apply the migration to a scratch PostgreSQL database and run the
# database-level invariant tests against it.
#
# These assertions cannot be made in TypeScript: they prove that the rules
# hold at the storage layer, where a future migration script or a direct
# psql session would otherwise be able to bypass them.
set -euo pipefail

DB="${ATHAR_TEST_DB:-athar_test}"
PSQL_USER="${ATHAR_PSQL_USER:-postgres}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

run_psql() {
    if [ "$(id -u)" -eq 0 ] && id "$PSQL_USER" >/dev/null 2>&1; then
        su "$PSQL_USER" -c "$*"
    else
        eval "$*"
    fi
}

echo "==> recreating $DB"
run_psql "dropdb --if-exists $DB" >/dev/null 2>&1 || true
run_psql "createdb $DB"

echo "==> applying migrations"
for migration in "$ROOT"/db/migrations/*.sql; do
    echo "    $(basename "$migration")"
    run_psql "psql -v ON_ERROR_STOP=1 -q -d $DB -f $migration"
done

echo "==> running invariant tests"
output="$(run_psql "psql -v ON_ERROR_STOP=1 -q -d $DB -f $ROOT/db/tests/invariants.sql" 2>&1)"
echo "$output" | grep -oE '(PASS|FAIL)  [^(]*' | sed 's/^/    /'

if echo "$output" | grep -q "FAIL"; then
    echo "!!  database invariant tests FAILED"
    exit 1
fi

passed="$(echo "$output" | grep -c 'PASS' || true)"
echo "==> $passed database invariants hold"
