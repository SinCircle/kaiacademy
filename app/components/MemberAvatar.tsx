"use client";

import { useEffect, useState } from "react";

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
