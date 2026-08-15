"use client";

import { SmilePlus } from "lucide-react";
import { useState } from "react";
import {
  PLAYGROUND_COMMENT_MARKERS,
  type PlaygroundCommentReaction,
  type PlaygroundCommentMarker,
} from "../lib/playground";

export function CommentReactions({
  reactions,
  onToggle,
}: {
  reactions: PlaygroundCommentReaction[];
  onToggle(marker: PlaygroundCommentMarker): void;
}) {
  const [open, setOpen] = useState(false);

  return <div className="playground-reaction-control">
    {reactions.map((reaction) => {
      const option = PLAYGROUND_COMMENT_MARKERS.find((item) => item.emoji === reaction.emoji);
      return <button
        aria-label={`${reaction.reactedByViewer ? "取消" : "添加"}${option?.label ?? "表情"}，当前 ${reaction.count} 人`}
        aria-pressed={reaction.reactedByViewer}
        className={`playground-reaction-chip${reaction.reactedByViewer ? " active" : ""}`}
        key={reaction.emoji}
        onClick={() => onToggle(reaction.emoji)}
        title={option?.label}
        type="button"
      ><span aria-hidden="true">{reaction.emoji}</span>{reaction.count > 1 ? <b>{reaction.count}</b> : null}</button>;
    })}
    <button aria-expanded={open} aria-label="添加表情" className="playground-reaction-add" onClick={() => setOpen((value) => !value)} type="button"><SmilePlus aria-hidden="true" size={13} /></button>
    {open && <div aria-label="选择表情" className="playground-reaction-picker" role="group">
      {PLAYGROUND_COMMENT_MARKERS.map((option) => {
        const reaction = reactions.find((item) => item.emoji === option.emoji);
        return <button
          aria-label={reaction?.reactedByViewer ? `取消${option.label}` : `添加${option.label}`}
          aria-pressed={reaction?.reactedByViewer ?? false}
          className={reaction?.reactedByViewer ? "active" : ""}
          key={option.emoji}
          onClick={() => onToggle(option.emoji)}
          title={option.label}
          type="button"
        ><span aria-hidden="true">{option.emoji}</span></button>;
      })}
    </div>}
  </div>;
}
