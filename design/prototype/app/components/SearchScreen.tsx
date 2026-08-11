"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CalendarDays, ChevronDown, Clock3, Plus, Search, SlidersHorizontal } from "lucide-react";
import { SiteHeader } from "./SiteHeader";

interface SearchResult {
  id: string;
  title: string;
  tags: string[];
  status: string;
  created: string;
  updated?: string;
  people?: string[];
}

const sampleResults: SearchResult[] = [
  {
    id: "0184",
    title: "平方数相邻差的素因子结构",
    tags: ["数论", "素数", "整除性"],
    status: "进行中",
    created: "2026-08-03",
    updated: "2 小时前",
    people: ["陈", "周", "宋"],
  },
  {
    id: "0172",
    title: "有限域上椭圆曲线的点数估计",
    tags: ["代数几何", "椭圆曲线", "有限域"],
    status: "开放",
    created: "2026-07-28",
    updated: "昨天",
    people: ["林", "方"],
  },
  {
    id: "0165",
    title: "随机图中局部稀疏与整体连通性的阈值",
    tags: ["组合数学", "随机图", "概率论"],
    status: "进行中",
    created: "2026-07-19",
    updated: "3 天前",
    people: ["顾", "吴", "季", "+2"],
  },
  {
    id: "0158",
    title: "一类非线性递推序列的周期判定",
    tags: ["离散数学", "递推序列"],
    status: "已解决",
    created: "2026-06-30",
    updated: "2026-08-01",
    people: ["许"],
  },
];

const filterGroups = [
  {
    name: "标签",
    options: ["数论", "代数", "几何", "分析", "组合"],
    selected: ["数论"],
  },
  {
    name: "状态",
    options: ["开放", "进行中", "已解决"],
    selected: ["开放", "进行中"],
  },
  {
    name: "参与",
    options: ["有人参与", "无人参与", "我已参与"],
    selected: [],
  },
  {
    name: "推进时间",
    options: ["24 小时内", "7 天内", "30 天内"],
    selected: ["7 天内"],
  },
];

function matchesQuery(result: SearchResult, query: string) {
  const target = query.trim().toLocaleLowerCase();
  if (!target) return true;
  return [result.title, ...result.tags].some((value) => value.toLocaleLowerCase().includes(target));
}

export function ProblemsScreen() {
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [storedResults, setStoredResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchMessage, setSearchMessage] = useState("");

  async function runSearch(nextQuery: string) {
    setLoading(true);
    setSearchMessage("");
    try {
      const response = await fetch(`/api/problems?q=${encodeURIComponent(nextQuery)}`);
      const data = await response.json() as { problems?: SearchResult[]; message?: string };
      if (!response.ok) throw new Error(data.message ?? "搜索失败");
      setStoredResults(data.problems ?? []);
    } catch (error) {
      setStoredResults([]);
      setSearchMessage(error instanceof Error ? error.message : "搜索失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialQuery = new URLSearchParams(window.location.search).get("q") ?? "";
    queueMicrotask(() => {
      setQuery(initialQuery);
      setAppliedQuery(initialQuery);
      void runSearch(initialQuery);
    });
  }, []);

  const results = useMemo(() => {
    const combined = [...storedResults, ...sampleResults.filter((result) => matchesQuery(result, appliedQuery))];
    return combined.filter((result, index) => combined.findIndex((item) => item.id === result.id) === index);
  }, [appliedQuery, storedResults]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = query.trim();
    setAppliedQuery(nextQuery);
    window.history.replaceState(null, "", nextQuery ? `/problems?q=${encodeURIComponent(nextQuery)}` : "/problems");
    void runSearch(nextQuery);
  }

  return (
    <div className="site-shell">
      <SiteHeader active="problems" />
      <main className="search-page">
        <section className="search-hero">
          <div className="search-heading">
            <div className="problems-titlebar">
              <div><h1>难题</h1><p>浏览、筛选并参与尚待推进的数学问题。</p></div>
              <Link href="/problems/new"><Plus aria-hidden="true" size={15} />发布问题</Link>
            </div>
            <form className="search-form" onSubmit={submitSearch}>
              <label>
                <span className="sr-only">搜索数学问题</span>
                <input onChange={(event) => setQuery(event.target.value)} placeholder="输入问题、标签或关键词" value={query} />
              </label>
              <button type="submit"><Search aria-hidden="true" size={16} />搜索</button>
            </form>
          </div>
        </section>

        <details className="search-filters">
          <summary className="filter-header">
            <span><SlidersHorizontal aria-hidden="true" size={15} />筛选</span>
            <span className="filter-summary-meta">
              <span className="result-count">{loading ? "搜索中…" : `${results.length} 个结果`}</span>
              <ChevronDown className="filter-chevron" aria-hidden="true" size={15} />
            </span>
          </summary>
          <form className="filter-groups" aria-label="搜索筛选">
            {filterGroups.map((group) => (
              <div className="filter-group" key={group.name} role="group" aria-labelledby={`filter-${group.name}`}>
                <span className="filter-group-name" id={`filter-${group.name}`}>{group.name}</span>
                <div>
                  {group.options.map((option) => (
                    <label key={option}>
                      <input defaultChecked={group.selected.includes(option)} name={group.name} type="checkbox" value={option} />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </form>
        </details>

        <p aria-live="polite" className="search-status">{searchMessage}</p>
        <section className="result-list" aria-label="难题列表" aria-busy={loading}>
          {results.map((result) => (
            <Link className="result-row" href="/problems/split" key={result.id}>
              <div className="result-copy">
                <p>P-{result.id.slice(0, 4).toUpperCase()} / {result.tags.join(" · ") || "未标记"}</p>
                <h2>{result.title}</h2>
                <div className="result-meta">
                  <span className="result-meta-item"><CalendarDays aria-hidden="true" size={13} /><span>创建于 {result.created.slice(0, 10)}</span></span>
                  <span className="result-meta-item"><Clock3 aria-hidden="true" size={13} /><span>最新推进 {result.updated ?? "刚刚"}</span></span>
                </div>
              </div>
              <div className="result-state"><i />{result.status}</div>
              <div className="result-people" aria-label={`${result.people?.length ?? 0} 位参与者`}>
                {(result.people ?? []).map((person) => <i key={person}>{person}</i>)}
              </div>
              <ArrowUpRight className="result-arrow" aria-hidden="true" size={16} />
            </Link>
          ))}
          {!loading && results.length === 0 && <p className="empty-results">没有找到匹配的问题，换个标签或关键词试试。</p>}
        </section>
      </main>
    </div>
  );
}
