"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarDays, Clock3, Plus, Search, SlidersHorizontal } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSession } from "../hooks/useSession";
import { fullDate, relativeTime } from "../lib/format";
import type { ProblemCard } from "../lib/types";
import { MarkdownContent } from "./MarkdownContent";
import { MemberAvatar } from "./MemberAvatar";
import { SiteHeader } from "./SiteHeader";

type Filters = { tags: string[]; statuses: string[]; relations: string[]; updated: string[] };

const relationLabels: Record<string, string> = { watching: "旁观", following: "关注", participating: "参与" };
const updatedLabels: Record<string, string> = { "1d": "24 小时内", "7d": "7 天内", "30d": "30 天内" };

export function ProblemsScreen() {
  const { member } = useSession();
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [filters, setFilters] = useState<Filters>({ tags: [], statuses: [], relations: [], updated: [] });
  const [problems, setProblems] = useState<ProblemCard[]>([]);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q") ?? "";
    setQuery(initial);
    setAppliedQuery(initial);
    Promise.all([
      fetch(`/api/problems?q=${encodeURIComponent(initial)}`).then((response) => response.json() as Promise<{ problems?: ProblemCard[]; message?: string }>),
      fetch("/api/tags").then((response) => response.json() as Promise<{ tags?: string[] }>),
    ]).then(([problemData, tagData]) => {
      setProblems(problemData.problems ?? []);
      setKnownTags(tagData.tags ?? []);
      if (problemData.message) setMessage(problemData.message);
    }).catch(() => setMessage("暂时无法读取问题")).finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => problems.filter((problem) => {
    const target = appliedQuery.trim().toLocaleLowerCase();
    if (target && ![problem.title, problem.summary, ...problem.tags].some((value) => value.toLocaleLowerCase().includes(target))) return false;
    if (filters.tags.length && !filters.tags.some((tag) => problem.tags.includes(tag))) return false;
    if (filters.statuses.length && !filters.statuses.includes(problem.status)) return false;
    if (filters.relations.length && !filters.relations.includes(problem.viewerRelation)) return false;
    if (filters.updated.length) {
      const age = (now - new Date(problem.updatedAt).getTime()) / 86_400_000;
      if (!filters.updated.some((value) => value === "1d" ? age <= 1 : value === "7d" ? age <= 7 : age <= 30)) return false;
    }
    return true;
  }), [appliedQuery, filters, now, problems]);

  function toggle(group: keyof Filters, value: string) {
    setFilters((current) => ({
      ...current,
      [group]: group === "updated"
        ? (current.updated.includes(value) ? [] : [value])
        : current[group].includes(value) ? current[group].filter((item) => item !== value) : [...current[group], value],
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = query.trim();
    setAppliedQuery(next);
    window.history.replaceState(null, "", next ? `/problems?q=${encodeURIComponent(next)}` : "/problems");
  }

  const groups: Array<{ key: keyof Filters; label: string; options: Array<{ value: string; label: string }> }> = [
    { key: "tags", label: "标签", options: knownTags.slice(0, 10).map((tag) => ({ value: tag, label: tag })) },
    { key: "statuses", label: "状态", options: ["开放", "已解决"].map((value) => ({ value, label: value })) },
    { key: "relations", label: "参与", options: Object.entries(relationLabels).map(([value, label]) => ({ value, label })) },
    { key: "updated", label: "推进时间", options: Object.entries(updatedLabels).map(([value, label]) => ({ value, label })) },
  ];

  return (
    <div className="site-shell">
      <SiteHeader active="problems" />
      <main className="problems-page">
        <section className="problems-heading">
          <div><h1>难题</h1><p>浏览、筛选并参与尚待推进的数学问题。</p></div>
          {member && <Link href="/problems/new"><Plus aria-hidden="true" size={15} />发布问题</Link>}
        </section>

        <form className="problem-search" onSubmit={submit}>
          <label><span className="sr-only">搜索数学问题</span><input onChange={(event) => setQuery(event.target.value)} placeholder="输入问题、标签或关键词" value={query} /></label>
          <button type="submit"><Search aria-hidden="true" size={16} />搜索</button>
        </form>

        <details className="filter-panel">
          <summary><span><SlidersHorizontal aria-hidden="true" size={15} />筛选</span><span>{loading ? "读取中…" : `${visible.length} 个结果`}</span></summary>
          <div className="filter-grid">
            {groups.map((group) => (
              <fieldset key={group.key}>
                <legend>{group.label}</legend>
                <div>{group.options.map((option) => (
                  <label key={option.value}><input
                    checked={filters[group.key].includes(option.value)}
                    name={group.key === "updated" ? "updated-window" : undefined}
                    onChange={() => {
                      if (group.key !== "updated" || !filters.updated.includes(option.value)) toggle(group.key, option.value);
                    }}
                    onClick={() => {
                      if (group.key === "updated" && filters.updated.includes(option.value)) toggle(group.key, option.value);
                    }}
                    type={group.key === "updated" ? "radio" : "checkbox"}
                  /><span>{option.label}</span></label>
                ))}</div>
              </fieldset>
            ))}
          </div>
        </details>

        <p className="page-message" aria-live="polite">{message}</p>
        <section className="problem-results" aria-busy={loading} aria-label="难题列表">
          {visible.map((problem) => {
            const href = member ? `/problems/${problem.id}` : `/login?returnTo=${encodeURIComponent(`/problems/${problem.id}`)}`;
            return (
              <Link className="problem-result" href={href} key={problem.id}>
                <div>
                  <p><code>{problem.shortCode}</code>{problem.isPinned && <b className="pinned-label">置顶</b>}<span>{problem.tags.join(" · ") || "未标记"}</span></p>
                  <h2>{problem.title}</h2>
                  <MarkdownContent className="result-summary" compact source={problem.summary} />
                  <footer><span><CalendarDays aria-hidden="true" size={13} />创建于 {fullDate(problem.createdAt)}</span><span><Clock3 aria-hidden="true" size={13} />{relativeTime(problem.updatedAt)}推进</span></footer>
                </div>
                {problem.status === "开放" ? <span className="result-status"><i />开放</span> : <span />}
                <span className="result-avatars">{problem.participantAvatars.map((person) => <MemberAvatar avatarUpdatedAt={person.avatarUpdatedAt} className="result-avatar" initials={person.initials} key={person.id} memberId={person.id} />)}</span>
                <ArrowUpRight aria-hidden="true" size={16} />
              </Link>
            );
          })}
          {!loading && !visible.length && <p className="empty-state">没有找到匹配的问题，换个标签或关键词试试。</p>}
        </section>
      </main>
    </div>
  );
}
