import { AppError } from "./errors";
import { database, ensureDatabase } from "./runtime";

export const CHECKIN_SYMBOLS = ["sigma", "atom", "terminal", "languages", "music", "brain"] as const;
export type CheckinSymbol = (typeof CHECKIN_SYMBOLS)[number];

type CheckinRow = {
  id: string;
  drawDate: string;
  symbols: string;
  createdAt: string;
};

export type CheckinRecord = {
  id: string;
  date: string;
  symbols: CheckinSymbol[];
  createdAt: string;
};

function beijingDate(now = Date.now()) {
  return new Date(now + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function parseSymbols(value: string): CheckinSymbol[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== 3) return [];
    const symbols = parsed.filter((item): item is CheckinSymbol =>
      typeof item === "string" && CHECKIN_SYMBOLS.includes(item as CheckinSymbol));
    return symbols.length === 3 ? symbols : [];
  } catch {
    return [];
  }
}

function recordFromRow(row: CheckinRow): CheckinRecord {
  return { id: row.id, date: row.drawDate, symbols: parseSymbols(row.symbols), createdAt: row.createdAt };
}

async function todayRecord(memberId: string, date: string) {
  const row = await database().prepare(`SELECT id,draw_date AS drawDate,symbols,created_at AS createdAt
    FROM daily_checkins WHERE member_id = ? AND draw_date = ?`)
    .bind(memberId, date).first<CheckinRow>();
  return row ? recordFromRow(row) : null;
}

async function recentRecords(memberId: string) {
  const rows = await database().prepare(`SELECT id,draw_date AS drawDate,symbols,created_at AS createdAt
    FROM daily_checkins WHERE member_id = ? ORDER BY draw_date DESC,created_at DESC LIMIT 15`)
    .bind(memberId).all<CheckinRow>();
  return rows.results.map(recordFromRow).filter((record) => record.symbols.length === 3);
}

export async function getDailyCheckin(memberId: string) {
  await ensureDatabase();
  const date = beijingDate();
  const [today, recent] = await Promise.all([todayRecord(memberId, date), recentRecords(memberId)]);
  return { today, recent };
}

function drawSymbols(): CheckinSymbol[] {
  const values = new Uint32Array(3);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => CHECKIN_SYMBOLS[value % CHECKIN_SYMBOLS.length]);
}

export async function drawDailyCheckin(memberId: string) {
  await ensureDatabase();
  const date = beijingDate();
  const existing = await todayRecord(memberId, date);
  if (existing) return { draw: existing, recent: await recentRecords(memberId), alreadyDrawn: true };

  const draw: CheckinRecord = {
    id: `checkin-${crypto.randomUUID()}`,
    date,
    symbols: drawSymbols(),
    createdAt: new Date().toISOString(),
  };
  try {
    await database().prepare(`INSERT INTO daily_checkins (id,member_id,draw_date,symbols,created_at)
      VALUES (?,?,?,?,?)`).bind(draw.id, memberId, draw.date, JSON.stringify(draw.symbols), draw.createdAt).run();
  } catch (error) {
    const concurrent = await todayRecord(memberId, date);
    if (concurrent) return { draw: concurrent, recent: await recentRecords(memberId), alreadyDrawn: true };
    throw error;
  }
  const recent = await recentRecords(memberId);
  if (!recent.some((record) => record.id === draw.id)) throw new AppError("签到结果保存失败", 500);
  return { draw, recent, alreadyDrawn: false };
}
