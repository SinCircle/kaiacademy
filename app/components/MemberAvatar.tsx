"use client";

import { useEffect, useState } from "react";

export type AvatarPreview = {
  id: string;
  initials: string;
  avatarUpdatedAt: string | null;
};

export function MemberAvatar({
  avatarUpdatedAt,
  className = "",
  initials,
  memberId,
}: {
  avatarUpdatedAt?: string | null;
  className?: string;
  initials: string;
  memberId: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatarUpdatedAt]);
  return (
    <span className={`member-avatar ${className}`.trim()}>
      <span>{initials}</span>
      {/* The avatar endpoint already returns a server-resized WebP; another optimizer pass would waste work. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {avatarUpdatedAt && !failed && <img alt="" onError={() => setFailed(true)} src={`/api/avatars/${encodeURIComponent(memberId)}?v=${encodeURIComponent(avatarUpdatedAt)}`} />}
    </span>
  );
}

export function MemberAvatarStack({
  label,
  people,
  total,
  variant,
}: {
  label: string;
  people: AvatarPreview[];
  total: number;
  variant: "card" | "result";
}) {
  if (total <= 0) return null;
  const overflow = total > 8 ? total - 7 : 0;
  const visible = people.slice(0, overflow ? 7 : 8);
  const slots = Math.min(8, visible.length + (overflow ? 1 : 0));
  const avatarClass = variant === "card" ? "card-avatar" : "result-avatar";
  const stackClass = variant === "card" ? "card-avatar-stack" : "result-avatar-stack";
  const wrapperClass = variant === "card" ? "card-participants" : "result-avatars";

  return <span aria-label={`${total} ${label}`} className={wrapperClass} title={`${total} ${label}`}>
    <span aria-hidden="true" className={`${stackClass} avatar-stack-count-${slots}`}>
      {visible.map((person) => <MemberAvatar avatarUpdatedAt={person.avatarUpdatedAt} className={avatarClass} initials={person.initials} key={person.id} memberId={person.id} />)}
      {overflow > 0 && <span className={`${avatarClass} ${avatarClass}-overflow`}>+{overflow}</span>}
    </span>
  </span>;
}
