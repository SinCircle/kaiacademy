"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

function fuzzyScore(candidate: string, query: string) {
  const value = candidate.toLocaleLowerCase();
  const target = query.toLocaleLowerCase();
  if (!target) return 1;
  if (value.startsWith(target)) return 100 - value.length;
  const included = value.indexOf(target);
  if (included >= 0) return 70 - included;
  let cursor = 0;
  for (const character of target) {
    cursor = value.indexOf(character, cursor);
    if (cursor < 0) return -1;
    cursor += 1;
  }
  return 30 - value.length;
}

export function TagCombobox({ value, onChange }: { value: string[]; onChange(tags: string[]): void }) {
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [knownTags, setKnownTags] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/tags").then((response) => response.json() as Promise<{ tags?: string[] }>).then((data) => setKnownTags(data.tags ?? [])).catch(() => undefined);
  }, []);

  const options = useMemo(() => {
    const normalized = query.trim();
    const matches = knownTags
      .filter((tag) => !value.includes(tag))
      .map((tag) => ({ tag, score: fuzzyScore(tag, normalized) }))
      .filter((item) => item.score >= 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 7)
      .map((item) => item.tag);
    if (normalized && !knownTags.some((tag) => tag.toLocaleLowerCase() === normalized.toLocaleLowerCase()) && !value.includes(normalized)) matches.push(normalized);
    return matches;
  }, [knownTags, query, value]);

  function add(tag: string) {
    const clean = tag.trim().replace(/\s+/g, " ").slice(0, 24);
    if (!clean || value.includes(clean) || value.length >= 8) return;
    onChange([...value, clean]);
    setQuery("");
    setOpen(true);
    setActiveIndex(0);
  }

  return (
    <div className="tag-field">
      <label htmlFor={inputId}>领域与标签</label>
      <div className="tag-combobox">
        <div className="tag-input-shell">
          {value.map((tag) => <span className="tag-chip" key={tag}>{tag}<button aria-label={`移除标签 ${tag}`} onClick={() => onChange(value.filter((item) => item !== tag))} type="button"><X aria-hidden="true" size={11} /></button></span>)}
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
              if (event.key === "ArrowDown" && options.length) { event.preventDefault(); setActiveIndex((index) => (index + 1) % options.length); }
              else if (event.key === "ArrowUp" && options.length) { event.preventDefault(); setActiveIndex((index) => (index - 1 + options.length) % options.length); }
              else if (event.key === "Enter" && (query.trim() || options.length)) { event.preventDefault(); add(options[activeIndex] ?? query); }
              else if (event.key === "Backspace" && !query && value.length) onChange(value.slice(0, -1));
              else if (event.key === "Escape") setOpen(false);
            }}
            placeholder={value.length ? "继续添加" : "输入标签，按回车确认"}
            role="combobox"
            value={query}
          />
        </div>
        {open && options.length > 0 && <div className="tag-options" id={listId} role="listbox">{options.map((option, index) => (
          <button aria-selected={index === activeIndex} className={index === activeIndex ? "active" : ""} id={`${listId}-${index}`} key={option} onClick={() => add(option)} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} role="option" type="button"><span>{option}</span>{!knownTags.includes(option) && <small><Plus aria-hidden="true" size={11} />创建新标签</small>}</button>
        ))}</div>}
      </div>
      <small>最多 8 个标签；可用方向键选择，回车确认。</small>
    </div>
  );
}
