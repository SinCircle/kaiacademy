"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Send } from "lucide-react";
import { SiteHeader } from "./SiteHeader";
import { TagCombobox } from "./TagCombobox";

export function ProblemEditor({ mode }: { mode: "publish" | "settings" }) {
  const settings = mode === "settings";
  const router = useRouter();
  const [title, setTitle] = useState(settings ? "平方数相邻差的素因子结构" : "");
  const [tags, setTags] = useState(settings ? ["数论", "素数", "整除性"] : []);
  const [body, setBody] = useState(settings ? "设 n > 1 为整数。研究 n² − 1 的素因子，并证明至少存在一个足够大的素因子。" : "");
  const [background, setBackground] = useState(settings ? "问题来自对相邻平方差因子结构的研究。目前已完成基本分拆，尚缺小素因子高次幂的统一估计。" : "");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function submitProblem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (settings) {
      setMessage("设置已保存");
      return;
    }

    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, tags, body, background }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "发布失败，请稍后重试");
      router.push(`/problems?q=${encodeURIComponent(tags[0] ?? title)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发布失败，请稍后重试");
      setSubmitting(false);
    }
  }

  return (
    <div className="site-shell">
      <SiteHeader active="problems" />
      <main className="manager-page">
        <Link className="manager-page-back" href={settings ? "/problems/split" : "/problems"}>
          <ArrowLeft aria-hidden="true" size={14} />
          {settings ? "返回问题" : "返回难题"}
        </Link>
        <header className="manager-page-heading">
          <div>
            <h1>{settings ? "问题设置" : "发布问题"}</h1>
            <p>{settings ? "维护问题内容、状态和协作权限。" : "发布一个可被检索、参与和持续推进的数学问题。"}</p>
          </div>
        </header>

        <form className="problem-editor-form" onSubmit={submitProblem}>
          <section>
            <h2>基本信息</h2>
            <label>
              <span>标题</span>
              <input onChange={(event) => setTitle(event.target.value)} placeholder="用一句话描述问题" required value={title} />
            </label>
            <TagCombobox onChange={setTags} value={tags} />
          </section>

          <section>
            <h2>问题内容</h2>
            <label>
              <span>问题正文</span>
              <textarea
                onChange={(event) => setBody(event.target.value)}
                placeholder="支持 Markdown 与 $...$ / $$...$$ 数学公式"
                required
                rows={10}
                value={body}
              />
            </label>
            <label>
              <span>背景与已知进展</span>
              <textarea
                onChange={(event) => setBackground(event.target.value)}
                placeholder="可选：说明来源、已有结论和允许使用的工具"
                rows={5}
                value={background}
              />
            </label>
          </section>

          {settings && (
            <section>
              <h2>协作设置</h2>
              <div className="editor-field-row">
                <label>
                  <span>问题状态</span>
                  <select defaultValue="进行中"><option>开放</option><option>进行中</option><option>已解决</option></select>
                </label>
                <label>
                  <span>加入方式</span>
                  <select defaultValue="管理者确认"><option>直接加入</option><option>管理者确认</option><option>仅限邀请</option></select>
                </label>
              </div>
              <label className="editor-checkbox"><input defaultChecked type="checkbox" /><span>允许关注者查看问题草稿</span></label>
            </section>
          )}

          <p aria-live="polite" className="editor-form-status">{message}</p>
          <footer>
            {!settings && <button type="button"><Save aria-hidden="true" size={14} />保存草稿</button>}
            <button className="primary" disabled={submitting} type="submit">
              {settings ? <Save aria-hidden="true" size={14} /> : <Send aria-hidden="true" size={14} />}
              {settings ? "保存设置" : submitting ? "发布中…" : "发布问题"}
            </button>
          </footer>
        </form>
      </main>
    </div>
  );
}
