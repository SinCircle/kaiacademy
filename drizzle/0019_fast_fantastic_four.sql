CREATE TABLE `invitation_code_uses` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`member_id` text NOT NULL,
	`used_at` text NOT NULL,
	FOREIGN KEY (`code`) REFERENCES `invitation_codes`(`code`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invitation_code_uses_member` ON `invitation_code_uses` (`member_id`);--> statement-breakpoint
CREATE INDEX `idx_invitation_code_uses_code_used` ON `invitation_code_uses` (`code`,`used_at`);--> statement-breakpoint
DROP INDEX `idx_members_registration_invite_code`;--> statement-breakpoint
CREATE INDEX `idx_members_registration_invite_code` ON `members` (`registration_invite_code`);--> statement-breakpoint
ALTER TABLE `invitation_codes` ADD `remaining_uses` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE `invitation_codes` SET `remaining_uses` = 0
WHERE `used_by` IS NOT NULL OR `used_at` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `invitation_code_uses` (`id`,`code`,`member_id`,`used_at`)
SELECT 'legacy-' || `code`,`code`,`used_by`,`used_at` FROM `invitation_codes`
WHERE `used_by` IS NOT NULL AND `used_at` IS NOT NULL;
