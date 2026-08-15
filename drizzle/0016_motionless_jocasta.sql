CREATE TABLE `daily_checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`draw_date` text NOT NULL,
	`symbols` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_daily_checkins_member_date` ON `daily_checkins` (`member_id`,`draw_date`);--> statement-breakpoint
CREATE INDEX `idx_daily_checkins_member_created` ON `daily_checkins` (`member_id`,`created_at`);