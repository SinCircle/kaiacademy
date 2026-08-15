ALTER TABLE `api_keys` ADD `scope_violation_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `api_keys` ADD `last_scope_violation_at` text;--> statement-breakpoint
ALTER TABLE `api_keys` ADD `isolated_at` text;--> statement-breakpoint
ALTER TABLE `api_keys` ADD `isolation_reason` text;