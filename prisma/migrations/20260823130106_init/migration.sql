-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('kids', 'teen', 'adult');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('organization', 'school', 'classroom', 'learner');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'admin', 'teacher', 'assistant', 'guardian', 'learner', 'studio', 'support');

-- CreateEnum
CREATE TYPE "RelationshipKind" AS ENUM ('teacher_student', 'guardian_child');

-- CreateEnum
CREATE TYPE "RelationshipState" AS ENUM ('claimed', 'approved', 'revoked');

-- CreateEnum
CREATE TYPE "ApprovalState" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'eu',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settings" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT,
    "handle" TEXT,
    "displayName" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential" (
    "userId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'argon2id',
    "mfaSecret" TEXT,
    "mfaEnrolledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "credential_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "userAgentHash" TEXT,
    "ipHash" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_grant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "scopeType" "ScopeType" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "role_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationship" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "RelationshipKind" NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "objectUserId" TEXT NOT NULL,
    "state" "RelationshipState" NOT NULL DEFAULT 'claimed',
    "canTutor" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learner_profile" (
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tier" "Tier" NOT NULL,
    "birthYear" INTEGER,
    "reciterId" TEXT NOT NULL DEFAULT 'husary',
    "lockedSettings" JSONB NOT NULL DEFAULT '{}',
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "dailyGoalUnits" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "placedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learner_profile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "classroom" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "teacherUserId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classroom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "learnerUserId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "classroomId" TEXT,
    "track" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_target" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "learnerUserId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "assignment_target_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_event" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "learnerUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "unitId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'web',

    CONSTRAINT "learning_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_state" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "learnerUserId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "unitKind" TEXT NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "lastReviewAt" TIMESTAMP(3),
    "lastRetrievalType" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projection_checkpoint" (
    "name" TEXT NOT NULL,
    "lastEventId" TEXT,
    "lastEventAt" TIMESTAMP(3),
    "rebuildingAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projection_checkpoint_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "attempt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "learnerUserId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "retrievalType" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "advisory" JSONB,
    "durationMs" INTEGER,
    "assignmentId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_request" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "learnerUserId" TEXT NOT NULL,
    "unitScope" JSONB NOT NULL,
    "track" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "audioAssetId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,

    CONSTRAINT "verification_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verdict" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "verificationRequestId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "corrections" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "decidedByUserId" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verdict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "labelKey" TEXT NOT NULL,
    "difficultyHint" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "contentVersion" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_edge" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "skill_edge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audio_asset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "objectKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "durationMs" INTEGER,
    "mimeType" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "reciterId" TEXT,
    "narratorId" TEXT,
    "license" TEXT,
    "approval" "ApprovalState" NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgeAfter" TIMESTAMP(3),

    CONSTRAINT "audio_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_record" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "learnerUserId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "retentionDays" INTEGER NOT NULL DEFAULT 90,

    CONSTRAINT "consent_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_request" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'received',
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "resultObjectKey" TEXT,
    "failureReason" TEXT,

    CONSTRAINT "data_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag" (
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'off',
    "percentage" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "feature_flag_assignment" (
    "id" TEXT NOT NULL,
    "flagKey" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scopeType" "ScopeType" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "feature_flag_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_run" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scopeType" "ScopeType" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "forDate" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "payload" JSONB,
    "generatedAt" TIMESTAMP(3),

    CONSTRAINT "report_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "deliveryState" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khatma_flag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "learnerUserId" TEXT NOT NULL,
    "position" JSONB NOT NULL,
    "category" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "khatma_flag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "app_user_organizationId_idx" ON "app_user"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_organizationId_email_key" ON "app_user"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_organizationId_handle_key" ON "app_user"("organizationId", "handle");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "session_expiresAt_idx" ON "session"("expiresAt");

-- CreateIndex
CREATE INDEX "role_grant_organizationId_scopeType_scopeId_idx" ON "role_grant"("organizationId", "scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "role_grant_userId_role_scopeType_scopeId_key" ON "role_grant"("userId", "role", "scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "relationship_organizationId_objectUserId_idx" ON "relationship"("organizationId", "objectUserId");

-- CreateIndex
CREATE UNIQUE INDEX "relationship_kind_subjectUserId_objectUserId_key" ON "relationship"("kind", "subjectUserId", "objectUserId");

-- CreateIndex
CREATE INDEX "learner_profile_organizationId_idx" ON "learner_profile"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "classroom_joinCode_key" ON "classroom"("joinCode");

-- CreateIndex
CREATE INDEX "classroom_organizationId_idx" ON "classroom"("organizationId");

-- CreateIndex
CREATE INDEX "enrollment_organizationId_idx" ON "enrollment"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_classroomId_learnerUserId_key" ON "enrollment"("classroomId", "learnerUserId");

-- CreateIndex
CREATE INDEX "assignment_organizationId_createdAt_idx" ON "assignment"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "assignment_target_learnerUserId_idx" ON "assignment_target"("learnerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_target_assignmentId_learnerUserId_key" ON "assignment_target"("assignmentId", "learnerUserId");

-- CreateIndex
CREATE INDEX "learning_event_organizationId_learnerUserId_occurredAt_idx" ON "learning_event"("organizationId", "learnerUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "learning_event_organizationId_type_occurredAt_idx" ON "learning_event"("organizationId", "type", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "learning_event_organizationId_idempotencyKey_key" ON "learning_event"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "memory_state_organizationId_dueAt_idx" ON "memory_state"("organizationId", "dueAt");

-- CreateIndex
CREATE INDEX "memory_state_organizationId_learnerUserId_unitKind_idx" ON "memory_state"("organizationId", "learnerUserId", "unitKind");

-- CreateIndex
CREATE UNIQUE INDEX "memory_state_learnerUserId_unitId_key" ON "memory_state"("learnerUserId", "unitId");

-- CreateIndex
CREATE INDEX "attempt_organizationId_learnerUserId_occurredAt_idx" ON "attempt"("organizationId", "learnerUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "verification_request_organizationId_state_requestedAt_idx" ON "verification_request"("organizationId", "state", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "verdict_verificationRequestId_key" ON "verdict"("verificationRequestId");

-- CreateIndex
CREATE INDEX "verdict_organizationId_decidedAt_idx" ON "verdict"("organizationId", "decidedAt");

-- CreateIndex
CREATE INDEX "skill_edge_relation_idx" ON "skill_edge"("relation");

-- CreateIndex
CREATE UNIQUE INDEX "skill_edge_fromId_toId_relation_key" ON "skill_edge"("fromId", "toId", "relation");

-- CreateIndex
CREATE UNIQUE INDEX "audio_asset_objectKey_key" ON "audio_asset"("objectKey");

-- CreateIndex
CREATE INDEX "audio_asset_organizationId_idx" ON "audio_asset"("organizationId");

-- CreateIndex
CREATE INDEX "audio_asset_approval_idx" ON "audio_asset"("approval");

-- CreateIndex
CREATE INDEX "consent_record_organizationId_idx" ON "consent_record"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "consent_record_learnerUserId_purpose_key" ON "consent_record"("learnerUserId", "purpose");

-- CreateIndex
CREATE INDEX "data_request_organizationId_state_idx" ON "data_request"("organizationId", "state");

-- CreateIndex
CREATE INDEX "audit_log_organizationId_occurredAt_idx" ON "audit_log"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "feature_flag_assignment_organizationId_idx" ON "feature_flag_assignment"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_assignment_flagKey_scopeType_scopeId_key" ON "feature_flag_assignment"("flagKey", "scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "report_run_organizationId_forDate_idx" ON "report_run"("organizationId", "forDate");

-- CreateIndex
CREATE UNIQUE INDEX "report_run_kind_scopeType_scopeId_forDate_key" ON "report_run"("kind", "scopeType", "scopeId", "forDate");

-- CreateIndex
CREATE INDEX "notification_organizationId_userId_createdAt_idx" ON "notification"("organizationId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "khatma_flag_organizationId_learnerUserId_resolvedAt_idx" ON "khatma_flag"("organizationId", "learnerUserId", "resolvedAt");

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential" ADD CONSTRAINT "credential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_grant" ADD CONSTRAINT "role_grant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_grant" ADD CONSTRAINT "role_grant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_objectUserId_fkey" FOREIGN KEY ("objectUserId") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_profile" ADD CONSTRAINT "learner_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_profile" ADD CONSTRAINT "learner_profile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom" ADD CONSTRAINT "classroom_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_learnerUserId_fkey" FOREIGN KEY ("learnerUserId") REFERENCES "learner_profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_target" ADD CONSTRAINT "assignment_target_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_event" ADD CONSTRAINT "learning_event_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_state" ADD CONSTRAINT "memory_state_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_state" ADD CONSTRAINT "memory_state_learnerUserId_fkey" FOREIGN KEY ("learnerUserId") REFERENCES "learner_profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_learnerUserId_fkey" FOREIGN KEY ("learnerUserId") REFERENCES "learner_profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_request" ADD CONSTRAINT "verification_request_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_request" ADD CONSTRAINT "verification_request_learnerUserId_fkey" FOREIGN KEY ("learnerUserId") REFERENCES "learner_profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verdict" ADD CONSTRAINT "verdict_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "verification_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_edge" ADD CONSTRAINT "skill_edge_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_edge" ADD CONSTRAINT "skill_edge_toId_fkey" FOREIGN KEY ("toId") REFERENCES "skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_request" ADD CONSTRAINT "data_request_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_assignment" ADD CONSTRAINT "feature_flag_assignment_flagKey_fkey" FOREIGN KEY ("flagKey") REFERENCES "feature_flag"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_assignment" ADD CONSTRAINT "feature_flag_assignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_run" ADD CONSTRAINT "report_run_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khatma_flag" ADD CONSTRAINT "khatma_flag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
