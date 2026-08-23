-- Database-level invariant tests.
--
-- Each block asserts that a rule fires at the database layer, not merely
-- in application code. A rule that only lives in TypeScript is a rule that
-- a future migration script can quietly bypass.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

-- Helper: run a statement and require it to fail.
CREATE OR REPLACE FUNCTION must_fail(stmt text, label text) RETURNS void AS $$
BEGIN
    BEGIN
        EXECUTE stmt;
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'PASS  %  (% )', label, SQLERRM;
        RETURN;
    END;
    RAISE EXCEPTION 'FAIL  %  — statement unexpectedly succeeded', label;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION must_succeed(stmt text, label text) RETURNS void AS $$
BEGIN
    EXECUTE stmt;
    RAISE NOTICE 'PASS  %', label;
END;
$$ LANGUAGE plpgsql;

-- ===========================================================================
-- Seed: two organizations, so tenant isolation has something to isolate.
-- ===========================================================================

INSERT INTO organization (id, name) VALUES
    ('00000000-0000-0000-0000-0000000000a1', 'Org A'),
    ('00000000-0000-0000-0000-0000000000b1', 'Org B');

INSERT INTO academy (id, organization_id, name, territory) VALUES
    ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Academy A', 'GB'),
    ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'Academy B', 'GB');

INSERT INTO classroom (id, organization_id, academy_id, name) VALUES
    ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Hifz 2'),
    ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', 'Hifz 1');

INSERT INTO app_user (id, organization_id, display_name) VALUES
    ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a1', 'Teacher A'),
    ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a1', 'Learner A'),
    ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-0000000000a1', 'Guardian A'),
    ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b1', 'Learner B');

-- Corpus: kept in 'draft' so the fixture can be built, then published to
-- prove the immutability trigger fires.
INSERT INTO corpus_version
    (id, edition, lifecycle, sha256, surah_count, ayah_count, word_count, page_count, expected_lines_per_page)
VALUES
    ('00000000-0000-0000-0000-0000000000c1', 'test-edition', 'draft', 'deadbeef', 1, 1, 2, 1, 15);

INSERT INTO surah (corpus_version_id, number, ayah_count)
VALUES ('00000000-0000-0000-0000-0000000000c1', 1, 1);

INSERT INTO ayah (id, corpus_version_id, surah_number, number_in_surah)
VALUES ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', 1, 1);

INSERT INTO word (id, corpus_version_id, ayah_id, position, text) VALUES
    ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', 1, 'SYN-1-1-1'),
    ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', 2, 'SYN-1-1-2');

INSERT INTO mushaf_page (corpus_version_id, number, line_count)
VALUES ('00000000-0000-0000-0000-0000000000c1', 1, 15);

INSERT INTO layout_token (id, corpus_version_id, page_number, line_number, position_in_line, word_id)
VALUES ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000c1', 1, 1, 1, '00000000-0000-0000-0000-0000000000c3');

INSERT INTO passage (id, organization_id, corpus_version_id, label, start_ayah_id, end_ayah_id)
VALUES ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1',
        'Test 1:1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2');

INSERT INTO memory_target (id, organization_id, learner_id, kind, passage_id)
VALUES ('00000000-0000-0000-0000-0000000000a8', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000a5', 'segment', '00000000-0000-0000-0000-0000000000a7');

INSERT INTO assignment
    (id, organization_id, academy_id, classroom_id, learner_id, passage_id, memory_target_id,
     owner_user_id, owner_role, current_policy_version, estimated_active_minutes, due_at)
VALUES
    ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000a1',
     '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a3',
     '00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a7',
     '00000000-0000-0000-0000-0000000000a8', '00000000-0000-0000-0000-0000000000a4',
     'teacher', 'v1', 10, now() + interval '1 day'),
    ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000a1',
     '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a3',
     '00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a7',
     '00000000-0000-0000-0000-0000000000a8', '00000000-0000-0000-0000-0000000000a4',
     'teacher', 'v1', 10, now() + interval '1 day');

INSERT INTO assignment_policy_version
    (assignment_id, policy_version, required_listens, required_independent_recalls,
     required_non_serial_recalls, created_by_user_id)
VALUES
    ('00000000-0000-0000-0000-0000000000a9', 'v1', 3, 2, 1, '00000000-0000-0000-0000-0000000000a4'),
    ('00000000-0000-0000-0000-0000000000aa', 'v1', 3, 2, 1, '00000000-0000-0000-0000-0000000000a4');

INSERT INTO segment (id, assignment_id, ordinal) VALUES
    ('00000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-0000000000a9', 1),
    ('00000000-0000-0000-0000-0000000000ac', '00000000-0000-0000-0000-0000000000aa', 1);

