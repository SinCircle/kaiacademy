CREATE TABLE `message_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`title` text NOT NULL,
	`storage_key` text NOT NULL,
	`byte_size` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_message_attachments_message_id` ON `message_attachments` (`message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_message_attachments_storage_key` ON `message_attachments` (`storage_key`);