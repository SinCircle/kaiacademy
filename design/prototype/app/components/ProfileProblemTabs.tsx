"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export type ProfileProblem = {
  id: string;
  title: string;
  detail: string;
};

export type ProfileProblemGroup = {
  key: string;
  label: string;
  items: ProfileProblem[];
};

export function ProfileProblemTabs({ groups }: { groups: ProfileProblemGroup[] }) {
  const [activeKey, setActiveKey] = useState(groups[0].key);
  const activeGroup = groups.find((group) => group.key === activeKey) ?? groups[0];

  return (
    <section className="profile-problem-tabs" aria-label="个人问题列表">
      <div className="profile-tablist" role="tablist" aria-label="问题分类">
        {groups.map((group) => (
          <button
            aria-controls="profile-problem-panel"
            aria-selected={activeKey === group.key}
            className={activeKey === group.key ? "active" : ""}
            key={group.key}
            onClick={() => setActiveKey(group.key)}
            role="tab"
            type="button"
          >
            <span>{group.label}</span>
            <small>{group.items.length}</small>
          </button>
        ))}
      </div>

      <div className="profile-problem-list" id="profile-problem-panel" role="tabpanel">
        {activeGroup.items.map((problem) => (
          <Link href="/problems/split" key={`${problem.id}-${problem.detail}`}>
            <span>{problem.id}</span>
            <div><b>{problem.title}</b><p>{problem.detail}</p></div>
            <ArrowUpRight aria-hidden="true" size={16} />
          </Link>
        ))}
      </div>
    </section>
  );
}
