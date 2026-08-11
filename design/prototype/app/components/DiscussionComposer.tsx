"use client";

import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";

export function DiscussionComposer({
  ariaLabel,
  onSubmit,
  placeholder,
  showAvatar = true,
}: {
  ariaLabel: string;
  onSubmit: (body: string) => void;
  placeholder: string;
  showAvatar?: boolean;
}) {
  const [body, setBody] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const isExpanded = isFocused || body.length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedBody = body.trim();
    if (!trimmedBody) return;

    onSubmit(trimmedBody);
    setBody("");
    setIsFocused(false);
  }

  return (
    <form
      className={`discussion-composer${showAvatar ? "" : " without-avatar"}${isExpanded ? " is-expanded" : ""}`}
      onSubmit={handleSubmit}
    >
      {showAvatar && <span className="comment-avatar">XW</span>}
      <label>
        <span className="sr-only">{ariaLabel}</span>
        <textarea
          onBlur={() => {
            if (!body.trim()) setIsFocused(false);
          }}
          onChange={(event) => setBody(event.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder={placeholder}
          rows={isExpanded ? 2 : 1}
          value={body}
        />
      </label>
      <button disabled={!body.trim()} type="submit">
        <Send aria-hidden="true" size={15} />
        <span>发送</span>
      </button>
    </form>
  );
}