INSERT INTO attempt
    (id, organization_id, assignment_id, segment_id, memory_target_id, learner_id,
     occurred_at, scaffold_level, start_context, correct, hesitant, evidence_class,
     policy_version, idempotency_key)
VALUES
    ('00000000-0000-0000-0000-0000000000ad', '00000000-0000-0000-0000-0000000000a1',
     '00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000ab',
     '00000000-0000-0000-0000-0000000000a8',
     '00000000-0000-0000-0000-0000000000a5', now(), 'no_answer_choices', 'random_start',
     true, false, 'independent_recall', 'v1', 'idem-1');

-- ===========================================================================
-- Invariant 1 — a segment is writable only through its own assignment
-- ===========================================================================
SELECT must_fail($$
    INSERT INTO attempt
        (organization_id, assignment_id, segment_id, memory_target_id, learner_id,
         occurred_at, scaffold_level, start_context, correct, hesitant, evidence_class,
         policy_version, idempotency_key)
    VALUES ('00000000-0000-0000-0000-0000000000a1',
            '00000000-0000-0000-0000-0000000000a9',
            '00000000-0000-0000-0000-0000000000ac',  -- segment of a DIFFERENT assignment
            '00000000-0000-0000-0000-0000000000a8',
            '00000000-0000-0000-0000-0000000000a5', now(), 'no_answer_choices', 'serial_start',
            true, false, 'independent_recall', 'v1', 'idem-cross-segment')
$$, 'segment is writable only through its own assignment');

-- ===========================================================================
-- Invariant 2 — learning evidence is append-only
-- ===========================================================================
SELECT must_fail(
    $$UPDATE attempt SET correct = false WHERE idempotency_key = 'idem-1'$$,
    'attempt rows cannot be updated');
SELECT must_fail(
    $$DELETE FROM attempt WHERE idempotency_key = 'idem-1'$$,
    'attempt rows cannot be deleted');

-- ===========================================================================
-- Invariant 3 — a learner can never be their own verifier
-- ===========================================================================
INSERT INTO oral_recitation_request
    (id, organization_id, assignment_id, learner_id, policy_version,
     independent_recalls, non_serial_recalls, listens_completed)
VALUES ('00000000-0000-0000-0000-0000000000ae', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000a5', 'v1', 2, 1, 3);

SELECT must_fail($$
    INSERT INTO oral_verification
        (organization_id, request_id, assignment_id, memory_target_id, learner_id,
         policy_version, corpus_version_id, verifier_user_id, verifier_role, decision)
    VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000ae',
            '00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000a8',
            '00000000-0000-0000-0000-0000000000a5', 'v1', '00000000-0000-0000-0000-0000000000c1',
            '00000000-0000-0000-0000-0000000000a5',   -- learner verifying themselves
            'learner', 'verified_cleanly')
$$, 'a learner cannot verify their own recitation');

SELECT must_succeed($$
    INSERT INTO oral_verification
        (id, organization_id, request_id, assignment_id, memory_target_id, learner_id,
         policy_version, corpus_version_id, verifier_user_id, verifier_role, decision)
    VALUES ('00000000-0000-0000-0000-0000000000af', '00000000-0000-0000-0000-0000000000a1',
            '00000000-0000-0000-0000-0000000000ae',
            '00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000a8',
            '00000000-0000-0000-0000-0000000000a5', 'v1', '00000000-0000-0000-0000-0000000000c1',
            '00000000-0000-0000-0000-0000000000a4', 'teacher', 'verified_cleanly')
$$, 'an authorized teacher can record a verification');

SELECT must_fail(
    $$UPDATE oral_verification SET decision = 'practice_again'
      WHERE id = '00000000-0000-0000-0000-0000000000af'$$,
    'verification rows cannot be updated');

-- ===========================================================================
-- Invariant 4 — a pending guardian claim grants nothing
-- ===========================================================================
SELECT must_fail($$
    INSERT INTO guardian_relationship
        (organization_id, guardian_user_id, child_user_id, status, can_view_child)
    VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a6',
            '00000000-0000-0000-0000-0000000000a5', 'pending', true)
$$, 'a pending claim cannot carry can_view_child');

-- ===========================================================================
-- Invariant 5 — corpus tokens are immutable once published
-- ===========================================================================
UPDATE corpus_version
   SET lifecycle = 'published', published_at = now()
 WHERE id = '00000000-0000-0000-0000-0000000000c1';

SELECT must_fail(
    $$UPDATE word SET text = 'TAMPERED' WHERE id = '00000000-0000-0000-0000-0000000000c3'$$,
    'words are immutable in a published corpus version');
SELECT must_fail(
    $$DELETE FROM layout_token WHERE id = '00000000-0000-0000-0000-0000000000c5'$$,
    'layout tokens are immutable in a published corpus version');

