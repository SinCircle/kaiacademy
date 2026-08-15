CREATE TABLE `playground_comment_reactions` (
	`comment_id` text NOT NULL,
	`member_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`comment_id`, `member_id`, `emoji`),
	FOREIGN KEY (`comment_id`) REFERENCES `playground_comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_playground_comment_reactions_member_id` ON `playground_comment_reactions` (`member_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `playground_comment_reactions` (`comment_id`,`member_id`,`emoji`,`created_at`)
SELECT `id`,`author_id`,`marker`,`updated_at` FROM `playground_comments` WHERE `marker` IS NOT NULL AND `marker` <> '';
--> statement-breakpoint
UPDATE `playground_comments` SET `marker` = NULL WHERE `marker` IS NOT NULL;
