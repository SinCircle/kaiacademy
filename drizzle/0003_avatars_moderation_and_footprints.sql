CREATE TABLE `problem_views` (
	`problem_id` text NOT NULL,
	`member_id` text NOT NULL,
	`viewed_at` text NOT NULL,
	PRIMARY KEY(`problem_id`, `member_id`),
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_problem_views_member_viewed` ON `problem_views` (`member_id`,`viewed_at`);--> statement-breakpoint
ALTER TABLE `members` ADD `avatar_key` text;--> statement-breakpoint
ALTER TABLE `members` ADD `avatar_updated_at` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `is_hidden` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `problems` ADD `is_pinned` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `problems` SET `status` = '开放' WHERE `status` NOT IN ('开放', '已解决');
