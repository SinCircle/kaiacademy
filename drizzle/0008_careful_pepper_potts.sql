CREATE TABLE `playground_views` (
	`post_id` text NOT NULL,
	`viewer_key` text NOT NULL,
	`window_started_at` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`post_id`, `viewer_key`, `window_started_at`),
	FOREIGN KEY (`post_id`) REFERENCES `playground_posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_playground_views_post_id` ON `playground_views` (`post_id`);--> statement-breakpoint
ALTER TABLE `playground_comments` ADD `is_featured` integer DEFAULT false NOT NULL;