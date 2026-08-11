"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

const knownTags = [
  "数论", "代数", "几何", "分析", "组合", "代数几何", "组合数学", "离散数学",
  "素数", "整除性", "丢番图方程", "椭圆曲线", "随机图", "递推序列", "概率论", "拓扑",
];

function fuzzyScore(value: string, query: string) {
  const candidate = value.toLocaleLowerCase();
  const target = query.toLocaleLowerCase();
  if (!target) return 1;
  if (candidate.startsWith(target)) return 100 - candidate.length;
  const includedAt = candidate.indexOf(target);
  if (includedAt >= 0) return 70 - includedAt;
  let cursor = 0;
  for (const character of target) {
    cursor = candidate.indexOf(character, cursor);
    if (cursor < 0) return -1;
    cursor += 1;
  }
  return 30 - candidate.length;
}

export function TagCombobox({ value, onChange }: { value: string[]; onChange(tags: string[]): void }) {
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [storedTags, setStoredTags] = useState<string[]>([]);
  const allTags = useMemo(() => [...new Set([...knownTags, ...storedTags])], [storedTags]);

  useEffect(() => {
    fetch("/api/tags")
      .then((response) => response.json() as Promise<{ tags?: string[] }>)
      .then((data) => setStoredTags(data.tags ?? []))
      .catch(() => undefined);
  }, []);

  const options = useMemo(() => {
    const normalized = query.trim();
    const matches = allTags
      .filter((tag) => !value.includes(tag))
      .map((tag) => ({ tag, score: fuzzyScore(tag, normalized) }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 7)
      .map((item) => item.tag);
    if (normalized && !allTags.some((tag) => tag.toLocaleLowerCase() === normalized.toLocaleLowerCase()) && !value.includes(normalized)) {
      matches.push(normalized);
    }
    return matches;
  }, [allTags, query, value]);

  function addTag(tag: string) {
    const normalized = tag.trim().replace(/\s+/g, " ").slice(0, 24);
    if (!normalized || value.includes(normalized) || value.length >= 8) return;
    onChange([...value, normalized]);
    setQuery("");
    setOpen(true);
  }

  return (
    <div className="editor-field tag-field">
      <label htmlFor={inputId}>领域与标签</label>
      <div className="tag-combobox">
        <div className="tag-input-shell">
          {value.map((tag) => (
            <span className="tag-chip" key={tag}>
              {tag}
              <button aria-label={`移除标签 ${tag}`} onClick={() => onChange(value.filter((item) => item !== tag))} type="button">
                <X aria-hidden="true" size={11} />
              </button>
            </span>
          ))}
          <input
            aria-activedescendant={open && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={open}
            autoComplete="off"
            id={inputId}
            onBlur={() => window.setTimeout(() => setOpen(false), 100)}
            onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && options.length) {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((index) => (index + 1) % options.length);
              } else if (event.key === "ArrowUp" && options.length) {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((index) => (index - 1 + options.length) % options.length);
              } else if (event.key === "Enter" && (query.trim() || (open && options.length))) {
                event.preventDefault();
                addTag(options[activeIndex] ?? query);
              } else if (event.key === "Backspace" && !query && value.length) {
                onChange(value.slice(0, -1));
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={value.length ? "继续添加" : "输入领域或标签，按回车确认"}
            role="combobox"
            value={query}
          />
        </div>
        {open && options.length > 0 && (
          <div className="tag-suggestions" id={listId} role="listbox">
            {options.map((option, index) => {
              const isNew = !allTags.includes(option);
              return (
                <button
                  aria-selected={index === activeIndex}
                  className={index === activeIndex ? "active" : undefined}
                  id={`${listId}-${index}`}
                  key={option}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => addTag(option)}
                  role="option"
                  type="button"
                >
                  <span>{option}</span>
                  {isNew && <small><Plus aria-hidden="true" size={11} />创建新标签</small>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <small className="tag-field-help">最多 8 个标签；可用方向键选择，回车确认。</small>
    </div>
  );
}
