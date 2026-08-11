"use client";

import Link from "next/link";
import { CheckCircle2, Settings2 } from "lucide-react";
import { useState } from "react";

export function ProblemActions() {
  const [solved, setSolved] = useState(false);

  return (
    <section className="problem-actions" aria-label="问题操作">
      <div>
        <button
          aria-pressed={solved}
          className={solved ? "is-complete" : undefined}
          onClick={() => setSolved((current) => !current)}
          type="button"
        >
          <CheckCircle2 aria-hidden="true" size={14} />{solved ? "已标记解决" : "标记为解决"}
        </button>
        <Link href="/problems/split/settings"><Settings2 aria-hidden="true" size={14} />问题设置</Link>
      </div>
    </section>
  );
}
