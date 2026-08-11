"use client";

import Link from "next/link";
import {
  BadgeCheck,
  Bell,
  Crown,
  Eye,
  LockKeyhole,
  MoreHorizontal,
  ShieldCheck,
  ShieldOff,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

const currentUserName = "许闻";

const initialParticipants = [
  { id: "xw", initials: "XW", name: "许闻", field: "解析数论", joined: "8 月 3 日", role: "creator" as const },
  { id: "lc", initials: "LC", name: "林澄", field: "代数数论", joined: "8 月 6 日", role: "manager" as const },
  { id: "cy", initials: "CY", name: "陈屿", field: "初等数论", joined: "8 月 9 日", role: "member" as const },
  { id: "zl", initials: "ZL", name: "周岚", field: "p-adic 分析", joined: "8 月 8 日", role: "member" as const },
  { id: "sx", initials: "SX", name: "宋叙", field: "计算数论", joined: "8 月 5 日", role: "member" as const },
  { id: "fl", initials: "FL", name: "方理", field: "代数数论", joined: "8 月 4 日", role: "member" as const },
];

const followers = [
  { id: "jw", initials: "JW", name: "季文", field: "解析数论", joined: "8 月 10 日" },
  { id: "gy", initials: "GY", name: "顾遥", field: "组合数学", joined: "8 月 9 日" },
  { id: "wq", initials: "WQ", name: "吴琦", field: "代数", joined: "8 月 7 日" },
];

const relationshipOrder = ["watching", "following", "participating"] as const;
type RelationshipStatus = typeof relationshipOrder[number];

const relationshipLabels: Record<RelationshipStatus, string> = {
  participating: "参与",
  following: "关注",
  watching: "旁观",
};

export function ParticipantPanel({ acceptedNames }: { acceptedNames: ReadonlySet<string> }) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const currentParticipant = participants.find((person) => person.name === currentUserName);
  const relationshipLockReason = currentParticipant?.role === "creator"
    ? "创建者必须保持参与状态"
    : currentParticipant?.role === "manager"
      ? "管理员必须保持参与状态"
      : acceptedNames.has(currentUserName)
        ? "内容被采纳后必须保持参与状态"
        : null;
  const relationshipLocked = relationshipLockReason !== null;
  const [relationshipStatus, setRelationshipStatus] = useState<RelationshipStatus>(relationshipLocked ? "participating" : "watching");

  useEffect(() => {
    if (relationshipLocked) setRelationshipStatus("participating");
  }, [relationshipLocked]);

  function toggleManager(personId: string) {
    setParticipants((current) => current.map((person) => person.id === personId && person.role !== "creator"
      ? { ...person, role: person.role === "manager" ? "member" as const : "manager" as const }
      : person));
    setActiveMenuId(null);
  }

  function cycleRelationshipStatus() {
    if (relationshipLocked) return;
    setRelationshipStatus((current) => {
      const currentIndex = relationshipOrder.indexOf(current);
      return relationshipOrder[(currentIndex + 1) % relationshipOrder.length];
    });
  }

  const nextRelationshipStatus = relationshipOrder[(relationshipOrder.indexOf(relationshipStatus) + 1) % relationshipOrder.length];

  return (
    <section className="participant-panel" aria-labelledby="participant-panel-title">
      <div className="sidebar-people-group">
        <header className="participant-panel-heading">
          <Users aria-hidden="true" size={15} />
          <div><b id="participant-panel-title">参与者</b><span>共同推进这个问题</span></div>
          <strong>{String(participants.length).padStart(2, "0")}</strong>
        </header>
        <div className="participant-panel-list">
          {participants.map((person) => (
            <article className="participant-row" key={person.id}>
              <Link className="participant-identity" href="/profile">
                <i>{person.initials}</i>
                <div><b>{person.name}</b><span>{person.field} · {person.joined}</span></div>
              </Link>
              <div className="participant-role-icons">
                {person.role === "creator" && <Crown aria-label="创建者" size={15} />}
                {person.role === "manager" && <ShieldCheck aria-label="管理" size={15} />}
                {acceptedNames.has(person.name) && <BadgeCheck aria-label="内容被采纳" size={15} />}
                {person.role !== "creator" && (
                  <button aria-label={`管理 ${person.name} 的权限`} onClick={() => setActiveMenuId((current) => current === person.id ? null : person.id)} type="button">
                    <MoreHorizontal aria-hidden="true" size={15} />
                  </button>
                )}
                {activeMenuId === person.id && (
                  <div className="participant-role-menu">
                    <button onClick={() => toggleManager(person.id)} type="button">
                      {person.role === "manager" ? <ShieldOff aria-hidden="true" size={14} /> : <ShieldCheck aria-hidden="true" size={14} />}
                      {person.role === "manager" ? "取消管理" : "任命为管理"}
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="sidebar-people-group">
        <header className="participant-panel-heading">
          <Eye aria-hidden="true" size={15} />
          <div><b>关注者</b><span>未参与的关注者</span></div>
          <strong>{String(followers.length).padStart(2, "0")}</strong>
        </header>
        <div className="participant-panel-list">
          {followers.map((person) => (
            <article className="participant-row follower-row" key={person.id}>
              <Link className="participant-identity" href="/profile">
                <i>{person.initials}</i>
                <div><b>{person.name}</b><span>{person.field} · {person.joined}</span></div>
              </Link>
            </article>
          ))}
        </div>
      </div>

      <button
        aria-label={relationshipLocked
          ? `当前状态：参与；${relationshipLockReason}`
          : `当前状态：${relationshipLabels[relationshipStatus]}；点击切换为${relationshipLabels[nextRelationshipStatus]}`}
        className={`relationship-button is-${relationshipStatus}`}
        disabled={relationshipLocked}
        onClick={cycleRelationshipStatus}
        title={relationshipLockReason ?? `点击切换为${relationshipLabels[nextRelationshipStatus]}`}
        type="button"
      >
        {relationshipStatus === "participating" && <Users aria-hidden="true" size={15} />}
        {relationshipStatus === "following" && <Bell aria-hidden="true" size={15} />}
        {relationshipStatus === "watching" && <Eye aria-hidden="true" size={15} />}
        <span>{relationshipLabels[relationshipStatus]}</span>
        {relationshipLocked && <LockKeyhole aria-hidden="true" size={12} />}
      </button>
    </section>
  );
}
