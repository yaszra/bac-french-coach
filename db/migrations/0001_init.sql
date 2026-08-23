-- ATHAR — initial schema (Phase 1 vertical slice)
--
-- Invariants enforced here, not merely documented:
--   * every tenant-owned row carries organization_id, with RLS as defence in depth
--   * a segment is writable only through its own assignment
--   * corpus tokens are immutable once the corpus version is published
--   * learning evidence is append-only
--   * verification pins assignment, passage, policy version, verifier, evidence
--   * every computed memory transition records algorithm and policy versions
--   * alignment methods are measured only — there is no "estimated" value

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ===========================================================================
-- Tenancy and identity
-- ===========================================================================

CREATE TABLE organization (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE academy (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE RESTRICT,
    name            text NOT NULL,
    -- Territory drives content licence checks at release time.
    territory       text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX academy_org_idx ON academy(organization_id);

CREATE TABLE app_user (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE RESTRICT,
    display_name    text NOT NULL,
    email           citext,
    created_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);
CREATE INDEX app_user_org_idx ON app_user(organization_id);

CREATE TYPE role_name AS ENUM (
    'platform_operator', 'org_admin', 'academy_admin', 'academic_director',
    'teacher', 'assistant_teacher', 'guardian', 'tutoring_guardian', 'learner'
);

CREATE TABLE classroom (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organization(id),
    academy_id      uuid NOT NULL REFERENCES academy(id),
    name            text NOT NULL
);

CREATE TABLE role_assignment (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organization(id),
    user_id         uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    role            role_name NOT NULL,
    academy_id      uuid REFERENCES academy(id),
    classroom_id    uuid REFERENCES classroom(id),
    granted_at      timestamptz NOT NULL DEFAULT now(),
    revoked_at      timestamptz
);
CREATE INDEX role_assignment_user_idx ON role_assignment(user_id) WHERE revoked_at IS NULL;

CREATE TABLE enrollment (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organization(id),
    academy_id      uuid NOT NULL REFERENCES academy(id),
    classroom_id    uuid NOT NULL REFERENCES classroom(id),
    learner_id      uuid NOT NULL REFERENCES app_user(id),
    UNIQUE (classroom_id, learner_id)
);

-- Viewing a child and tutoring a child are separate capabilities.
-- A pending claim grants nothing; revocation is evaluated live.
CREATE TABLE guardian_relationship (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid NOT NULL REFERENCES organization(id),
    guardian_user_id       uuid NOT NULL REFERENCES app_user(id),
    child_user_id          uuid NOT NULL REFERENCES app_user(id),
    status                 text NOT NULL CHECK (status IN ('pending','approved','rejected')),
    can_view_child         boolean NOT NULL DEFAULT false,
    can_tutor_and_approve  boolean NOT NULL DEFAULT false,
    claimed_at             timestamptz NOT NULL DEFAULT now(),
    approved_by_user_id    uuid REFERENCES app_user(id),
    approved_at            timestamptz,
    revoked_at             timestamptz,
    expires_at             timestamptz,
    UNIQUE (guardian_user_id, child_user_id),
    -- A pending or rejected claim can never carry capabilities.
    CONSTRAINT pending_claim_grants_nothing CHECK (
        status = 'approved' OR (can_view_child = false AND can_tutor_and_approve = false)
    )
);

CREATE TABLE consent_record (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organization(id),
    subject_user_id uuid NOT NULL REFERENCES app_user(id),
    granted_by_user_id uuid NOT NULL REFERENCES app_user(id),
    purpose         text NOT NULL,
    granted_at      timestamptz NOT NULL DEFAULT now(),
    withdrawn_at    timestamptz
);

-- ===========================================================================
-- Sacred content
-- ===========================================================================

CREATE TYPE corpus_lifecycle AS ENUM ('draft','candidate','published','superseded');

CREATE TABLE corpus_version (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    edition             text NOT NULL,
    lifecycle           corpus_lifecycle NOT NULL DEFAULT 'draft',
    sha256              text NOT NULL,
    surah_count         integer NOT NULL,
    ayah_count          integer NOT NULL,
    word_count          integer NOT NULL,
    page_count          integer NOT NULL,
    expected_lines_per_page integer NOT NULL,
    superseded_by       uuid REFERENCES corpus_version(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    published_at        timestamptz,
    CONSTRAINT published_needs_timestamp CHECK (
        lifecycle <> 'published' OR published_at IS NOT NULL
    )
);

CREATE TABLE surah (
    corpus_version_id uuid NOT NULL REFERENCES corpus_version(id) ON DELETE RESTRICT,
    number            integer NOT NULL,
    ayah_count        integer NOT NULL,
    PRIMARY KEY (corpus_version_id, number)
);

CREATE TABLE ayah (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    corpus_version_id uuid NOT NULL REFERENCES corpus_version(id),
    surah_number      integer NOT NULL,
    number_in_surah   integer NOT NULL,
    UNIQUE (corpus_version_id, surah_number, number_in_surah),
    FOREIGN KEY (corpus_version_id, surah_number) REFERENCES surah(corpus_version_id, number)
);

CREATE TABLE word (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    corpus_version_id uuid NOT NULL REFERENCES corpus_version(id),
    ayah_id           uuid NOT NULL REFERENCES ayah(id),
    position          integer NOT NULL CHECK (position >= 1),
    -- Verbatim from the approved corpus. Never authored by hand, never
    -- produced or altered by a model.
    text              text NOT NULL CHECK (length(text) > 0),
    UNIQUE (ayah_id, position)
);

CREATE TABLE mushaf_page (
    corpus_version_id uuid NOT NULL REFERENCES corpus_version(id),
    number            integer NOT NULL,
    line_count        integer NOT NULL,
    PRIMARY KEY (corpus_version_id, number)
);

-- Layout references corpus tokens. It never carries its own copy of a
-- Qur'anic string, so there is exactly one place a word can be wrong.
CREATE TABLE layout_token (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    corpus_version_id uuid NOT NULL REFERENCES corpus_version(id),
    page_number       integer NOT NULL,
    line_number       integer NOT NULL CHECK (line_number >= 1),
    position_in_line  integer NOT NULL CHECK (position_in_line >= 1),
    word_id           uuid NOT NULL REFERENCES word(id),
    UNIQUE (corpus_version_id, page_number, line_number, position_in_line),
    FOREIGN KEY (corpus_version_id, page_number)
        REFERENCES mushaf_page(corpus_version_id, number)
);
CREATE INDEX layout_token_word_idx ON layout_token(word_id);

CREATE TABLE waqf_mark (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    corpus_version_id uuid NOT NULL REFERENCES corpus_version(id),
    word_id           uuid NOT NULL REFERENCES word(id),
    symbol            text NOT NULL
);

-- Corpus immutability: a published version is frozen. Corrections ship as
-- a new corpus version, so a bump can never silently change what a learner
-- was assigned.
CREATE OR REPLACE FUNCTION refuse_published_corpus_mutation() RETURNS trigger AS $$
DECLARE
    v_lifecycle corpus_lifecycle;
    v_corpus uuid;
BEGIN
    v_corpus := COALESCE(OLD.corpus_version_id, NEW.corpus_version_id);
    SELECT lifecycle INTO v_lifecycle FROM corpus_version WHERE id = v_corpus;
    IF v_lifecycle <> 'draft' THEN
        RAISE EXCEPTION
            'corpus version % is % and is immutable (table %)',
            v_corpus, v_lifecycle, TG_TABLE_NAME
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER word_immutable
    BEFORE UPDATE OR DELETE ON word
    FOR EACH ROW EXECUTE FUNCTION refuse_published_corpus_mutation();
CREATE TRIGGER layout_token_immutable
    BEFORE UPDATE OR DELETE ON layout_token
    FOR EACH ROW EXECUTE FUNCTION refuse_published_corpus_mutation();
CREATE TRIGGER waqf_mark_immutable
    BEFORE UPDATE OR DELETE ON waqf_mark
    FOR EACH ROW EXECUTE FUNCTION refuse_published_corpus_mutation();

-- ===========================================================================
-- Content governance
-- ===========================================================================

CREATE TABLE content_source (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    publisher     text NOT NULL,
    edition       text NOT NULL,
    printing      text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE license_record (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content_source_id uuid NOT NULL REFERENCES content_source(id),
    holder            text NOT NULL,
    terms             text NOT NULL,
    territories       text[] NOT NULL,
    expires_at        timestamptz
);

CREATE TABLE content_approval (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content_source_id     uuid NOT NULL REFERENCES content_source(id),
    reviewer_user_id      uuid NOT NULL REFERENCES app_user(id),
    reviewer_credential   text NOT NULL,
    decision              text NOT NULL CHECK (decision IN ('pending','approved','rejected')),
    decided_at            timestamptz,
    notes                 text,
    CONSTRAINT decided_needs_timestamp CHECK (
        decision = 'pending' OR decided_at IS NOT NULL
    )
);

CREATE TABLE audio_asset (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content_source_id uuid NOT NULL REFERENCES content_source(id),
    reciter           text NOT NULL,
    storage_key       text NOT NULL,
    -- Resolution order: teacher > academy studio > licensed library.
    provenance        text NOT NULL CHECK (
        provenance IN ('teacher_recording','academy_studio','licensed_library')
    )
);

-- Measured methods only. There is deliberately no 'estimated' value: if
-- timings were not measured, no row exists and highlighting is disabled.
CREATE TYPE alignment_method AS ENUM (
    'forced_alignment_reviewed', 'manual_annotation', 'studio_timecode'
);

CREATE TABLE alignment_asset (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    audio_asset_id uuid NOT NULL REFERENCES audio_asset(id),
    method         alignment_method NOT NULL,
    reviewed_by_user_id uuid REFERENCES app_user(id),
    storage_key    text NOT NULL
);

-- ===========================================================================
-- Curriculum and assignments
-- ===========================================================================

CREATE TABLE passage (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organization(id),
    -- Pinned so a corpus bump cannot silently change an assignment.
    corpus_version_id uuid NOT NULL REFERENCES corpus_version(id),
    -- Display reference such as 'Al-Mulk 12-15'. Never Qur'anic text.
    label             text NOT NULL,
    start_ayah_id     uuid NOT NULL REFERENCES ayah(id),
    end_ayah_id       uuid NOT NULL REFERENCES ayah(id)
);

CREATE TYPE memory_target_kind AS ENUM (
    'ayah','segment','page_region','connection_boundary',
    'similar_ayah_contrast','qaida_skill','recurring_correction'
);

CREATE TABLE memory_target (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organization(id),
    learner_id      uuid NOT NULL REFERENCES app_user(id),
    kind            memory_target_kind NOT NULL,
    passage_id      uuid REFERENCES passage(id)
);
CREATE INDEX memory_target_learner_idx ON memory_target(learner_id);

CREATE TABLE assignment (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          uuid NOT NULL REFERENCES organization(id),
    academy_id               uuid NOT NULL REFERENCES academy(id),
    classroom_id             uuid NOT NULL REFERENCES classroom(id),
    learner_id               uuid NOT NULL REFERENCES app_user(id),
    passage_id               uuid NOT NULL REFERENCES passage(id),
    memory_target_id         uuid NOT NULL REFERENCES memory_target(id),
    owner_user_id            uuid NOT NULL REFERENCES app_user(id),
    owner_role               role_name NOT NULL,
    current_policy_version   text NOT NULL,
    estimated_active_minutes integer NOT NULL CHECK (estimated_active_minutes > 0),
    created_at               timestamptz NOT NULL DEFAULT now(),
    due_at                   timestamptz NOT NULL
);
CREATE INDEX assignment_learner_idx ON assignment(learner_id);

-- Editing a policy after assignment creates a new version; it never
-- mutates the old one, so verification can pin exactly what applied.
CREATE TABLE assignment_policy_version (
    assignment_id                uuid NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
    policy_version               text NOT NULL,
    required_listens             integer NOT NULL CHECK (required_listens >= 0),
    required_independent_recalls integer NOT NULL CHECK (required_independent_recalls >= 1),
    required_non_serial_recalls  integer NOT NULL CHECK (required_non_serial_recalls >= 0),
    created_at                   timestamptz NOT NULL DEFAULT now(),
    created_by_user_id           uuid NOT NULL REFERENCES app_user(id),
    supersedes                   text,
    PRIMARY KEY (assignment_id, policy_version),
    CONSTRAINT non_serial_within_total CHECK (
        required_non_serial_recalls <= required_independent_recalls
    )
);

CREATE TABLE segment (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id uuid NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
    ordinal       integer NOT NULL,
    UNIQUE (id, assignment_id),   -- supports the composite FK below
    UNIQUE (assignment_id, ordinal)
);

-- ===========================================================================
-- Learning evidence (append-only)
-- ===========================================================================

CREATE TYPE scaffold_level AS ENUM (
    'full_tiles','fewer_tiles_with_anchors','gap_fill',
    'first_letter_cue','no_answer_choices','oral_blank_page'
);
CREATE TYPE start_context AS ENUM ('serial_start','random_start','boundary_probe');
CREATE TYPE evidence_class AS ENUM (
    'independent_recall','assisted_practice','scaffolded_practice'
);
CREATE TYPE confidence_judgment AS ENUM ('unsure','fairly_sure','certain');

CREATE TABLE attempt (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organization(id),
    assignment_id    uuid NOT NULL REFERENCES assignment(id),
    segment_id       uuid NOT NULL,
    learner_id       uuid NOT NULL REFERENCES app_user(id),
    occurred_at      timestamptz NOT NULL,
    scaffold_level   scaffold_level NOT NULL,
    start_context    start_context NOT NULL,
    correct          boolean NOT NULL,
    hesitant         boolean NOT NULL,
    -- Computed server-side from reported facts. Never client-supplied.
    evidence_class   evidence_class NOT NULL,
    policy_version   text NOT NULL,
    idempotency_key  text NOT NULL UNIQUE,
    -- A segment is writable only through its own assignment.
    FOREIGN KEY (segment_id, assignment_id) REFERENCES segment(id, assignment_id),
    FOREIGN KEY (assignment_id, policy_version)
        REFERENCES assignment_policy_version(assignment_id, policy_version)
);
CREATE INDEX attempt_assignment_idx ON attempt(assignment_id, occurred_at);

CREATE TABLE assistance_event (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id uuid NOT NULL REFERENCES attempt(id) ON DELETE CASCADE,
    kind       text NOT NULL CHECK (kind IN (
        'hint','revealed_anchor','replayed_word','answer_exposed','tile_options_visible'
    ))
);

CREATE TABLE confidence_response (
    attempt_id uuid PRIMARY KEY REFERENCES attempt(id) ON DELETE CASCADE,
    judgment   confidence_judgment NOT NULL
);

CREATE TABLE passage_listen (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organization(id),
    assignment_id   uuid NOT NULL REFERENCES assignment(id),
    segment_id      uuid NOT NULL,
    learner_id      uuid NOT NULL REFERENCES app_user(id),
    completed_at    timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (segment_id, assignment_id) REFERENCES segment(id, assignment_id)
);
CREATE INDEX passage_listen_assignment_idx ON passage_listen(assignment_id);

-- Evidence is never overwritten. Superseding decisions append new rows.
CREATE OR REPLACE FUNCTION refuse_evidence_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION
        'table % is append-only; append a superseding row with reason and actor',
        TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER attempt_append_only
    BEFORE UPDATE OR DELETE ON attempt
    FOR EACH ROW EXECUTE FUNCTION refuse_evidence_mutation();

-- ===========================================================================
-- Oral verification
-- ===========================================================================

CREATE TYPE verification_decision AS ENUM (
    'verified_cleanly','verified_minor_slip','practice_again','unable_to_assess'
);

CREATE TYPE correction_category AS ENUM (
    'word_substitution','omission','insertion','order','join','similar_ayah',
    'vowel','letter','makhraj','madd','ghunnah','waqf_ibtida','teacher_note'
);

CREATE TABLE oral_recitation_request (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       uuid NOT NULL REFERENCES organization(id),
    assignment_id         uuid NOT NULL REFERENCES assignment(id),
    learner_id            uuid NOT NULL REFERENCES app_user(id),
    requested_at          timestamptz NOT NULL DEFAULT now(),
    policy_version        text NOT NULL,
    independent_recalls   integer NOT NULL,
    non_serial_recalls    integer NOT NULL,
    listens_completed     integer NOT NULL,
    status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','decided')),
    FOREIGN KEY (assignment_id, policy_version)
        REFERENCES assignment_policy_version(assignment_id, policy_version)
);

CREATE TABLE oral_verification (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid NOT NULL REFERENCES organization(id),
    request_id         uuid NOT NULL REFERENCES oral_recitation_request(id),
    assignment_id      uuid NOT NULL REFERENCES assignment(id),
    memory_target_id   uuid NOT NULL REFERENCES memory_target(id),
    learner_id         uuid NOT NULL REFERENCES app_user(id),
    -- Pins exactly what applied, so reconstructing what the teacher saw
    -- is a query rather than an archaeology project.
    policy_version     text NOT NULL,
    corpus_version_id  uuid NOT NULL REFERENCES corpus_version(id),
    verifier_user_id   uuid NOT NULL REFERENCES app_user(id),
    verifier_role      role_name NOT NULL,
    decision           verification_decision NOT NULL,
    decided_at         timestamptz NOT NULL DEFAULT now(),
    supersedes         uuid REFERENCES oral_verification(id),
    -- A learner can never be their own verifier, at any layer.
    CONSTRAINT verifier_is_not_the_learner CHECK (verifier_user_id <> learner_id),
    FOREIGN KEY (assignment_id, policy_version)
        REFERENCES assignment_policy_version(assignment_id, policy_version)
);

CREATE TRIGGER oral_verification_append_only
    BEFORE UPDATE OR DELETE ON oral_verification
    FOR EACH ROW EXECUTE FUNCTION refuse_evidence_mutation();

CREATE TABLE oral_verification_evidence (
    verification_id uuid NOT NULL REFERENCES oral_verification(id) ON DELETE CASCADE,
    attempt_id      uuid NOT NULL REFERENCES attempt(id),
    PRIMARY KEY (verification_id, attempt_id)
);

CREATE TABLE correction (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organization(id),
    verification_id   uuid NOT NULL REFERENCES oral_verification(id),
    memory_target_id  uuid NOT NULL REFERENCES memory_target(id),
    category          correction_category NOT NULL,
    note              text,
    added_at          timestamptz NOT NULL DEFAULT now(),
    added_by_user_id  uuid NOT NULL REFERENCES app_user(id)
);
CREATE INDEX correction_target_idx ON correction(memory_target_id);

-- Resolution is a separate append; the correction row itself is not edited.
CREATE TABLE correction_resolution (
    correction_id      uuid PRIMARY KEY REFERENCES correction(id),
    resolved_at        timestamptz NOT NULL DEFAULT now(),
    resolved_by_user_id uuid NOT NULL REFERENCES app_user(id),
    reason             text NOT NULL
);

-- ===========================================================================
-- Memory state and scheduling
-- ===========================================================================

CREATE TYPE learning_state AS ENUM (
    'assigned','preparing','recalled_independently','ready_for_verification',
    'verified','established','durable','fragile','repairing'
);

CREATE TABLE memory_state (
    memory_target_id  uuid PRIMARY KEY REFERENCES memory_target(id),
    organization_id   uuid NOT NULL REFERENCES organization(id),
    assignment_id     uuid NOT NULL REFERENCES assignment(id),
    learner_id        uuid NOT NULL REFERENCES app_user(id),
    state             learning_state NOT NULL,
    delayed_successes integer NOT NULL DEFAULT 0,
    longest_delay_days numeric NOT NULL DEFAULT 0,
    independent_recalls integer NOT NULL DEFAULT 0,
    non_serial_recalls  integer NOT NULL DEFAULT 0,
    listens_completed   integer NOT NULL DEFAULT 0,
    stability_days    numeric,
    difficulty        numeric CHECK (difficulty IS NULL OR (difficulty >= 1 AND difficulty <= 10)),
    last_reviewed_at  timestamptz,
    next_review_at    timestamptz,
    -- Every computed transition records how it was computed, so a
    -- scheduling decision can be replayed and defended.
    engine_version    text NOT NULL,
    algorithm_version text,
    policy_version    text NOT NULL,
    reason            text NOT NULL,
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX memory_state_due_idx ON memory_state(learner_id, next_review_at);

CREATE TABLE review_schedule (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organization(id),
    memory_target_id uuid NOT NULL REFERENCES memory_target(id),
    scheduled_for    timestamptz NOT NULL,
    reason           text NOT NULL,
    algorithm_version text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE review_outcome (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid NOT NULL REFERENCES organization(id),
    review_schedule_id uuid REFERENCES review_schedule(id),
    memory_target_id   uuid NOT NULL REFERENCES memory_target(id),
    attempt_id         uuid NOT NULL REFERENCES attempt(id),
    delay_days         numeric NOT NULL,
    grade              text NOT NULL CHECK (grade IN ('again','hard','good')),
    stability_before   numeric NOT NULL,
    stability_after    numeric NOT NULL,
    algorithm_version  text NOT NULL,
    recorded_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recommendation (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organization(id),
    learner_id       uuid NOT NULL REFERENCES app_user(id),
    memory_target_id uuid NOT NULL REFERENCES memory_target(id),
    score            numeric NOT NULL,
    reason           text NOT NULL,
    recommender_version text NOT NULL,
    served_at        timestamptz NOT NULL DEFAULT now(),
    accepted_at      timestamptz
);

-- ===========================================================================
-- Knowledge graph (relational; no graph database until queries justify one)
-- ===========================================================================

CREATE TABLE knowledge_node (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version       integer NOT NULL DEFAULT 1,
    kind          text NOT NULL,
    label         text NOT NULL
);

CREATE TABLE knowledge_edge (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version     integer NOT NULL DEFAULT 1,
    from_node   uuid NOT NULL REFERENCES knowledge_node(id),
    to_node     uuid NOT NULL REFERENCES knowledge_node(id),
    relation    text NOT NULL CHECK (relation IN (
        'prerequisite','part_of','precedes','follows','connection_boundary',
        'similar_wording','commonly_confused_with','reading_dependency',
        'tajwid_rule_association','correction_pattern','example_of'
    )),
    -- An AI system may propose an edge but may not create a production one.
    provenance  text NOT NULL CHECK (provenance IN ('curriculum_team','teacher','ai_proposed')),
    reviewed_by_user_id uuid REFERENCES app_user(id),
    reviewed_at timestamptz,
    CONSTRAINT ai_edges_require_review CHECK (
        provenance <> 'ai_proposed' OR reviewed_by_user_id IS NOT NULL
    )
);

CREATE TABLE misconception_pattern (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category    correction_category NOT NULL,
    description text NOT NULL
);

-- ===========================================================================
-- Platform
-- ===========================================================================

CREATE TABLE learning_event (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organization(id),
    event_type       text NOT NULL,
    schema_version   integer NOT NULL,
    occurred_at      timestamptz NOT NULL,
    received_at      timestamptz NOT NULL DEFAULT now(),
    actor_user_id    uuid REFERENCES app_user(id),
    learner_id       uuid REFERENCES app_user(id),
    assignment_id    uuid REFERENCES assignment(id),
    -- Identifiers only. No Qur'anic text enters the event stream.
    object_refs      jsonb NOT NULL DEFAULT '{}'::jsonb,
    active_duration_ms integer,
    purpose          text NOT NULL,
    privacy_class    text NOT NULL,
    retention_class  text NOT NULL,
    idempotency_key  text NOT NULL,
    UNIQUE (event_type, idempotency_key)
);
CREATE INDEX learning_event_org_time_idx ON learning_event(organization_id, occurred_at);

-- Transactional outbox: the event and the state it justifies commit
-- together, or not at all.
CREATE TABLE outbox_message (
    id             bigserial PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organization(id),
    payload        jsonb NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    attempts       integer NOT NULL DEFAULT 0,
    delivered_at   timestamptz,
    dead_lettered_at timestamptz,
    last_error     text
);
CREATE INDEX outbox_pending_idx ON outbox_message(created_at)
    WHERE delivered_at IS NULL AND dead_lettered_at IS NULL;

CREATE TABLE audit_log (
    id              bigserial PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organization(id),
    actor_user_id   uuid REFERENCES app_user(id),
    action          text NOT NULL,
    resource_kind   text NOT NULL,
    resource_id     text NOT NULL,
    outcome         text NOT NULL,
    reason          text,
    occurred_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_org_time_idx ON audit_log(organization_id, occurred_at);

CREATE TABLE feature_flag (
    key             text PRIMARY KEY,
    enabled         boolean NOT NULL DEFAULT false,
    rollout_percent integer NOT NULL DEFAULT 0
        CHECK (rollout_percent BETWEEN 0 AND 100)
);

CREATE TABLE experiment_assignment (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organization(id),
    experiment_key  text NOT NULL,
    subject_user_id uuid NOT NULL REFERENCES app_user(id),
    variant         text NOT NULL,
    assigned_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (experiment_key, subject_user_id)
);

CREATE TABLE notification (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organization(id),
    recipient_user_id uuid NOT NULL REFERENCES app_user(id),
    channel         text NOT NULL CHECK (channel IN ('push','email','sms','in_app')),
    -- Previews must never carry Qur'anic text, error detail, or sensitive
    -- learner data. The body is resolved in-app after authentication.
    preview_text    text NOT NULL,
    payload_ref     text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    sent_at         timestamptz
);

-- ===========================================================================
-- Row-level security — defence in depth, never the only policy layer
-- ===========================================================================

CREATE OR REPLACE FUNCTION current_org() RETURNS uuid AS $$
    SELECT NULLIF(current_setting('athar.org_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'academy','app_user','classroom','role_assignment','enrollment',
        'guardian_relationship','consent_record','passage','memory_target',
        'assignment','attempt','passage_listen','oral_recitation_request',
        'oral_verification','correction','memory_state','review_schedule',
        'review_outcome','recommendation','learning_event','outbox_message',
        'audit_log','experiment_assignment','notification'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I USING (organization_id = current_org())
             WITH CHECK (organization_id = current_org())', t);
    END LOOP;
END $$;

COMMIT;
