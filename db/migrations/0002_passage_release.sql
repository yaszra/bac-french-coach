-- Passage release state and segmentation.
--
-- Release state belongs on the passage, set by the content pipeline. It is
-- deliberately not something an assignment caller can assert: a parameter
-- a client can set is not a content gate.
--
-- Expand/contract: columns are added with safe defaults, so this migration
-- is backward compatible with the running application.

BEGIN;

ALTER TABLE passage
    ADD COLUMN segment_count integer NOT NULL DEFAULT 1
        CHECK (segment_count >= 1),
    -- Unreleased by default. Content becomes visible by an explicit
    -- approval action, never by omission.
    ADD COLUMN released boolean NOT NULL DEFAULT false,
    ADD COLUMN release_blocks text[] NOT NULL DEFAULT '{}',
    ADD COLUMN released_at timestamptz,
    ADD COLUMN released_by_user_id uuid REFERENCES app_user(id);

-- A released passage must record who released it and when.
ALTER TABLE passage
    ADD CONSTRAINT release_is_attributable CHECK (
        released = false OR (released_at IS NOT NULL AND released_by_user_id IS NOT NULL)
    );

-- A released passage cannot simultaneously carry blocking reasons.
ALTER TABLE passage
    ADD CONSTRAINT released_has_no_blocks CHECK (
        released = false OR cardinality(release_blocks) = 0
    );

-- A passage may only be released against a published corpus version.
CREATE OR REPLACE FUNCTION refuse_release_of_unpublished_corpus() RETURNS trigger AS $$
DECLARE v_lifecycle corpus_lifecycle;
BEGIN
    IF NEW.released THEN
        SELECT lifecycle INTO v_lifecycle
          FROM corpus_version WHERE id = NEW.corpus_version_id;
        IF v_lifecycle <> 'published' THEN
            RAISE EXCEPTION
                'passage % cannot be released against a % corpus version',
                NEW.id, v_lifecycle
                USING ERRCODE = 'restrict_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER passage_release_requires_published_corpus
    BEFORE INSERT OR UPDATE ON passage
    FOR EACH ROW EXECUTE FUNCTION refuse_release_of_unpublished_corpus();

CREATE INDEX passage_released_idx ON passage(organization_id) WHERE released;

COMMIT;
