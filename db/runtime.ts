import { env } from "cloudflare:workers";

export interface PreparedStatement {
  bind(...values: unknown[]): PreparedStatement;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface Database {
  prepare(query: string): PreparedStatement;
  batch(statements: PreparedStatement[]): Promise<unknown[]>;
}

let initialization: Promise<void> | null = null;

export function database(): Database {
  const db = (env as unknown as { DB?: Database }).DB;
  if (!db) throw new Error("数据库暂不可用");
  return db;
}

// 引导账号为占位数据：哈希与盐均为占位符，对应账号无法登录。
// 部署前请在代码中替换为真实账号，或通过外部初始化写入数据库。
const bootstrapPasswordHash = "0000000000000000000000000000000000000000000000000000000000000000";
const bootstrapPasswordSalt = "gaiyuan-bootstrap-placeholder";
const adminPasswordHash = "0000000000000000000000000000000000000000000000000000000000000000";
const adminPasswordSalt = "gaiyuan-sincircle-placeholder";

export async function ensureDatabase() {
  if (!initialization) {
    const db = database();
    const schemaStatements = [
      `CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY NOT NULL,
        email TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        initials TEXT NOT NULL,
        bio TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        public_email TEXT NOT NULL DEFAULT '',
        specialties TEXT NOT NULL DEFAULT '[]',
        role TEXT NOT NULL DEFAULT 'member',
        account_status TEXT NOT NULL DEFAULT 'active',
        registration_invite_code TEXT,
        avatar_key TEXT,
        avatar_updated_at TEXT,
        invite_quota INTEGER NOT NULL DEFAULT 0,
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY NOT NULL,
        member_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS invitation_codes (
        code TEXT PRIMARY KEY NOT NULL,
        created_by TEXT NOT NULL,
        used_by TEXT,
        created_at TEXT NOT NULL,
        used_at TEXT,
        FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE CASCADE,
        FOREIGN KEY (used_by) REFERENCES members(id) ON DELETE SET NULL
      )`,
      `CREATE TABLE IF NOT EXISTS email_verification_codes (
        id TEXT PRIMARY KEY NOT NULL,
        email TEXT NOT NULL,
        invite_code TEXT NOT NULL,
        code_salt TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        provider_id TEXT,
        sent_at TEXT,
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS problems (
        id TEXT PRIMARY KEY NOT NULL,
        short_code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        background TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '开放',
        creator_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_hidden INTEGER NOT NULL DEFAULT 0,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (creator_id) REFERENCES members(id) ON DELETE RESTRICT
      )`,
      `CREATE TABLE IF NOT EXISTS problem_tags (
        problem_id TEXT NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (problem_id, tag),
        FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS problem_members (
        problem_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        relation TEXT NOT NULL DEFAULT 'following',
        is_manager INTEGER NOT NULL DEFAULT 0,
        joined_at TEXT NOT NULL,
        PRIMARY KEY (problem_id, member_id),
        FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE,
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY NOT NULL,
        problem_id TEXT NOT NULL,
        parent_id TEXT,
        author_id TEXT NOT NULL,
        body TEXT NOT NULL,
        kind TEXT,
        is_hidden INTEGER NOT NULL DEFAULT 0,
        is_adopted INTEGER NOT NULL DEFAULT 0,
        upvotes INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY (author_id) REFERENCES members(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS message_votes (
        message_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (message_id, member_id),
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS problem_views (
        problem_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        viewed_at TEXT NOT NULL,
        PRIMARY KEY (problem_id, member_id),
        FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE,
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY NOT NULL,
        member_id TEXT NOT NULL,
        problem_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL,
        read_at TEXT,
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
        FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id TEXT PRIMARY KEY NOT NULL,
        admin_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (admin_id) REFERENCES members(id) ON DELETE RESTRICT
      )`,
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_members_email ON members(email)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_members_username ON members(username)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_members_registration_invite_code ON members(registration_invite_code)",
      "CREATE INDEX IF NOT EXISTS idx_sessions_member_id ON sessions(member_id)",
      "CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)",
      "CREATE INDEX IF NOT EXISTS idx_invitation_codes_created_by ON invitation_codes(created_by)",
      "CREATE INDEX IF NOT EXISTS idx_email_verification_email_created ON email_verification_codes(email, created_at)",
      "CREATE INDEX IF NOT EXISTS idx_email_verification_invite_created ON email_verification_codes(invite_code, created_at)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_problems_short_code ON problems(short_code)",
      "CREATE INDEX IF NOT EXISTS idx_problems_status_updated_at ON problems(status, updated_at)",
      "CREATE INDEX IF NOT EXISTS idx_problems_creator_id ON problems(creator_id)",
      "CREATE INDEX IF NOT EXISTS idx_problem_tags_tag ON problem_tags(tag)",
      "CREATE INDEX IF NOT EXISTS idx_problem_members_member_relation ON problem_members(member_id, relation)",
      "CREATE INDEX IF NOT EXISTS idx_problem_members_problem_relation ON problem_members(problem_id, relation)",
      "CREATE INDEX IF NOT EXISTS idx_messages_problem_parent ON messages(problem_id, parent_id)",
      "CREATE INDEX IF NOT EXISTS idx_messages_author_id ON messages(author_id)",
      "CREATE INDEX IF NOT EXISTS idx_problem_views_member_viewed ON problem_views(member_id, viewed_at)",
      "CREATE INDEX IF NOT EXISTS idx_notifications_member_read_created ON notifications(member_id, read_at, created_at)",
      "CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_created ON admin_audit_logs(admin_id, created_at)",
      "CREATE INDEX IF NOT EXISTS idx_admin_audit_target_created ON admin_audit_logs(target_type, target_id, created_at)",
    ];

    const seedStatements: Array<[string, unknown[]]> = [
      ["INSERT OR IGNORE INTO members (id,email,username,display_name,initials,bio,location,public_email,specialties,role,invite_quota,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["member-admin", "admin@example.com", "SinCircle", "SinCircle", "SC", "系统超级管理员。", "", "", JSON.stringify([]), "superadmin", 0, adminPasswordSalt, adminPasswordHash, "2026-08-11T10:45:00.000Z"]],
      ["UPDATE members SET email = ?, username = ?, display_name = ?, initials = ?, bio = ?, role = 'superadmin', account_status = 'active', invite_quota = 10, password_salt = ?, password_hash = ? WHERE id = ?", ["admin@example.com", "SinCircle", "SinCircle", "SC", "系统超级管理员。", adminPasswordSalt, adminPasswordHash, "member-admin"]],
      ["INSERT OR IGNORE INTO members (id,email,username,display_name,initials,bio,location,public_email,specialties,role,invite_quota,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["member-xu-wen", "xuwen@example.org", "xuwen", "许闻", "XW", "数论研究者，关注素数分布与丢番图方程中的初等方法。希望把复杂证明拆成可以独立验证的小步骤，也欢迎不同思路并行推进。", "上海", "xuwen@example.org", JSON.stringify(["解析数论", "初等数论", "丢番图方程"]), "superadmin", 3, bootstrapPasswordSalt, bootstrapPasswordHash, "2025-03-12T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO members (id,email,username,display_name,initials,bio,location,public_email,specialties,role,invite_quota,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["member-lin-cheng", "lincheng@example.org", "lincheng", "林澄", "LC", "研究代数数论与有限域方法。", "北京", "", JSON.stringify(["代数数论", "有限域"]), "member", 0, bootstrapPasswordSalt, bootstrapPasswordHash, "2025-05-20T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO members (id,email,username,display_name,initials,bio,location,public_email,specialties,role,invite_quota,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["member-chen-yu", "chenyu@example.org", "chenyu", "陈屿", "CY", "关注初等数论中的可计算方法。", "南京", "", JSON.stringify(["初等数论"]), "member", 0, bootstrapPasswordSalt, bootstrapPasswordHash, "2025-07-02T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO members (id,email,username,display_name,initials,bio,location,public_email,specialties,role,invite_quota,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["member-zhou-lan", "zhoulan@example.org", "zhoulan", "周岚", "ZL", "研究 p-adic 分析及其数论应用。", "杭州", "", JSON.stringify(["p-adic 分析", "数论"]), "member", 0, bootstrapPasswordSalt, bootstrapPasswordHash, "2025-07-18T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO members (id,email,username,display_name,initials,bio,location,public_email,specialties,role,invite_quota,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["member-song-xu", "songxu@example.org", "songxu", "宋叙", "SX", "使用计算实验辅助数论研究。", "武汉", "", JSON.stringify(["计算数论"]), "member", 0, bootstrapPasswordSalt, bootstrapPasswordHash, "2025-08-04T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO members (id,email,username,display_name,initials,bio,location,public_email,specialties,role,invite_quota,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["member-fang-li", "fangli@example.org", "fangli", "方理", "FL", "代数数论学习者。", "成都", "", JSON.stringify(["代数数论"]), "member", 0, bootstrapPasswordSalt, bootstrapPasswordHash, "2025-08-08T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO members (id,email,username,display_name,initials,bio,location,public_email,specialties,role,invite_quota,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["member-ji-wen", "jiwen@example.org", "jiwen", "季文", "JW", "", "", "", JSON.stringify(["解析数论"]), "member", 0, bootstrapPasswordSalt, bootstrapPasswordHash, "2025-09-02T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO members (id,email,username,display_name,initials,bio,location,public_email,specialties,role,invite_quota,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["member-gu-yao", "guyao@example.org", "guyao", "顾遥", "GY", "", "", "", JSON.stringify(["组合数学"]), "member", 0, bootstrapPasswordSalt, bootstrapPasswordHash, "2025-10-12T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO members (id,email,username,display_name,initials,bio,location,public_email,specialties,role,invite_quota,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["member-wu-qi", "wuqi@example.org", "wuqi", "吴琦", "WQ", "", "", "", JSON.stringify(["代数"]), "member", 0, bootstrapPasswordSalt, bootstrapPasswordHash, "2025-11-03T08:00:00.000Z"]],
      ["UPDATE members SET role = 'member', account_status = 'suspended' WHERE id != 'member-admin' AND email LIKE '%@example.org'", []],
      ["INSERT OR IGNORE INTO invitation_codes (code,created_by,used_by,created_at,used_at) VALUES (?,?,?,?,?)", ["MATH-DEMO", "member-xu-wen", null, "2026-08-10T08:00:00.000Z", null]],
      ["INSERT OR IGNORE INTO problems (id,short_code,title,body,background,status,creator_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)", ["problem-0184", "P-0184", "平方数相邻差的素因子结构", "设 $n>1$ 为整数。研究相邻两个平方数之差中出现的素因子，并证明下述命题。\n\n$$n^2-1=(n-1)(n+1)$$\n\n是否存在绝对常数 $C$，使得对任意充分大的 $n$，$n^2-1$ 至少含有一个大于 $C\\log n$ 的素因子？\n\n允许使用初等解析数论中的标准结论；若使用更强结果，需明确指出依赖。", "问题来自对相邻平方差因子结构的研究。目前已完成基本分拆，尚缺小素因子高次幂的统一估计。", "开放", "member-xu-wen", "2026-08-03T08:00:00.000Z", "2026-08-11T08:24:00.000Z"]],
      ["INSERT OR IGNORE INTO problems (id,short_code,title,body,background,status,creator_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)", ["problem-0172", "P-0172", "有限域上椭圆曲线的点数估计", "设 $E/\\mathbb{F}_q$ 为椭圆曲线。尝试在明确记录所用工具的前提下，整理 $\\#E(\\mathbb{F}_q)$ 的初等估计路径。", "希望比较初等计数方法与标准估计之间的差距，并单列小特征情形。", "开放", "member-lin-cheng", "2026-07-28T08:00:00.000Z", "2026-08-10T06:30:00.000Z"]],
      ["INSERT OR IGNORE INTO problems (id,short_code,title,body,background,status,creator_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)", ["problem-0165", "P-0165", "随机图中局部稀疏与整体连通性的阈值", "研究随机图中局部稀疏约束与全局连通概率之间的关系，并确定临界区间的宽度。", "当前数值实验显示两个阈值可能在主项上重合。", "开放", "member-gu-yao", "2026-07-19T08:00:00.000Z", "2026-08-08T03:20:00.000Z"]],
      ["INSERT OR IGNORE INTO problems (id,short_code,title,body,background,status,creator_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)", ["problem-0158", "P-0158", "一类非线性递推序列的周期判定", "给定模 $m$ 的非线性递推，寻找进入周期的充分条件，并估计预周期长度。", "", "已解决", "member-chen-yu", "2026-06-30T08:00:00.000Z", "2026-08-01T02:10:00.000Z"]],
      ["UPDATE problems SET status = '开放' WHERE status NOT IN ('开放', '已解决')", []],
      ["INSERT OR IGNORE INTO problem_tags (problem_id,tag) VALUES (?,?)", ["problem-0184", "数论"]],
      ["INSERT OR IGNORE INTO problem_tags (problem_id,tag) VALUES (?,?)", ["problem-0184", "素数"]],
      ["INSERT OR IGNORE INTO problem_tags (problem_id,tag) VALUES (?,?)", ["problem-0184", "整除性"]],
      ["INSERT OR IGNORE INTO problem_tags (problem_id,tag) VALUES (?,?)", ["problem-0172", "代数几何"]],
      ["INSERT OR IGNORE INTO problem_tags (problem_id,tag) VALUES (?,?)", ["problem-0172", "椭圆曲线"]],
      ["INSERT OR IGNORE INTO problem_tags (problem_id,tag) VALUES (?,?)", ["problem-0172", "有限域"]],
      ["INSERT OR IGNORE INTO problem_tags (problem_id,tag) VALUES (?,?)", ["problem-0165", "组合数学"]],
      ["INSERT OR IGNORE INTO problem_tags (problem_id,tag) VALUES (?,?)", ["problem-0165", "随机图"]],
      ["INSERT OR IGNORE INTO problem_tags (problem_id,tag) VALUES (?,?)", ["problem-0165", "概率论"]],
      ["INSERT OR IGNORE INTO problem_tags (problem_id,tag) VALUES (?,?)", ["problem-0158", "离散数学"]],
      ["INSERT OR IGNORE INTO problem_tags (problem_id,tag) VALUES (?,?)", ["problem-0158", "递推序列"]],
      ["INSERT OR IGNORE INTO problem_members (problem_id,member_id,relation,is_manager,joined_at) VALUES (?,?,?,?,?)", ["problem-0184", "member-xu-wen", "participating", 0, "2026-08-03T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO problem_members (problem_id,member_id,relation,is_manager,joined_at) VALUES (?,?,?,?,?)", ["problem-0184", "member-lin-cheng", "participating", 1, "2026-08-06T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO problem_members (problem_id,member_id,relation,is_manager,joined_at) VALUES (?,?,?,?,?)", ["problem-0184", "member-chen-yu", "participating", 0, "2026-08-09T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO problem_members (problem_id,member_id,relation,is_manager,joined_at) VALUES (?,?,?,?,?)", ["problem-0184", "member-zhou-lan", "participating", 0, "2026-08-08T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO problem_members (problem_id,member_id,relation,is_manager,joined_at) VALUES (?,?,?,?,?)", ["problem-0184", "member-song-xu", "participating", 0, "2026-08-05T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO problem_members (problem_id,member_id,relation,is_manager,joined_at) VALUES (?,?,?,?,?)", ["problem-0184", "member-fang-li", "participating", 0, "2026-08-04T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO problem_members (problem_id,member_id,relation,is_manager,joined_at) VALUES (?,?,?,?,?)", ["problem-0184", "member-ji-wen", "following", 0, "2026-08-10T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO problem_members (problem_id,member_id,relation,is_manager,joined_at) VALUES (?,?,?,?,?)", ["problem-0184", "member-gu-yao", "following", 0, "2026-08-09T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO problem_members (problem_id,member_id,relation,is_manager,joined_at) VALUES (?,?,?,?,?)", ["problem-0184", "member-wu-qi", "following", 0, "2026-08-07T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO problem_members (problem_id,member_id,relation,is_manager,joined_at) VALUES (?,?,?,?,?)", ["problem-0172", "member-lin-cheng", "participating", 0, "2026-07-28T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO problem_members (problem_id,member_id,relation,is_manager,joined_at) VALUES (?,?,?,?,?)", ["problem-0172", "member-fang-li", "participating", 0, "2026-07-30T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO problem_members (problem_id,member_id,relation,is_manager,joined_at) VALUES (?,?,?,?,?)", ["problem-0165", "member-gu-yao", "participating", 0, "2026-07-19T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO problem_members (problem_id,member_id,relation,is_manager,joined_at) VALUES (?,?,?,?,?)", ["problem-0158", "member-chen-yu", "participating", 0, "2026-06-30T08:00:00.000Z"]],
      ["INSERT OR IGNORE INTO messages (id,problem_id,parent_id,author_id,body,kind,is_adopted,upvotes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)", ["message-chen-root", "problem-0184", null, "member-chen-yu", "我先按 $n$ 的奇偶性拆开处理。奇数情形里两个因子都是偶数，直接使用互素性时需要先除去公共的 $2$。", "解法", 1, 12, "2026-08-11T02:24:00.000Z", "2026-08-11T02:24:00.000Z"]],
      ["INSERT OR IGNORE INTO messages (id,problem_id,parent_id,author_id,body,kind,is_adopted,upvotes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)", ["message-zhou-reply", "problem-0184", "message-chen-root", "member-zhou-lan", "同意。还可以先固定一个素数 $p$，比较 $n-1$ 与 $n+1$ 的 p-adic 估值，这样边界条件会更清楚。", "见解", 0, 8, "2026-08-11T03:08:00.000Z", "2026-08-11T03:08:00.000Z"]],
      ["INSERT OR IGNORE INTO messages (id,problem_id,parent_id,author_id,body,kind,is_adopted,upvotes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)", ["message-fang-reply", "problem-0184", "message-zhou-reply", "member-fang-li", "这里把 $p=2$ 单独列出即可。对奇素数，两个相邻因子的估值不会同时为正。", null, 0, 5, "2026-08-11T03:19:00.000Z", "2026-08-11T03:19:00.000Z"]],
      ["INSERT OR IGNORE INTO messages (id,problem_id,parent_id,author_id,body,kind,is_adopted,upvotes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)", ["message-chen-followup", "problem-0184", "message-fang-reply", "member-chen-yu", "好，我会把 2-adic 的情形写成一个单独的小引理。", null, 0, 2, "2026-08-11T03:26:00.000Z", "2026-08-11T03:26:00.000Z"]],
      ["INSERT OR IGNORE INTO messages (id,problem_id,parent_id,author_id,body,kind,is_adopted,upvotes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)", ["message-song-reply", "problem-0184", "message-chen-root", "member-song-xu", "我可以补一组数值实验，先看常数 $C$ 在小范围内的表现。", null, 0, 3, "2026-08-11T03:14:00.000Z", "2026-08-11T03:14:00.000Z"]],
      ["INSERT OR IGNORE INTO messages (id,problem_id,parent_id,author_id,body,kind,is_adopted,upvotes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)", ["message-xu-root", "problem-0184", null, "member-xu-wen", "先保留这两条路线。若能把常数 $C$ 与奇偶性无关地统一起来，就可以整理成一个独立引理。", "见解", 0, 9, "2026-08-11T03:32:00.000Z", "2026-08-11T03:32:00.000Z"]],
      ["INSERT OR IGNORE INTO messages (id,problem_id,parent_id,author_id,body,kind,is_adopted,upvotes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)", ["message-lin-reply", "problem-0184", "message-xu-root", "member-lin-cheng", "我来检查一下统一常数时是否需要额外使用大筛结论。", null, 0, 4, "2026-08-11T03:41:00.000Z", "2026-08-11T03:41:00.000Z"]],
      ["INSERT OR IGNORE INTO notifications (id,member_id,problem_id,kind,summary,created_at,read_at) VALUES (?,?,?,?,?,?,?)", ["notification-1", "member-xu-wen", "problem-0184", "reply", "周岚回复了陈屿的解法", "2026-08-11T03:08:00.000Z", null]],
      ["INSERT OR IGNORE INTO notifications (id,member_id,problem_id,kind,summary,created_at,read_at) VALUES (?,?,?,?,?,?,?)", ["notification-2", "member-xu-wen", "problem-0184", "discussion", "林澄补充了关于统一常数的检查计划", "2026-08-11T03:41:00.000Z", null]],
      ["INSERT OR IGNORE INTO notifications (id,member_id,problem_id,kind,summary,created_at,read_at) VALUES (?,?,?,?,?,?,?)", ["notification-3", "member-xu-wen", "problem-0172", "status", "问题状态更新为开放", "2026-08-10T06:30:00.000Z", null]],
    ];

    initialization = (async () => {
      const tableStatements = schemaStatements.filter((sql) => sql.startsWith("CREATE TABLE"));
      const indexStatements = schemaStatements.filter((sql) => !sql.startsWith("CREATE TABLE"));

      // The design prototype used a smaller `problems` table. Upgrade it in place so
      // existing local and hosted D1 databases remain usable after the formal rebuild.
      await db.batch(tableStatements.map((sql) => db.prepare(sql)));
      const [problemColumns, memberColumns, messageColumns] = await Promise.all([
        db.prepare("PRAGMA table_info(problems)").all<{ name: string }>(),
        db.prepare("PRAGMA table_info(members)").all<{ name: string }>(),
        db.prepare("PRAGMA table_info(messages)").all<{ name: string }>(),
      ]);
      const columnNames = new Set(problemColumns.results.map((column) => column.name));
      const memberColumnNames = new Set(memberColumns.results.map((column) => column.name));
      const messageColumnNames = new Set(messageColumns.results.map((column) => column.name));
      const legacyUpgrades: string[] = [];
      const addedLegacyProblemIdentity = !columnNames.has("short_code");
      if (!columnNames.has("short_code")) {
        legacyUpgrades.push("ALTER TABLE problems ADD COLUMN short_code TEXT NOT NULL DEFAULT ''");
      }
      if (!columnNames.has("creator_id")) {
        legacyUpgrades.push("ALTER TABLE problems ADD COLUMN creator_id TEXT NOT NULL DEFAULT 'member-xu-wen'");
      }
      if (!columnNames.has("updated_at")) {
        legacyUpgrades.push("ALTER TABLE problems ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
      }
      if (!columnNames.has("is_hidden")) {
        legacyUpgrades.push("ALTER TABLE problems ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0");
      }
      if (!columnNames.has("is_pinned")) {
        legacyUpgrades.push("ALTER TABLE problems ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0");
      }
      if (!memberColumnNames.has("account_status")) {
        legacyUpgrades.push("ALTER TABLE members ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'");
      }
      if (!memberColumnNames.has("registration_invite_code")) {
        legacyUpgrades.push("ALTER TABLE members ADD COLUMN registration_invite_code TEXT");
      }
      if (!memberColumnNames.has("avatar_key")) {
        legacyUpgrades.push("ALTER TABLE members ADD COLUMN avatar_key TEXT");
      }
      if (!memberColumnNames.has("avatar_updated_at")) {
        legacyUpgrades.push("ALTER TABLE members ADD COLUMN avatar_updated_at TEXT");
      }
      if (!messageColumnNames.has("is_hidden")) {
        legacyUpgrades.push("ALTER TABLE messages ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0");
      }
      if (legacyUpgrades.length) {
        await db.batch(legacyUpgrades.map((sql) => db.prepare(sql)));
        if (addedLegacyProblemIdentity) {
          await db.batch([
            db.prepare("UPDATE problems SET short_code = 'P-OLD-' || PRINTF('%04d', rowid) WHERE short_code = ''"),
            db.prepare("UPDATE problems SET updated_at = created_at WHERE updated_at = ''"),
          ]);
        }
      }

      await db.batch([
        ...indexStatements.map((sql) => db.prepare(sql)),
        ...seedStatements.map(([sql, values]) => db.prepare(sql).bind(...values)),
        db.prepare("PRAGMA optimize"),
      ]);
    })()
      .then(() => undefined)
      .catch((error) => {
        initialization = null;
        throw error;
      });
  }
  await initialization;
}

export function asString(value: unknown, max = 10_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function jsonArray(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
