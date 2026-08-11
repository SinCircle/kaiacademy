CREATE TABLE `problem_tags` (
	`problem_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`problem_id`, `tag`),
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_problem_tags_tag` ON `problem_tags` (`tag`);--> statement-breakpoint
CREATE TABLE `problems` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`background` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '开放' NOT NULL,
	`created_at` text NOT NULL
);