-- ===========================================================================
-- Invariant 6 — an AI-proposed knowledge edge requires human review
-- ===========================================================================
INSERT INTO knowledge_node (id, kind, label) VALUES
    ('00000000-0000-0000-0000-0000000000d1', 'skill', 'madd'),
    ('00000000-0000-0000-0000-0000000000d2', 'skill', 'madd arid');

SELECT must_fail($$
    INSERT INTO knowledge_edge (from_node, to_node, relation, provenance)
    VALUES ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2',
            'prerequisite', 'ai_proposed')
$$, 'an AI-proposed edge cannot be created without review');

-- ===========================================================================
-- Invariant 7 — there is no "estimated" alignment method
-- ===========================================================================
SELECT must_fail(
    $$SELECT 'estimated'::alignment_method$$,
    'alignment_method has no estimated value');

-- ===========================================================================
-- Invariant 8 — a policy cannot require more non-serial than total recalls
-- ===========================================================================
SELECT must_fail($$
    INSERT INTO assignment_policy_version
        (assignment_id, policy_version, required_listens, required_independent_recalls,
         required_non_serial_recalls, created_by_user_id)
    VALUES ('00000000-0000-0000-0000-0000000000a9', 'v-bad', 3, 2, 5,
            '00000000-0000-0000-0000-0000000000a4')
$$, 'non-serial recalls cannot exceed total required recalls');

-- ===========================================================================
-- Invariant 10 — a released passage must be attributable and unblocked
-- ===========================================================================
SELECT must_fail($$
    INSERT INTO passage (organization_id, corpus_version_id, label,
                         start_ayah_id, end_ayah_id, released)
    VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1',
            'Unattributed', '00000000-0000-0000-0000-0000000000c2',
            '00000000-0000-0000-0000-0000000000c2', true)
$$, 'a released passage must record who released it and when');

SELECT must_fail($$
    INSERT INTO passage (organization_id, corpus_version_id, label,
                         start_ayah_id, end_ayah_id, released, release_blocks,
                         released_at, released_by_user_id)
    VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1',
            'Contradictory', '00000000-0000-0000-0000-0000000000c2',
            '00000000-0000-0000-0000-0000000000c2', true, '{approval_missing}',
            now(), '00000000-0000-0000-0000-0000000000a4')
$$, 'a released passage cannot also carry blocking reasons');

-- ===========================================================================
-- Invariant 11 — a passage cannot be released against an unpublished corpus
-- ===========================================================================
INSERT INTO corpus_version
    (id, edition, lifecycle, sha256, surah_count, ayah_count, word_count,
     page_count, expected_lines_per_page)
VALUES ('00000000-0000-0000-0000-0000000000c9', 'draft-edition', 'draft',
        'cafebabe', 0, 0, 0, 0, 15);

SELECT must_fail($$
    INSERT INTO passage (organization_id, corpus_version_id, label,
                         start_ayah_id, end_ayah_id, released,
                         released_at, released_by_user_id)
    VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c9',
            'Draft corpus', '00000000-0000-0000-0000-0000000000c2',
            '00000000-0000-0000-0000-0000000000c2', true,
            now(), '00000000-0000-0000-0000-0000000000a4')
$$, 'a passage cannot be released against an unpublished corpus version');

-- ===========================================================================
-- Invariant 9 — row-level security isolates tenants
-- ===========================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athar_app') THEN
        CREATE ROLE athar_app NOLOGIN;
    END IF;
END $$;
GRANT USAGE ON SCHEMA public TO athar_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO athar_app;

INSERT INTO memory_target (id, organization_id, learner_id, kind)
VALUES ('00000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000b4', 'segment');

SET ROLE athar_app;
SET athar.org_id = '00000000-0000-0000-0000-0000000000a1';

DO $$
DECLARE n integer;
BEGIN
    SELECT count(*) INTO n FROM memory_target;
    IF n <> 1 THEN
        RAISE EXCEPTION 'FAIL  RLS: expected 1 own-tenant row, saw %', n;
    END IF;
    RAISE NOTICE 'PASS  RLS hides other tenants'' rows';

    SELECT count(*) INTO n FROM memory_target
     WHERE id = '00000000-0000-0000-0000-0000000000b8';
    IF n <> 0 THEN
        RAISE EXCEPTION 'FAIL  RLS: cross-tenant row was visible by direct id';
    END IF;
    RAISE NOTICE 'PASS  RLS: a cross-tenant id returns nothing, not a permission error';
END $$;

SELECT must_fail($$
    INSERT INTO memory_target (organization_id, learner_id, kind)
    VALUES ('00000000-0000-0000-0000-0000000000b1',
            '00000000-0000-0000-0000-0000000000b4', 'segment')
$$, 'RLS blocks writing into another tenant');

RESET ROLE;

DROP FUNCTION must_fail(text, text);
DROP FUNCTION must_succeed(text, text);
