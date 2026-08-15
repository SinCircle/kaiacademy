CREATE TABLE `playground_interactions` (
	`post_id` text NOT NULL,
	`member_id` text NOT NULL,
	`last_interacted_at` text NOT NULL,
	PRIMARY KEY(`post_id`, `member_id`),
	FOREIGN KEY (`post_id`) REFERENCES `playground_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_playground_interactions_member_id` ON `playground_interactions` (`member_id`);