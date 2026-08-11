CREATE TABLE `invitation_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`used_by` text,
	`created_at` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`created_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`used_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_invitation_codes_created_by` ON `invitation_codes` (`created_by`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`initials` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`public_email` text DEFAULT '' NOT NULL,
	`specialties` text DEFAULT '[]' NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`invite_quota` integer DEFAULT 0 NOT NULL,
	`password_salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_members_email` ON `members` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_members_username` ON `members` (`username`);--> statement-breakpoint
CREATE TABLE `message_votes` (
	`message_id` text NOT NULL,
	`member_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`message_id`, `member_id`),
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`problem_id` text NOT NULL,
	`parent_id` text,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`kind` text,
	`is_adopted` integer DEFAULT false NOT NULL,
	`upvotes` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_messages_problem_parent` ON `messages` (`problem_id`,`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_author_id` ON `messages` (`author_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`problem_id` text NOT NULL,
	`kind` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_member_read_created` ON `notifications` (`member_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `problem_members` (
	`problem_id` text NOT NULL,
	`member_id` text NOT NULL,
	`relation` text DEFAULT 'following' NOT NULL,
	`is_manager` integer DEFAULT false NOT NULL,
	`joined_at` text NOT NULL,
	PRIMARY KEY(`problem_id`, `member_id`),
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_problem_members_member_relation` ON `problem_members` (`member_id`,`relation`);--> statement-breakpoint
CREATE INDEX `idx_problem_members_problem_relation` ON `problem_members` (`problem_id`,`relation`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_member_id` ON `sessions` (`member_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_expires_at` ON `sessions` (`expires_at`);--> statement-breakpoint
ALTER TABLE `problems` ADD `short_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `problems` ADD `creator_id` text DEFAULT 'member-xu-wen' NOT NULL;--> statement-breakpoint
ALTER TABLE `problems` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `problems` SET `short_code` = 'P-OLD-' || PRINTF('%04d', rowid) WHERE `short_code` = '';--> statement-breakpoint
UPDATE `problems` SET `updated_at` = `created_at` WHERE `updated_at` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `idx_problems_short_code` ON `problems` (`short_code`);--> statement-breakpoint
CREATE INDEX `idx_problems_status_updated_at` ON `problems` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_problems_creator_id` ON `problems` (`creator_id`);
