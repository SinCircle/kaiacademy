CREATE TABLE `playground_bookmarks` (
	`post_id` text NOT NULL,
	`member_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`post_id`, `member_id`),
	FOREIGN KEY (`post_id`) REFERENCES `playground_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_playground_bookmarks_member_id` ON `playground_bookmarks` (`member_id`);--> statement-breakpoint
CREATE TABLE `playground_comment_votes` (
	`comment_id` text NOT NULL,
	`member_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`comment_id`, `member_id`),
	FOREIGN KEY (`comment_id`) REFERENCES `playground_comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `playground_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`parent_id` text,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`is_hidden` integer DEFAULT false NOT NULL,
	`upvotes` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `playground_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_playground_comments_post_parent` ON `playground_comments` (`post_id`,`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_playground_comments_author_id` ON `playground_comments` (`author_id`);--> statement-breakpoint
CREATE TABLE `playground_post_votes` (
	`post_id` text NOT NULL,
	`member_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`post_id`, `member_id`),
	FOREIGN KEY (`post_id`) REFERENCES `playground_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `playground_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`author_id` text NOT NULL,
	`is_hidden` integer DEFAULT false NOT NULL,
	`is_pinned` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_playground_posts_updated_at` ON `playground_posts` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_playground_posts_author_id` ON `playground_posts` (`author_id`);--> statement-breakpoint
CREATE TABLE `playground_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`kind` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`storage_key` text,
	`external_url` text,
	`mime_type` text,
	`byte_size` integer,
	`sha256` text,
	`download_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `playground_posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_playground_resources_post_id` ON `playground_resources` (`post_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_playground_resources_storage_key` ON `playground_resources` (`storage_key`);--> statement-breakpoint
CREATE TABLE `playground_tags` (
	`post_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`post_id`, `tag`),
	FOREIGN KEY (`post_id`) REFERENCES `playground_posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_playground_tags_tag` ON `playground_tags` (`tag`);