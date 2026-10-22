import { createClient } from "jsr:@supabase/supabase-js@2";

// Nexora community: members ask questions, share tips, celebrate wins and post offers.
//  POST { action: 'feed', sort: 'hot'|'new'|'top', kind?, q?, offset? } -> posts, my votes, top helpers this week
//  POST { action: 'post', kind, title, body, tags }                    -> AI-moderated; questions get a Nexora AI answer
//  POST { action: 'thread', id }                                       -> post + replies + my votes
//  POST { action: 'reply', post_id, body }
//  POST { action: 'vote', target_type: 'post'|'reply', target_id }    -> toggles my upvote
//  POST { action: 'report', target_type, target_id, reason }          -> 3 reports hide the item
//  POST { action: 'delete', target_type, id }                          -> only my own
//  POST { action: 'accept', reply_id }                                 -> post author marks the best answer
//  POST { action: 'activity' }                                         -> my alerts (replies, upvotes, best answers) + unread count
//  POST { action: 'activity_read' }                                    -> mark all my alerts as read
// Members earn points (2 per reply, 1 per upvote received, 10 per best answer, 1 per post) and levels.
// Reads go through the member's own login (database policies hide removed items); writes go through
// the service key only after the checks below.
// Nexora's answer to a question is one AI task on the asker's plan (moderation is a safety check and isn't counted).
declare const EdgeRuntime: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const GROQ = "https://api.groq.com/openai/v1";
const MODELS = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b"];
const KINDS = ["question", "tip", "win", "offer"];
const POST_COLS = "id,user_id,kind,title,body,tags,author_name,author_label,upvotes,reply_count,ai_answered,solved,created_at";
const REPLY_COLS = "id,post_id,user_id,body,is_ai,author_name,author_label,upvotes,accepted,created_at";
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, n) : "");
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
// Phone numbers and emails are removed from public posts so members aren't spammed; partners swap contacts via Find partners.
const scrub = (s: string) => s
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
  .replace(/(\+?\d[\d\s().-]{8,}\d)/g, "[number removed]");

// Plan limit: each AI reply or action is one AI task (use_ai_task in the database).
// Returns a message when the business has used this month's AI tasks; count 0 only checks.
async function useAiTask(admin: any, userId: string, kind: string, count = 0, check = true): Promise<string> {
  const { data, error } = await admin.rpc("use_ai_task", { p_user: userId, p_kind: kind, p_count: count, p_check: check });
  if (error) { console.error("nexora-community ai usage", error.message); return ""; }
  return data?.ok === false ? String(data.message || "This month's AI tasks are used up.") : "";
}

