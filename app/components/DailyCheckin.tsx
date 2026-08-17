"use client";

import { Atom, Brain, Languages, Music2, Sigma, SquareTerminal, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { getCachedJson, setCachedJson } from "../lib/client-cache";

type CheckinSymbol = "sigma" | "atom" | "terminal" | "languages" | "music" | "brain";
type CheckinRecord = { id: string; date: string; symbols: CheckinSymbol[]; createdAt: string };
type CheckinData = { today: CheckinRecord | null; recent: CheckinRecord[] };
type CheckinResult = { draw: CheckinRecord; recent: CheckinRecord[]; alreadyDrawn: boolean };
type Phase = "loading" | "idle" | "pulling" | "spinning" | "waiting" | "calendar";

const SYMBOLS: CheckinSymbol[] = ["sigma", "atom", "terminal", "languages", "music", "brain"];
const SYMBOL_ICONS: Record<CheckinSymbol, LucideIcon> = {
  sigma: Sigma,
  atom: Atom,
  terminal: SquareTerminal,
  languages: Languages,
  music: Music2,
  brain: Brain,
};
const REEL_ITEMS = Array.from({ length: 60 }, (_, index) => SYMBOLS[index % SYMBOLS.length]);
const REEL_HEIGHT = 54;

function SymbolIcon({ symbol }: { symbol: CheckinSymbol }) {
  const Icon = SYMBOL_ICONS[symbol];
  return <Icon aria-hidden="true" />;
}

type TimelineSlot =
  | { type: "period"; key: string; year: number | null; month: number }
  | { type: "draw"; key: string; record: CheckinRecord };

function dateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function calendarSlots(records: CheckinRecord[]): TimelineSlot[] {
  const ordered = [...records].sort((left, right) => left.date.localeCompare(right.date));
  const timeline: TimelineSlot[] = [];
  let previous: ReturnType<typeof dateParts> | null = null;
  for (const record of ordered) {
    const current = dateParts(record.date);
    if (!previous || previous.year !== current.year || previous.month !== current.month) {
      timeline.push({
        type: "period",
        key: `period-${record.date}`,
        year: !previous || previous.year !== current.year ? current.year : null,
        month: current.month,
      });
    }
    timeline.push({ type: "draw", key: record.id, record });
    previous = current;
  }
  let visible = timeline.slice(-15);
  if (visible[0]?.type === "draw") {
    const retained = visible.slice(1);
    const firstRecord = retained.find((slot): slot is Extract<TimelineSlot, { type: "draw" }> => slot.type === "draw");
    if (firstRecord) {
      const current = dateParts(firstRecord.record.date);
      visible = [{ type: "period", key: `period-visible-${firstRecord.record.date}`, year: current.year, month: current.month }, ...retained];
    }
  }
  return visible;
}

export function DailyCheckin({ memberId, readOnly = false }: { memberId?: string; readOnly?: boolean }) {
  const [phase, setPhaseState] = useState<Phase>("loading");
  const [recent, setRecent] = useState<CheckinRecord[]>([]);
  const [error, setError] = useState("");
  const phaseRef = useRef<Phase>("loading");
  const machineRef = useRef<HTMLButtonElement | null>(null);
  const reelRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const reelAnimations = useRef<Animation[]>([]);
  const leverStemRef = useRef<SVGPolygonElement | null>(null);
  const leverKnobRef = useRef<SVGCircleElement | null>(null);
  const leverFrame = useRef(0);
  const leverAngle = useRef(0);
  const leverHeld = useRef(false);
  const leverPullComplete = useRef(false);
  const startOnRelease = useRef(false);
  const drawStarted = useRef(false);
  const timers = useRef<number[]>([]);
  const cacheUrl = useMemo(() => {
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const query = new URLSearchParams({ day });
    if (readOnly && memberId) query.set("memberId", memberId);
    return `/api/checkin?${query.toString()}`;
  }, [memberId, readOnly]);

  const setPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };

  useEffect(() => {
    const controller = new AbortController();
    const activeTimers = timers.current;
    setPhase("loading");
    setError("");
    const applyResult = (result: CheckinData) => {
      if (controller.signal.aborted) return;
      // The POST publishes a real-time cache invalidation before its response
      // reaches this component. Do not let that background refresh interrupt an
      // in-flight lever/reel sequence; the POST result below owns the transition
      // until the final reel has stayed still for one second.
      if (phaseRef.current === "pulling" || phaseRef.current === "spinning" || phaseRef.current === "waiting") return;
      setRecent(result.recent);
      setPhase(readOnly || result.today ? "calendar" : "idle");
    };
    getCachedJson<CheckinData>(cacheUrl, { onUpdate: applyResult, revalidate: false })
      .then(applyResult)
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "签到记录读取失败");
        setPhase(readOnly ? "calendar" : "idle");
      });
    return () => {
      controller.abort();
      cancelAnimationFrame(leverFrame.current);
      reelAnimations.current.forEach((animation) => animation.cancel());
      activeTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [cacheUrl, readOnly]);

  const timeline = useMemo(() => calendarSlots(recent), [recent]);

  function drawLever(angle: number) {
    leverAngle.current = angle;
    const depth = Math.max(0, Math.sin(angle));
    const pivotY = 58;
    const length = 50;
    const knobY = pivotY - length * Math.cos(angle);
    const radius = 7 + 3 * depth;
    const direction = Math.sign(pivotY - knobY) || 1;
    const nearY = knobY + direction * radius * .72;
    const nearHalf = 3 + 2 * depth;
    const pivotHalf = 2;
    leverStemRef.current?.setAttribute("points", `${14 - nearHalf},${nearY} ${14 + nearHalf},${nearY} ${14 + pivotHalf},${pivotY} ${14 - pivotHalf},${pivotY}`);
    leverKnobRef.current?.setAttribute("cy", String(knobY));
    leverKnobRef.current?.setAttribute("r", String(radius));
  }

  function returnLever() {
    cancelAnimationFrame(leverFrame.current);
    const started = performance.now();
    const start = leverAngle.current;
    const duration = 390;
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const cosine = (1 + Math.cos(Math.PI * progress)) / 2;
      const recoil = .09 * Math.sin(3 * Math.PI * progress) * (1 - progress);
      drawLever(start * (cosine + recoil));
      if (progress < 1) leverFrame.current = requestAnimationFrame(step);
    };
    leverFrame.current = requestAnimationFrame(step);
  }

  function startReelLoops() {
    reelAnimations.current.forEach((animation) => animation.cancel());
    reelAnimations.current = reelRefs.current.flatMap((strip, index) => {
      if (!strip) return [];
      strip.style.transition = "none";
      strip.style.transform = "translate3d(0,0,0)";
      return [strip.animate(
        [{ transform: "translate3d(0,0,0)" }, { transform: `translate3d(0,-${REEL_HEIGHT * SYMBOLS.length}px,0)` }],
        { duration: 420 + index * 65, iterations: Infinity, easing: "linear" },
      )];
    });
  }

  function settleReels(symbols: CheckinSymbol[]) {
    reelRefs.current.forEach((strip, index) => {
      if (!strip) return;
      const currentTransform = getComputedStyle(strip).transform;
      reelAnimations.current[index]?.cancel();
      strip.style.transition = "none";
      strip.style.transform = currentTransform === "none" ? "translate3d(0,0,0)" : currentTransform;
      void strip.offsetHeight;
      const symbolIndex = Math.max(0, SYMBOLS.indexOf(symbols[index]));
      const finalIndex = 48 + symbolIndex;
      strip.style.transition = `transform ${1_150 + index * 300}ms cubic-bezier(.12,.68,.16,1) ${index * 80}ms`;
      strip.style.transform = `translate3d(0,-${finalIndex * REEL_HEIGHT}px,0)`;
    });
  }

  async function spin() {
    if (drawStarted.current) return;
    drawStarted.current = true;
    setError("");
    setPhase("spinning");
    startReelLoops();
    const started = performance.now();
    try {
      const response = await fetch("/api/checkin", { method: "POST", credentials: "same-origin" });
      const result = await response.json() as CheckinResult & { message?: string };
      if (!response.ok) throw new Error(result.message ?? "签到失败，请稍后重试");
      const minimumSpin = Math.max(0, 420 - (performance.now() - started));
      if (minimumSpin) await new Promise((resolve) => window.setTimeout(resolve, minimumSpin));
      setRecent(result.recent);
      setCachedJson(cacheUrl, { today: result.draw, recent: result.recent } satisfies CheckinData);
      settleReels(result.draw.symbols);
      await new Promise((resolve) => {
        const timer = window.setTimeout(resolve, 2_100);
        timers.current.push(timer);
      });
      setPhase("waiting");
      const timer = window.setTimeout(() => setPhase("calendar"), 1_000);
      timers.current.push(timer);
    } catch (caught) {
      reelAnimations.current.forEach((animation) => animation.cancel());
      setError(caught instanceof Error ? caught.message : "签到失败，请稍后重试");
      drawStarted.current = false;
      setPhase("idle");
    }
  }

  function finishPull() {
    if (phaseRef.current !== "pulling") return;
    returnLever();
    if (startOnRelease.current) void spin();
    else setPhase("idle");
  }

  function beginPull() {
    if (phaseRef.current !== "idle") return;
    setPhase("pulling");
    leverHeld.current = true;
    leverPullComplete.current = false;
    startOnRelease.current = true;
    cancelAnimationFrame(leverFrame.current);
    const started = performance.now();
    const start = leverAngle.current;
    const target = 112 * Math.PI / 180;
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / 230);
      drawLever(start + (target - start) * Math.sin(progress * Math.PI / 2));
      if (progress < 1) leverFrame.current = requestAnimationFrame(step);
      else {
        leverPullComplete.current = true;
        if (!leverHeld.current) finishPull();
      }
    };
    leverFrame.current = requestAnimationFrame(step);
  }

  function releasePull(shouldDraw: boolean) {
    if (phaseRef.current !== "pulling") return;
    leverHeld.current = false;
    startOnRelease.current = shouldDraw;
    if (leverPullComplete.current) finishPull();
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || phaseRef.current !== "idle") return;
    event.preventDefault();
    machineRef.current?.setPointerCapture(event.pointerId);
    beginPull();
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (machineRef.current?.hasPointerCapture(event.pointerId)) machineRef.current.releasePointerCapture(event.pointerId);
    releasePull(true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if ((event.key !== "Enter" && event.key !== " ") || phaseRef.current !== "idle") return;
    event.preventDefault();
    beginPull();
    leverHeld.current = false;
  }

  const machine = () => (
    <button
      aria-disabled={phase !== "idle"}
      aria-label="每日签到"
      className={`daily-slot-machine${phase === "spinning" ? " spinning" : phase === "waiting" ? " waiting" : ""}`}
      onKeyDown={onKeyDown}
      onPointerCancel={() => releasePull(false)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      ref={machineRef}
      type="button"
    >
      <span className="daily-reel-window">
        {[0, 1, 2].map((reel) => <span className="daily-reel-viewport" key={reel}>
          {(phase === "idle" || phase === "pulling") && <span className="daily-reel-placeholder">?</span>}
          <span className="daily-reel-strip" ref={(element) => { reelRefs.current[reel] = element; }}>
            {REEL_ITEMS.map((symbol, index) => <i key={`${reel}-${index}`}><SymbolIcon symbol={symbol} /></i>)}
          </span>
        </span>)}
      </span>
      <svg className="daily-machine-handle" viewBox="0 0 28 90" aria-hidden="true">
        <polygon ref={leverStemRef} points="11,14 17,14 15,58 13,58" />
        <circle ref={leverKnobRef} cx="14" cy="8" r="7" />
      </svg>
    </button>
  );

  if (readOnly && phase === "calendar" && recent.length === 0 && !error) return null;

  return <section aria-busy={phase === "loading"} aria-label="每日签到" className="profile-daily-checkin">
    {(phase === "idle" || phase === "pulling" || phase === "spinning" || phase === "waiting") && machine()}
    {phase === "calendar" && <div className="daily-checkin-calendar">
      {timeline.map((slot) => slot.type === "period"
        ? <span className="daily-period-marker" key={slot.key}>{slot.year && <b>{slot.year}</b>}<i>{String(slot.month).padStart(2, "0")}</i></span>
        : <span className="daily-draw-record" key={slot.key}>
          <time>{String(dateParts(slot.record.date).day).padStart(2, "0")}</time>
          <span>{slot.record.symbols.map((symbol, index) => <i key={`${symbol}-${index}`}><SymbolIcon symbol={symbol} /></i>)}</span>
        </span>)}
    </div>}
    {error && <p className="daily-checkin-error" role="status">{error}</p>}
  </section>;
}
