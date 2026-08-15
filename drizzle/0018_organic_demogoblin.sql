CREATE TABLE `api_staged_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_id` text NOT NULL,
	`member_id` text NOT NULL,
	`request_id` text,
	`display_name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`request_id`) REFERENCES `api_requests`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_api_staged_uploads_storage_key` ON `api_staged_uploads` (`storage_key`);--> statement-breakpoint
CREATE INDEX `idx_api_staged_uploads_member_expires` ON `api_staged_uploads` (`member_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_api_staged_uploads_request` ON `api_staged_uploads` (`request_id`);--> statement-breakpoint
ALTER TABLE `api_requests` ADD `playground_post_id` text REFERENCES playground_posts(id);