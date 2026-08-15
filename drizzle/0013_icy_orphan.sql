CREATE TABLE `api_call_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_id` text NOT NULL,
	`member_id` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`status_code` integer NOT NULL,
	`request_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`request_id`) REFERENCES `api_requests`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_api_call_logs_key_created` ON `api_call_logs` (`api_key_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_api_call_logs_member_created` ON `api_call_logs` (`member_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`name` text NOT NULL,
	`secret_hash` text NOT NULL,
	`encrypted_secret` text NOT NULL,
	`secret_iv` text NOT NULL,
	`secret_suffix` text NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` text,
	`last_used_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_api_keys_secret_hash` ON `api_keys` (`secret_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_api_keys_member_name` ON `api_keys` (`member_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_api_keys_member_status` ON `api_keys` (`member_id`,`status`);--> statement-breakpoint
CREATE TABLE `api_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_id` text NOT NULL,
	`member_id` text NOT NULL,
	`action` text NOT NULL,
	`problem_id` text,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result_id` text,
	`error` text,
	`created_at` text NOT NULL,
	`reviewed_at` text,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_api_requests_member_status_created` ON `api_requests` (`member_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_api_requests_key_created` ON `api_requests` (`api_key_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `members` ADD `api_enabled` integer DEFAULT false NOT NULL;