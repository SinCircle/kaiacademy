ALTER TABLE `invitation_codes` ADD `revoked_at` text;--> statement-breakpoint
UPDATE `members` SET `invite_quota` = `invite_quota` + (
	SELECT COUNT(*) FROM `invitation_codes`
	WHERE `created_by` = `members`.`id` AND `used_by` IS NULL AND `used_at` IS NULL
);

-- The application creates the invitation guards idempotently during database
-- initialization. Keeping trigger bodies out of this migration avoids SQL
-- statement splitters treating their internal semicolons as incomplete input.
