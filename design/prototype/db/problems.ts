import { env } from "cloudflare:workers";

interface PreparedStatement {
  bind(...values: unknown[]): PreparedStatement;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

interface Database {
  prepare(query: string): PreparedStatement;
  batch(statements: PreparedStatement[]): Promise<unknown[]>;
}

export interface StoredProblem {
  id: string;
  title: string;
  status: string;
  created: string;
  tags: string[];
}

let initialization: Promise<void> | null = null;

function database(): Database {
  const db = (env as unknown as { DB?: Database }).DB;
  if (!db) throw new Error("数据库暂不可用");
  return db;
}

async function initializeDatabase(db: Database) {
  if (!initialization) {
    initialization = db
      .batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS problems (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          background TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT '开放',
          created_at TEXT NOT NULL
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS problem_tags (
          problem_id TEXT NOT NULL,
          tag TEXT NOT NULL,
          PRIMARY KEY (problem_id, tag),
          FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
        )`),
        db.prepare("CREATE INDEX IF NOT EXISTS idx_problem_tags_tag ON problem_tags(tag)"),
        db.prepare("PRAGMA optimize"),
      ])
      .then(() => undefined)
      .catch((error) => {
        initialization = null;
        throw error;
      });
  }
  await initialization;
}

export async function createProblem(input: {
  title: string;
  body: string;
  background: string;
  tags: string[];
}) {
  const db = database();
  await initializeDatabase(db);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const statements = [
    db
      .prepare("INSERT INTO problems (id, title, body, background, status, created_at) VALUES (?, ?, ?, ?, '开放', ?)")
      .bind(id, input.title, input.body, input.background, createdAt),
    ...input.tags.map((tag) =>
      db.prepare("INSERT INTO problem_tags (problem_id, tag) VALUES (?, ?)").bind(id, tag),
    ),
  ];
  await db.batch(statements);
  return { id, createdAt };
}

export async function searchProblems(query: string): Promise<StoredProblem[]> {
  const db = database();
  await initializeDatabase(db);
  const like = `%${query}%`;
  const result = await db
    .prepare(`SELECT
      p.id,
      p.title,
      p.status,
      p.created_at AS created,
      COALESCE(GROUP_CONCAT(t.tag, ','), '') AS tags
    FROM problems p
    LEFT JOIN problem_tags t ON t.problem_id = p.id
    WHERE ? = ''
      OR p.title LIKE ? COLLATE NOCASE
      OR p.body LIKE ? COLLATE NOCASE
      OR p.background LIKE ? COLLATE NOCASE
      OR EXISTS (
        SELECT 1 FROM problem_tags matched
        WHERE matched.problem_id = p.id AND matched.tag LIKE ? COLLATE NOCASE
      )
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT 50`)
    .bind(query, like, like, like, like)
    .all<{ id: string; title: string; status: string; created: string; tags: string }>();

  return result.results.map((problem) => ({
    ...problem,
    tags: problem.tags ? problem.tags.split(",") : [],
  }));
}

export async function listTags() {
  const db = database();
  await initializeDatabase(db);
  const result = await db
    .prepare(`SELECT tag, COUNT(*) AS uses
      FROM problem_tags
      GROUP BY tag
      ORDER BY uses DESC, tag ASC
      LIMIT 100`)
    .all<{ tag: string; uses: number }>();
  return result.results.map((item) => item.tag);
}
