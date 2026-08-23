-- An attempt is evidence about a memory target, not only about an
-- assignment. Recording the target directly keeps "what does this learner
-- recall about this join?" a single-table query, and matches the domain
-- record the engine already carries.

BEGIN;

ALTER TABLE attempt
    ADD COLUMN memory_target_id uuid REFERENCES memory_target(id);

-- Backfill from the owning assignment, then require it going forward.
UPDATE attempt a
   SET memory_target_id = s.memory_target_id
  FROM assignment s
 WHERE s.id = a.assignment_id AND a.memory_target_id IS NULL;

ALTER TABLE attempt ALTER COLUMN memory_target_id SET NOT NULL;

CREATE INDEX attempt_target_idx ON attempt(memory_target_id, occurred_at);

COMMIT;
