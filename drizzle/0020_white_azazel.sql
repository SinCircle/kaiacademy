ALTER TABLE `playground_interactions` ADD `first_interacted_at` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `playground_interactions`
SET `first_interacted_at` = `last_interacted_at`
WHERE `first_interacted_at` = '';
