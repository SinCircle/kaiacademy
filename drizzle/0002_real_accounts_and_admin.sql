CREATE TABLE `admin_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_admin_audit_admin_created` ON `admin_audit_logs` (`admin_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_admin_audit_target_created` ON `admin_audit_logs` (`target_type`,`target_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `email_verification_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`invite_code` text NOT NULL,
	`code_salt` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`provider_id` text,
	`sent_at` text,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_email_verification_email_created` ON `email_verification_codes` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_email_verification_invite_created` ON `email_verification_codes` (`invite_code`,`created_at`);--> statement-breakpoint
ALTER TABLE `members` ADD `account_status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `registration_invite_code` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_members_registration_invite_code` ON `members` (`registration_invite_code`);--> statement-breakpoint
ALTER TABLE `problems` ADD `is_hidden` integer DEFAULT false NOT NULL;