async function groq(key: string, system: string, user: string, jsonMode: boolean, maxTokens = 700): Promise<string> {
  for (const model of MODELS) {
    const payload: Record<string, unknown> = { model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: jsonMode ? 0 : 0.4, max_tokens: maxTokens };
    if (jsonMode) payload.response_format = { type: "json_object" };
    if (model.startsWith("openai/gpt-oss")) payload.reasoning_effort = "low";
    try {
      const res = await fetch(`${GROQ}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(payload) });
      if (!res.ok) continue;
      const text = String((await res.json())?.choices?.[0]?.message?.content ?? "").trim();
      if (text) return text;
    } catch { /* next model */ }
  }
  return "";
}

// Returns a reason string when the text must not be published, or "" when it's fine.
async function moderate(key: string, text: string): Promise<string> {
  if (!key) return "";
  const out = await groq(key,
    'You moderate a community forum for small business owners. Reply as JSON {"allowed": boolean, "reason": string}. ' +
    "Block only: hate or harassment, sexual content, threats, scams or get-rich-quick schemes, illegal goods, " +
    "requests for other people's personal data, or pure spam/link-dumping. Normal selling, offers and self-promotion of a real business ARE allowed. " +
    "Reason: one short friendly sentence telling the member what to change.", text.slice(0, 3500), true, 200);
  try {
    const m = out.match(/\{[\s\S]*\}/);
    const v = m ? JSON.parse(m[0]) : null;
    if (v && v.allowed === false) return clip(v.reason, 200) || "This post goes against the community guidelines.";
  } catch { /* allow when the checker is unsure */ }
  return "";
}

async function authorOf(admin: any, me: string): Promise<{ name: string; label: string }> {
  const [np, biz, prof] = await Promise.all([
    admin.from("network_profiles").select("display_name,industry,city").eq("user_id", me).maybeSingle(),
    admin.from("businesses").select("name,industry,country").eq("owner_id", me).maybeSingle(),
    admin.from("profiles").select("full_name,business_name").eq("id", me).maybeSingle(),
  ]);
  const name = clip(np.data?.display_name, 60) || clip(biz.data?.name, 60) || clip(prof.data?.business_name, 60) || clip(prof.data?.full_name, 60) || "Nexora member";
  const label = [clip(np.data?.industry || biz.data?.industry, 40), clip(np.data?.city || biz.data?.country, 40)].filter(Boolean).join(" · ");
  return { name, label };
}

async function aiAnswer(admin: any, key: string, post: any) {
  const answer = await groq(key,
    "You are Nexora AI, answering a question in a community of small business owners (many in Nigeria and across Africa). " +
    "Give a practical, specific answer in under 180 words: short paragraphs or a few bullet points, concrete steps, realistic numbers where helpful. " +
    "Be warm, never salesy. If the answer depends on local law, tax or health rules, say so and suggest who to ask. " +
    "End with one line inviting other members to share what worked for them.",
    `Question: ${post.title}\n\n${post.body || ""}`, false, 900);
  if (!answer) return;
  await admin.from("community_replies").insert({ post_id: post.id, user_id: null, body: answer.slice(0, 3000), is_ai: true, author_name: "Nexora AI", author_label: "AI assistant" });
  await admin.from("community_posts").update({ ai_answered: true }).eq("id", post.id);
  await useAiTask(admin, post.user_id, "community_answer", 1, false);
  await notify(admin, { user_id: post.user_id, type: "ai_answer", actor_name: "Nexora AI", post_id: post.id, snippet: answer });
}

const LEVELS = [{ min: 0, name: "New member" }, { min: 10, name: "Contributor" }, { min: 50, name: "Helper" }, { min: 150, name: "Expert" }];
function levelOf(points: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1].min) i++;
  const next = LEVELS[i + 1];
  return { level: LEVELS[i].name, rank: i, points, next_level: next?.name ?? null, next_at: next?.min ?? null };
}
// Points for several members at once. Before the stage-2 SQL is run this quietly returns nothing.
async function pointsFor(admin: any, uids: (string | null | undefined)[]) {
  const ids = [...new Set(uids.filter((u): u is string => !!u))];
  const out = new Map<string, { points: number; answers: number; best: number }>();
  if (!ids.length) return out;
  try {
    const { data } = await admin.rpc("community_points", { uids: ids });
    for (const r of data ?? []) out.set(r.user_id, { points: Number(r.points) || 0, answers: Number(r.answers) || 0, best: Number(r.best) || 0 });
  } catch { /* not set up yet */ }
  return out;
}
async function notify(admin: any, row: { user_id: string | null | undefined; type: string; actor_name?: string; post_id?: string | null; reply_id?: string | null; snippet?: string }) {
  if (!row.user_id) return;
  try { await admin.from("community_notifications").insert({ ...row, actor_name: row.actor_name ?? "", snippet: clip(row.snippet ?? "", 140) }); } catch { /* not set up yet */ }
}

const hotScore = (p: any) => {
  const hours = (Date.now() - new Date(p.created_at).getTime()) / 3.6e6;
  return (1 + p.upvotes + p.reply_count * 2) / Math.pow(hours + 2, 1.4);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, message: "Method not allowed." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const db = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: ud } = await db.auth.getUser();
    if (!ud?.user) return json({ success: false, message: "Please sign in again." }, 401);
    const me = ud.user.id;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "";
    const key = Deno.env.get("GROQ_API_KEY") ?? "";
    const since = (h: number) => new Date(Date.now() - h * 3.6e6).toISOString();

    const myVotes = async (type: string, ids: string[]) => {
      if (!ids.length) return [] as string[];
      const { data } = await db.from("community_votes").select("target_id").eq("user_id", me).eq("target_type", type).in("target_id", ids);
      return (data ?? []).map((v: any) => v.target_id);
    };

    if (action === "feed") {
      const sort = ["hot", "new", "top"].includes(body.sort) ? body.sort : "hot";
      const offset = Math.max(0, Math.min(500, Number(body.offset) || 0));
      let q = db.from("community_posts").select(POST_COLS).eq("status", "visible");
      if (KINDS.includes(body.kind)) q = q.eq("kind", body.kind);
      if (body.mine === true) q = q.eq("user_id", me);
      const term = clip(body.q, 60).replace(/[^\p{L}\p{N} '-]/gu, " ").trim();
      if (term) q = q.or(`title.ilike.%${term}%,body.ilike.%${term}%`);
      let posts: any[] = [];
      if (sort === "hot") {
        const { data, error } = await q.gte("created_at", since(24 * 30)).order("created_at", { ascending: false }).limit(200);
        if (error?.code === "42P01") return json({ success: false, code: "setup", message: "The community isn't set up on the server yet." }, 503);
        posts = (data ?? []).sort((a: any, b: any) => hotScore(b) - hotScore(a)).slice(offset, offset + 30);
        if (posts.length < 30 && offset === 0 && !term && !KINDS.includes(body.kind) && body.mine !== true) {
          // Quiet month: top up with the best older posts so the feed is never empty.
          const older = await db.from("community_posts").select(POST_COLS).eq("status", "visible").lt("created_at", since(24 * 30)).order("upvotes", { ascending: false }).limit(30 - posts.length);
          posts = posts.concat(older.data ?? []);
        }
      } else {
        const { data, error } = await (sort === "new" ? q.order("created_at", { ascending: false }) : q.order("upvotes", { ascending: false }).order("created_at", { ascending: false })).range(offset, offset + 29);
        if (error?.code === "42P01") return json({ success: false, code: "setup", message: "The community isn't set up on the server yet." }, 503);
        posts = data ?? [];
      }
      // Top helpers this week: upvotes on replies + 5 per accepted answer.
      const { data: reps } = await admin.from("community_replies").select("user_id,author_name,author_label,upvotes,accepted")
        .eq("is_ai", false).eq("status", "visible").gte("created_at", since(24 * 7)).limit(1000);
      const tally = new Map<string, any>();
      for (const r of reps ?? []) {
        if (!r.user_id) continue;
        const t = tally.get(r.user_id) ?? { name: r.author_name, label: r.author_label, points: 0, answers: 0 };
        t.points += 1 + r.upvotes + (r.accepted ? 5 : 0); t.answers += 1;
        tally.set(r.user_id, t);
      }
      const top = [...tally.entries()].sort((a, b) => b[1].points - a[1].points).slice(0, 5);
      const topPts = await pointsFor(admin, top.map(([u]) => u));
      const helpers = top.map(([u, t]) => ({ ...t, level: levelOf(topPts.get(u)?.points ?? 0).level }));
      const [{ count: total }, { count: today }] = await Promise.all([
        admin.from("community_posts").select("id", { count: "exact", head: true }).eq("status", "visible"),
        admin.from("community_posts").select("id", { count: "exact", head: true }).eq("status", "visible").gte("created_at", since(24)),
      ]);
      const pts = await pointsFor(admin, [me, ...posts.map((p) => p.user_id)]);
      const lvl = (u: string) => levelOf(pts.get(u)?.points ?? 0).level;
      const { count: unread } = await admin.from("community_notifications").select("id", { count: "exact", head: true }).eq("user_id", me).eq("read", false);
      const mineStats = pts.get(me) ?? { points: 0, answers: 0, best: 0 };
      return json({
        success: true,
        posts: posts.map((p) => ({ ...p, mine: p.user_id === me, author_level: p.author_name === "Nexora AI" ? "" : lvl(p.user_id), user_id: undefined })),
        voted: await myVotes("post", posts.map((p) => p.id)), helpers, stats: { total: total ?? 0, today: today ?? 0 },
        unread: unread ?? 0, me: { ...levelOf(mineStats.points), answers: mineStats.answers, best: mineStats.best },
      });
    }

    if (action === "post") {
      const kind = KINDS.includes(body.kind) ? body.kind : "question";
      const title = scrub(clip(body.title, 140));
      const text = scrub(clip(body.body, 3000));
      const tags = (Array.isArray(body.tags) ? body.tags : []).map((t: unknown) => clip(t, 24).toLowerCase().replace(/[^a-z0-9 -]/g, "")).filter(Boolean).slice(0, 4);
      if (title.length < 3) return json({ success: false, message: "Add a short title (at least 3 characters)." }, 400);
      const { count } = await admin.from("community_posts").select("id", { count: "exact", head: true }).eq("user_id", me).gte("created_at", since(24));
      if ((count ?? 0) >= 10) return json({ success: false, message: "You've posted 10 times today. Please try again tomorrow." }, 429);
      const blocked = await moderate(key, `${title}\n\n${text}`);
      if (blocked) return json({ success: false, code: "moderation", message: blocked }, 422);
      const who = await authorOf(admin, me);
      const { data, error } = await admin.from("community_posts").insert({ user_id: me, kind, title, body: text, tags, author_name: who.name, author_label: who.label }).select(POST_COLS).single();
      if (error) return json({ success: false, message: "Couldn't publish your post. Please try again." }, 500);
      // Nexora answers questions while the asker's business has AI tasks left; other members can still answer.
      if (kind === "question" && key && !(await useAiTask(admin, me, "check"))) {
        const job = aiAnswer(admin, key, data).catch(() => {});
        try { EdgeRuntime.waitUntil(job); } catch { await job; }
      }
      return json({ success: true, post: { ...data, mine: true, user_id: undefined } });
    }

    if (action === "thread") {
      if (!uuid(body.id)) return json({ success: false, message: "Post not found." }, 400);
      const [p, r] = await Promise.all([
        db.from("community_posts").select(POST_COLS).eq("id", body.id).maybeSingle(),
        db.from("community_replies").select(REPLY_COLS).eq("post_id", body.id).eq("status", "visible").order("created_at", { ascending: true }).limit(200),
      ]);
      if (!p.data) return json({ success: false, message: "This post was removed or doesn't exist." }, 404);
      const replies = (r.data ?? []).sort((a: any, b: any) => Number(b.accepted) - Number(a.accepted));
      const [vp, vr, pts] = await Promise.all([myVotes("post", [p.data.id]), myVotes("reply", replies.map((x: any) => x.id)), pointsFor(admin, [p.data.user_id, ...replies.map((x: any) => x.user_id)])]);
      const lvl = (u: string | null, ai: boolean) => (ai || !u ? "" : levelOf(pts.get(u)?.points ?? 0).level);
      return json({
        success: true,
        post: { ...p.data, mine: p.data.user_id === me, author_level: lvl(p.data.user_id, p.data.author_name === "Nexora AI"), user_id: undefined },
        replies: replies.map((x: any) => ({ ...x, mine: x.user_id === me, author_level: lvl(x.user_id, x.is_ai), user_id: undefined })),
        voted: [...vp, ...vr],
      });
    }

    if (action === "reply") {
      if (!uuid(body.post_id)) return json({ success: false, message: "Post not found." }, 400);
      const text = scrub(clip(body.body, 3000));
      if (!text) return json({ success: false, message: "Write a reply first." }, 400);
      const { data: post } = await db.from("community_posts").select("id,status,user_id").eq("id", body.post_id).maybeSingle();
      if (!post || post.status !== "visible") return json({ success: false, message: "This post is no longer open for replies." }, 404);
      const { count } = await admin.from("community_replies").select("id", { count: "exact", head: true }).eq("user_id", me).gte("created_at", since(24));
      if ((count ?? 0) >= 60) return json({ success: false, message: "You've reached today's reply limit. Please try again tomorrow." }, 429);
      const blocked = await moderate(key, text);
      if (blocked) return json({ success: false, code: "moderation", message: blocked }, 422);
      const who = await authorOf(admin, me);
      const { data, error } = await admin.from("community_replies").insert({ post_id: post.id, user_id: me, body: text, author_name: who.name, author_label: who.label }).select(REPLY_COLS).single();
      if (error) return json({ success: false, message: "Couldn't send your reply. Please try again." }, 500);
      if (post.user_id !== me) await notify(admin, { user_id: post.user_id, type: "reply", actor_name: who.name, post_id: post.id, reply_id: data.id, snippet: text });
      const pts = await pointsFor(admin, [me]);
      return json({ success: true, reply: { ...data, mine: true, author_level: levelOf(pts.get(me)?.points ?? 0).level, user_id: undefined } });
    }

    if (action === "vote") {
      const type = body.target_type === "reply" ? "reply" : "post";
      if (!uuid(body.target_id)) return json({ success: false, message: "Not found." }, 400);
      const table = type === "post" ? "community_posts" : "community_replies";
      const { data: target } = await db.from(table).select(type === "post" ? "id,user_id,upvotes,title" : "id,user_id,upvotes,post_id,body").eq("id", body.target_id).eq("status", "visible").maybeSingle() as any;
      if (!target) return json({ success: false, message: "This was removed." }, 404);
      if (target.user_id === me) return json({ success: false, message: "You can't upvote your own post." }, 400);
      const { data: existing } = await admin.from("community_votes").select("target_id").eq("user_id", me).eq("target_type", type).eq("target_id", target.id).maybeSingle();
      if (existing) await admin.from("community_votes").delete().eq("user_id", me).eq("target_type", type).eq("target_id", target.id);
      else {
        await admin.from("community_votes").insert({ user_id: me, target_type: type, target_id: target.id });
        if (target.user_id) {
          const who = await authorOf(admin, me);
          const ref = type === "post" ? { post_id: target.id, reply_id: null } : { post_id: target.post_id, reply_id: target.id };
          let q = admin.from("community_notifications").select("id", { count: "exact", head: true })
            .eq("user_id", target.user_id).eq("type", "upvote").eq("actor_name", who.name).gte("created_at", since(24));
          q = ref.reply_id ? q.eq("reply_id", ref.reply_id) : q.eq("post_id", ref.post_id).is("reply_id", null);
          const { count: dup } = await q;
          if (!dup) await notify(admin, { user_id: target.user_id, type: "upvote", actor_name: who.name, ...ref, snippet: type === "post" ? target.title : target.body });
        }
      }
      const { data: fresh } = await admin.from(table).select("upvotes").eq("id", target.id).maybeSingle();
      return json({ success: true, voted: !existing, upvotes: fresh?.upvotes ?? target.upvotes });
    }

    if (action === "report") {
      const type = body.target_type === "reply" ? "reply" : "post";
      if (!uuid(body.target_id)) return json({ success: false, message: "Not found." }, 400);
      const { error } = await admin.from("community_reports").insert({ reporter_id: me, target_type: type, target_id: body.target_id, reason: clip(body.reason, 300) });
      if (error && error.code !== "23505") return json({ success: false, message: "Couldn't send the report." }, 500);
      return json({ success: true, message: "Thanks for reporting this. Posts reported by several members are hidden until they're reviewed."});
    }

    if (action === "delete") {
      const table = body.target_type === "reply" ? "community_replies" : "community_posts";
      if (!uuid(body.id)) return json({ success: false, message: "Not found." }, 400);
      const { data, error } = await admin.from(table).delete().eq("id", body.id).eq("user_id", me).select("id");
      if (error || !data?.length) return json({ success: false, message: "You can only delete your own posts." }, 403);
      return json({ success: true });
    }

    if (action === "accept") {
      if (!uuid(body.reply_id)) return json({ success: false, message: "Not found." }, 400);
      const { data: rep } = await admin.from("community_replies").select("id,post_id,accepted,user_id,body").eq("id", body.reply_id).maybeSingle();
      if (!rep) return json({ success: false, message: "Reply not found." }, 404);
      const { data: post } = await admin.from("community_posts").select("id,user_id,title").eq("id", rep.post_id).maybeSingle();
      if (!post || post.user_id !== me) return json({ success: false, message: "Only the person who asked can pick the best answer." }, 403);
      await admin.from("community_replies").update({ accepted: false }).eq("post_id", post.id);
      const accepted = !rep.accepted;
      if (accepted) await admin.from("community_replies").update({ accepted: true }).eq("id", rep.id);
      await admin.from("community_posts").update({ solved: accepted }).eq("id", post.id);
      if (accepted && rep.user_id && rep.user_id !== me) {
        const who = await authorOf(admin, me);
        await notify(admin, { user_id: rep.user_id, type: "accepted", actor_name: who.name, post_id: post.id, reply_id: rep.id, snippet: post.title });
      }
      return json({ success: true, accepted });
    }

    if (action === "activity") {
      const { data, error } = await admin.from("community_notifications")
        .select("id,type,actor_name,post_id,reply_id,snippet,read,created_at,community_posts(title)")
        .eq("user_id", me).order("created_at", { ascending: false }).limit(40);
      if (error) return json({ success: true, items: [], unread: 0 });
      const items = (data ?? []).map((n: any) => ({ ...n, post_title: n.community_posts?.title ?? "", community_posts: undefined }));
      return json({ success: true, items, unread: items.filter((n: any) => !n.read).length });
    }

    if (action === "activity_read") {
      await admin.from("community_notifications").update({ read: true }).eq("user_id", me).eq("read", false);
      return json({ success: true });
    }

    return json({ success: false, message: "Unknown action." }, 400);
  } catch (e) {
    console.error("nexora-community", e instanceof Error ? e.message : String(e));
    return json({ success: false, message: "Something went wrong. Please try again." }, 500);
  }
});
