CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"brand" text NOT NULL,
	"handle" text NOT NULL,
	"platform" text NOT NULL,
	"profile_dir" text NOT NULL,
	"warmup_stage" integer DEFAULT 0 NOT NULL,
	"daily_cap" integer DEFAULT 3 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"vertical" text NOT NULL,
	"claim_type" text NOT NULL,
	"entities" jsonb NOT NULL,
	"values" jsonb NOT NULL,
	"supporting_quote" text,
	"headline" text,
	"image_url" text,
	"tags" jsonb,
	"source_tier" text NOT NULL,
	"source_domain" text NOT NULL,
	"extracted_by" text NOT NULL,
	"dedupe_hash" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compositions" (
	"id" text PRIMARY KEY NOT NULL,
	"claim_id" text NOT NULL,
	"account_id" text NOT NULL,
	"archetype" text NOT NULL,
	"layout" text NOT NULL,
	"skin" text NOT NULL,
	"accents" jsonb NOT NULL,
	"caption_by_platform" jsonb NOT NULL,
	"image_paths" jsonb NOT NULL,
	"seed" integer NOT NULL,
	"rendered_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"claim_id" text NOT NULL,
	"rule" text NOT NULL,
	"outcome" text NOT NULL,
	"reason" text NOT NULL,
	"corroborating_item_ids" jsonb,
	"decided_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"stage" text NOT NULL,
	"level" text NOT NULL,
	"msg" text NOT NULL,
	"dedupe_hash" text,
	"meta" jsonb,
	"latency_ms" real
);
--> statement-breakpoint
CREATE TABLE "claim_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"dedupe_hash" text NOT NULL,
	"item_id" text NOT NULL,
	"domain" text NOT NULL,
	"tier" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extractions" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"processed_at" timestamp with time zone NOT NULL,
	"claim_ids" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" text PRIMARY KEY NOT NULL,
	"source_key" text NOT NULL,
	"external_id" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"pre_key" text NOT NULL,
	"vertical" text NOT NULL,
	"tier" text NOT NULL,
	"source_domain" text NOT NULL,
	"raw_url" text,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"image_url" text
);
--> statement-breakpoint
CREATE TABLE "llm_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"cache_key" text NOT NULL,
	"model" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"day" text NOT NULL,
	"minute" text NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"message_id" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"composition_id" text NOT NULL,
	"account_id" text NOT NULL,
	"platform" text NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"platform_post_id" text,
	"scheduled_for" timestamp with time zone,
	"published_at" timestamp with time zone,
	"latency_ms" integer,
	"error" text,
	"archive_path" text
);
--> statement-breakpoint
CREATE TABLE "review_items" (
	"id" text PRIMARY KEY NOT NULL,
	"claim_id" text NOT NULL,
	"composition_id" text,
	"state" text NOT NULL,
	"reason" text NOT NULL,
	"rule" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"last_ok_at" timestamp with time zone,
	"last_check_at" timestamp with time zone,
	"healthy" boolean DEFAULT false NOT NULL,
	"last_screenshot_path" text
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"vertical" text NOT NULL,
	"tier" text NOT NULL,
	"cadence_seconds" integer NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	"items_seen" integer DEFAULT 0 NOT NULL,
	"cursor" jsonb,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "claims_dedupe_hash_idx" ON "claims" USING btree ("dedupe_hash");--> statement-breakpoint
CREATE INDEX "compositions_account_idx" ON "compositions" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "decisions_claim_idx" ON "decisions" USING btree ("claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_observation_idx" ON "claim_evidence" USING btree ("dedupe_hash","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "extractions_item_idx" ON "extractions" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "items_content_hash_idx" ON "items" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "items_pre_key_idx" ON "items" USING btree ("pre_key");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_cache_key_idx" ON "llm_cache" USING btree ("cache_key");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_idempotency_idx" ON "posts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "posts_account_published_idx" ON "posts" USING btree ("account_id","published_at");