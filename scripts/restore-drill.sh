#!/usr/bin/env bash
#
# Disaster-recovery drill — acceptance criterion 17.
#
#   "A restored backup passes integrity and evidence-reconciliation checks."
#
# Takes a snapshot of the live database, dumps it, restores the dump into a
# fresh database, snapshots that, and reconciles the two. Exits non-zero if
# any acknowledged learning evidence is missing or the corpus has drifted.
#
# A drill that is never run is not a recovery plan, so this is a script an
# operator can run on a schedule and keep the output of.
set -euo pipefail

SOURCE_DB="${ATHAR_SOURCE_DB:-athar_journey_test}"
RESTORE_DB="${ATHAR_RESTORE_DB:-athar_restore_drill}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${ATHAR_DRILL_DIR:-${TMPDIR:-/tmp}/athar-restore-drill}"
mkdir -p "$WORK"
# pg_dump runs as the database superuser, which is usually not the user
# invoking this script, so the working directory has to be writable by both.
chmod 777 "$WORK" 2>/dev/null || true

psql_as() {
    if [ "$(id -u)" -eq 0 ] && id postgres >/dev/null 2>&1; then
        su postgres -c "$*"
    else
        eval "$*"
    fi
}

snapshot() {
    psql_as "psql -tAX -d $1 -f $ROOT/scripts/snapshot.sql"
}

echo "==> snapshotting source ($SOURCE_DB)"
snapshot "$SOURCE_DB" > "$WORK/before.json"

echo "==> dumping"
psql_as "pg_dump --format=custom --file=$WORK/dump.pgc $SOURCE_DB"
DUMP_BYTES=$(stat -c %s "$WORK/dump.pgc")
echo "    $DUMP_BYTES bytes"

echo "==> restoring into a fresh database ($RESTORE_DB)"
psql_as "dropdb --if-exists $RESTORE_DB" >/dev/null 2>&1 || true
psql_as "createdb $RESTORE_DB"
# --exit-on-error: a restore that half-worked is a restore that failed.
psql_as "pg_restore --exit-on-error --dbname=$RESTORE_DB $WORK/dump.pgc"

echo "==> snapshotting restore"
snapshot "$RESTORE_DB" > "$WORK/after.json"

echo "==> reconciling"
node --experimental-strip-types "$ROOT/scripts/reconcile.mjs" "$WORK/before.json" "$WORK/after.json"
