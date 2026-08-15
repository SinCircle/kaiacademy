CREATE TABLE `api_global_control` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`changed_by` text,
	`changed_at` text NOT NULL,
	FOREIGN KEY (`changed_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
