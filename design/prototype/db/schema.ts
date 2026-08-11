import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const problems = sqliteTable("problems", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  background: text("background").notNull().default(""),
  status: text("status").notNull().default("开放"),
  createdAt: text("created_at").notNull(),
});

export const problemTags = sqliteTable(
  "problem_tags",
  {
    problemId: text("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.problemId, table.tag] }),
    index("idx_problem_tags_tag").on(table.tag),
  ],
);
