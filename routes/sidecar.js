import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function keyOf(sessionPath) {
  return crypto.createHash("sha1").update(String(sessionPath)).digest("hex").slice(0, 16);
}
function isChatSessionPath(sp) {
  if (!sp || typeof sp !== "string") return false;
  if (!sp.endsWith(".jsonl")) return false;
  if (sp.includes("/archived/") || sp.includes("\\archived\\")) return false;
  if (sp.includes("/activity/") || sp.includes("\\activity\\")) return false;
  return /agents[\/][^\/]+[\/]sessions[\/][^\/]+\.jsonl$/.test(sp);
}
function agentFromPath(sp) {
  const m = String(sp || "").match(/agents[\\\/]([^\\\/]+)[\\\/]sessions[\\\/]/);
  return m ? m[1] : null;
}

// ── 侧边栏挂件（全量面板：所有会话、全部字段、默认展开）──

const PAGE_CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif;
  background: transparent; color: var(--fg); line-height: 1.6;
  --fg: #1c1c1e; --muted: #8e8e93; --card: rgba(127,127,127,.07);
  --border: rgba(127,127,127,.18); --accent: #0a84ff;
  --green: #30d158; --amber: #ff9f0a; --blue: #64d2ff;
}
body[data-hana-theme="light"] {
  --fg: #1c1c1e; --muted: #8e8e93; --card: rgba(0,0,0,.04);
  --border: rgba(0,0,0,.1); --accent: #0066cc;
  --green: #248a3d; --amber: #b25000; --blue: #0066cc;
}
body[data-hana-theme="dark"] {
  --fg: #f2f2f7; --muted: #98989d; --card: rgba(255,255,255,.06);
  --border: rgba(255,255,255,.12);
}
.wrap { max-width: 860px; margin: 0 auto; padding: 28px 20px 64px; }
header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 24px; }
h1 { font-size: 22px; font-weight: 650; letter-spacing: .02em; }
.meta { color: var(--muted); font-size: 12px; }
.card {
  background: var(--card); border: 1px solid var(--border); border-radius: 14px;
  padding: 18px 20px; margin-bottom: 16px;
}
.pgroup { margin-bottom: 30px; }
.pgroup-head {
  display: flex; align-items: baseline; gap: 10px; margin: 6px 2px 12px;
  border-bottom: 1px solid var(--border); padding-bottom: 7px;
}
.pgroup-name { font-size: 15px; font-weight: 650; letter-spacing: .02em; }
.pgroup-stat { color: var(--muted); font-size: 11.5px; }
.card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.badge { font-size: 11px; padding: 2px 9px; border-radius: 99px; font-weight: 600; }
.badge.active { color: var(--green); background: color-mix(in srgb, var(--green) 14%, transparent); }
.badge.parked { color: var(--amber); background: color-mix(in srgb, var(--amber) 14%, transparent); }
.badge.done { color: var(--blue); background: color-mix(in srgb, var(--blue) 14%, transparent); }
.title { font-weight: 650; font-size: 15px; }
.sub { color: var(--muted); font-size: 12px; }
.section { margin-top: 12px; }
.label { font-size: 11px; font-weight: 700; letter-spacing: .12em; color: var(--muted); text-transform: uppercase; margin-bottom: 4px; }
.body { font-size: 13.5px; white-space: pre-wrap; word-break: break-word; }
ul.plain { list-style: none; }
ul.plain li { padding-left: 14px; position: relative; font-size: 13.5px; margin: 2px 0; }
ul.plain li::before { content: "·"; position: absolute; left: 2px; color: var(--accent); font-weight: 700; }
ol.plain { padding-left: 20px; font-size: 13.5px; }
ol.plain li { margin: 2px 0; }
.tl-ts { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; color: var(--text-muted); margin-right: 7px; }
.narrative { line-height: 1.9; font-size: 14px; }
details.tl-more { margin: 4px 0; }
details.tl-more summary { cursor: pointer; list-style: none; font-size: 12.5px; color: var(--text-muted); padding: 4px 0; user-select: none; }
details.tl-more summary::-webkit-details-marker { display: none; }
details.tl-more summary::before { content: "▸ "; }
details.tl-more[open] summary::before { content: "▾ "; }
.note { font-size: 12.5px; color: var(--muted); }
.note b { color: var(--fg); font-weight: 600; }
.empty { text-align: center; color: var(--muted); padding: 64px 0; font-size: 14px; }
.err { color: var(--amber); font-size: 12px; }
button.rf {
  font: inherit; font-size: 12px; color: var(--accent); background: none;
  border: 1px solid var(--border); border-radius: 8px; padding: 3px 10px; cursor: pointer;
}
button.rf:hover { border-color: var(--accent); }
`;

const PAGE_JS = `
const BASE = () => window.location.pathname;
const QS = () => window.location.search || "";
const $ = (s) => document.querySelector(s);
const STATUS = { active: ["进行中", "active"], parked: ["已搁置", "parked"], done: ["已完成", "done"] };
const rel = (iso) => {
  if (!iso) return "—";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "刚刚";
  if (d < 3600) return Math.floor(d / 60) + " 分钟前";
  if (d < 86400) return Math.floor(d / 3600) + " 小时前";
  return Math.floor(d / 86400) + " 天前";
};
const escH = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
async function load() {
  try {
    const res = await fetch(BASE() + "/data" + QS());
    const data = await res.json();
    render(data);
  } catch (e) {
    $("#list").innerHTML = '<div class="empty">数据加载失败：' + escH(e.message) + "</div>";
  }
}
function render(data) {
  $("#meta").textContent = "共 " + data.sessions.length + " 份旁录 · 更新于 " + new Date().toLocaleTimeString();
  if (!data.sessions.length) {
    $("#list").innerHTML = '<div class="empty">还没有旁录。让任意会话活动一会儿，第一份档案会自动出现。</div>';
    return;
  }
  const groups = new Map();
  for (const r of data.sessions) {
    const g = r.projectName || "未分组";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  const ordered = (data.projects || []).map((p) => p.name).filter((n) => groups.has(n));
  for (const n of groups.keys()) if (n !== "未分组" && !ordered.includes(n)) ordered.push(n);
  if (groups.has("未分组")) ordered.push("未分组");
  let html = "";
  for (const name of ordered) {
    const list = groups.get(name);
    const act = list.filter((r) => r.state?.status === "active").length;
    html += '<div class="pgroup"><div class="pgroup-head"><span class="pgroup-name">' + escH(name) + '</span><span class="pgroup-stat">' + list.length + ' 份' + (act ? ' · ' + act + ' 进行中' : "") + '</span></div>'
      + list.map(cardHtml).join("") + "</div>";
  }
  $("#list").innerHTML = html;
}
function cardHtml(r) {
    const st = STATUS[r.state?.status] || STATUS.active;
    const prog = (r.state?.progress || []).map((p) => {
      const m = String(p).match(/^(\\[?\\d{1,2}:\\d{2}\\]?)\\s+(.+)$/);
      if (!m) return "<li>" + escH(p) + "</li>";
      return '<li><span class="tl-ts">' + escH(m[1].replace(/^\\[|\\]$/g, "")) + "</span>" + escH(m[2]) + "</li>";
    }).join("");
    const next = (r.state?.next || []).map((n) => "<li>" + escH(n) + "</li>").join("");
    const notes = (r.notes || []).map((n) => '<div class="note"><b>[' + escH(n.kind) + "]</b> " + escH(n.text) + "</div>").join("");
    return '<div class="card">'
      + '<div class="card-head">'
      + '<span class="badge ' + st[1] + '">' + st[0] + "</span>"
      + '<span class="title">' + escH(r.title || r.sessionId || r.key) + "</span>"
      + '<span class="sub">' + escH(r.agentId || "") + " · " + (r.messageCount || 0) + " 条消息 · " + rel(r.lastActivityAt) + "</span>"
      + '<span style="flex:1"></span>'
      + '<button class="rf" onclick="refresh(\\'' + r.key + '\\')">重新生成</button>'
      + "</div>"
      + (r.state?.narrative ? sec("这一程", '<div class="body narrative">' + escH(r.state.narrative) + "</div>") : "")
      + sec("此刻", '<div class="body">' + escH(r.state?.parkedAt || "（尚无）") + "</div>")
      + (prog ? '<details class="tl-more"><summary>完整时间线 · ' + (r.state?.progress || []).length + ' 条</summary><ol class="plain">' + prog + "</ol></details>" : "")
      + (r.state?.outcome ? sec("成果", '<div class="body">' + escH(r.state.outcome) + "</div>") : "")
      + (next ? sec("接下来", '<ul class="plain">' + next + "</ul>") : "")
      + (notes ? sec("备注", notes) : "")
      + '<details class="tl-more"><summary>缘起</summary><div class="body">' + escH(r.state?.origin || "（尚无）") + "</div></details>"
      + (r.gen?.lastError ? '<div class="err">⚠ 上次生成失败：' + escH(r.gen.lastError) + "</div>" : "")
      + "</div>";
}
function sec(label, inner) { return '<div class="section"><div class="label">' + label + "</div>" + inner + "</div>"; }
async function refresh(key) {
  await fetch(BASE() + "/refresh" + QS(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
  setTimeout(load, 1500);
}
load();
setInterval(load, 10000);
`;

export default function (app, ctx) {
  const { dataDir, log } = ctx;
  const storeDir = path.join(dataDir, "sidecars");

  const listSidecars = () => {
    let files = [];
    try { files = fs.readdirSync(storeDir).filter(f => f.endsWith(".json")); } catch { return []; }
    const out = [];
    for (const f of files) {
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(storeDir, f), "utf-8"));
        out.push(rec);
      } catch { /* skip corrupt */ }
    }
    out.sort((a, b) => String(b.lastActivityAt || b.updatedAt).localeCompare(String(a.lastActivityAt || a.updatedAt)));
    return out;
  };

// ── 项目分组（复用宿主原生项目系统：~/.hanako/user/session-projects.json + 各 agent 的 session-meta.json）──
const HANAKO_ROOT = path.join(process.env.HOME || "", ".hanako");
let _projCache = { catalog: null, catalogMtime: 0, metaMaps: {}, metaMtimes: {} };
function projectCatalog() {
  try {
    const p = path.join(HANAKO_ROOT, "user", "session-projects.json");
    const mt = fs.statSync(p).mtimeMs;
    if (_projCache.catalog && _projCache.catalogMtime === mt) return _projCache.catalog;
    const d = JSON.parse(fs.readFileSync(p, "utf-8"));
    const byId = {};
    for (const pr of d.projects || []) byId[pr.id] = pr;
    _projCache.catalog = { byId, order: (d.projects || []).map((p) => p.id) };
    _projCache.catalogMtime = mt;
    return _projCache.catalog;
  } catch { return { byId: {}, order: [] }; }
}
function projectIdOfSession(sessionPath) {
  try {
    const dir = path.dirname(sessionPath);
    const base = path.basename(sessionPath);
    const metaPath = path.join(dir, "session-meta.json");
    const mt = fs.statSync(metaPath).mtimeMs;
    if (!_projCache.metaMaps[metaPath] || _projCache.metaMtimes[metaPath] !== mt) {
      _projCache.metaMaps[metaPath] = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      _projCache.metaMtimes[metaPath] = mt;
    }
    return _projCache.metaMaps[metaPath][base]?.projectId || null;
  } catch { return null; }
}

  app.get("/sidecar/data", (c) => {
    const sessions = listSidecars();
    const cat = projectCatalog();
    for (const r of sessions) {
      const pid = r.sessionPath ? projectIdOfSession(r.sessionPath) : null;
      r.projectId = pid;
      r.projectName = pid ? (cat.byId[pid]?.name || null) : null;
    }
    return c.json({ sessions, projects: (cat.order || []).map((id) => ({ id, name: cat.byId[id]?.name || id })), generatedAt: new Date().toISOString() });
  });

  app.post("/sidecar/refresh", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const shared = globalThis.__sessionSidecar;
      if (!shared) return c.json({ error: "runtime not ready" }, 503);
      if (body.key) {
        const ent = shared.sessions.get(body.key);
        if (!ent) return c.json({ error: "unknown key" }, 404);
        ent.dirtyTs = Date.now();
        ent.lastGenAt = 0;
        return c.json({ ok: true });
      }
      // 无 key：把全部已知会话标脏
      for (const ent of shared.sessions.values()) { ent.dirtyTs = Date.now(); ent.lastGenAt = 0; }
      return c.json({ ok: true, all: true });
    } catch (e) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.get("/sidecar/md", (c) => {
    const key = String(c.req.query("key") || "").replace(/[^a-f0-9]/g, "");
    if (!key) return c.text("missing key", 400);
    const p = path.join(storeDir, `${key}.md`);
    if (!fs.existsSync(p)) return c.text("not found", 404);
    return c.text(fs.readFileSync(p, "utf-8"));
  });

  app.get("/widget/data", (c) => {
    const all = listSidecars();
    const focus = String(c.req.query("focus") || "");
    let current = null;
    let focused = false;
    if (focus && isChatSessionPath(focus)) {
      focused = true;
      current = all.find(r => r.sessionPath === focus) || null;
      if (!current) {
        // 聚焦的会话还没有旁录：立刻触发建档，下一次 tick 即生成
        const shared = globalThis.__sessionSidecar;
        if (shared?.touch) {
          shared.touch(focus);
          const ent = shared.sessions.get(keyOf(focus));
          if (ent) ent.lastGenAt = 0;
        }
        current = {
          key: keyOf(focus), sessionPath: focus,
          agentId: agentFromPath(focus), title: "",
          messageCount: 0, lastActivityAt: new Date().toISOString(),
          pending: true, state: null, notes: []
        };
      }
    }
    if (!current) current = all[0] || null;
    return c.json({
      current,
      total: all.length,
      focused: focused && !!current,
      generatedAt: new Date().toISOString()
    });
  });

  app.post("/widget/probe", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const probePath = path.join(dataDir, "widget-probe.jsonl");
      fs.appendFileSync(probePath, JSON.stringify({ ...body, srv: new Date().toISOString() }) + "\n");
      try {
        if (fs.statSync(probePath).size > 200 * 1024) {
          const tailLines = fs.readFileSync(probePath, "utf-8").split("\n").slice(-300).join("\n");
          fs.writeFileSync(probePath, tailLines);
        }
      } catch { /* ignore */ }
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: e.message }, 500);
    }
  });

  // 挂件页面：设计师模板（routes/widget.html），数据接线在模板内完成
  // 不做模块级缓存——每次直接读盘，避免热更新后服务旧版模板（19KB，开销可忽略）
  app.get("/widget", (c) => {
    try {
      const tpl = path.join(path.dirname(fileURLToPath(import.meta.url)), "widget.html");
      return c.html(fs.readFileSync(tpl, "utf-8"));
    } catch (e) {
      return c.text("widget template missing: " + e.message, 500);
    }
  });

  app.get("/sidecar", (c) => {
    const hc = c.req.query("hana-css") || "";
    const th = c.req.query("hana-theme") || "inherit";
    const hcLink = hc ? `<link rel="stylesheet" href="${esc(hc)}">` : "";
    return c.html(`<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Session 旁录</title>
${hcLink}
<style>${PAGE_CSS}</style>
</head>
<body data-hana-theme="${esc(th)}" data-surface="page">
<div class="wrap">
  <header>
    <h1>Session 旁录</h1>
    <span class="meta" id="meta">加载中…</span>
  </header>
  <div id="list"><div class="empty">加载中…</div></div>
</div>
<script>(function(){window.parent.postMessage({source:"hana-plugin",type:"ready"},"*")})();</script>
<script>${PAGE_JS}</script>
</body>
</html>`);
  });
}
