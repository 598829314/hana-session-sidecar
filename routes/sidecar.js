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
  return /agents[\\/][^\\/]+[\\/]sessions[\\/][^\\/]+\.jsonl$/.test(sp);
}
function agentFromPath(sp) {
  const m = String(sp || "").match(/agents[\\\/]([^\\\/]+)[\\\/]sessions[\\\/]/);
  return m ? m[1] : null;
}

// ── 侧边栏挂件（全量面板：所有会话、全部字段、默认展开）──

const PAGE_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif;
  background: #f7f6f2; color: var(--fg); line-height: 1.6;
  --fg: #1c1c1e; --muted: #8e8e93; --text-muted: #8e8e93; --card: rgba(127,127,127,.07);
  --bg: rgba(127,127,127,.06);
  --border: rgba(127,127,127,.18); --accent: #0a84ff;
  --green: #30d158; --amber: #ff9f0a; --blue: #64d2ff;
}
body[data-hana-theme="light"] {
  --fg: #1c1c1e; --muted: #8e8e93; --text-muted: #8e8e93; --card: rgba(0,0,0,.04);
  --bg: rgba(0,0,0,.035);
  --border: rgba(0,0,0,.1); --accent: #0066cc;
  --green: #248a3d; --amber: #b25000; --blue: #0066cc;
}
body[data-hana-theme="dark"] {
  --fg: #f2f2f7; --muted: #98989d; --text-muted: #98989d; --card: rgba(255,255,255,.06);
  --bg: rgba(255,255,255,.05);
  --border: rgba(255,255,255,.12);
}
.wrap { max-width: 1280px; margin: 0 auto; padding: 28px 24px 64px; }
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
/* ── 台账视图 ── */
.tabs { display: flex; gap: 4px; margin: 0 0 14px; border-bottom: 1px solid var(--border); }
.tab { padding: 7px 14px; font-size: 13.5px; color: var(--muted); cursor: pointer; border: none; background: none; font: inherit; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tab.on { color: var(--fg); font-weight: 600; border-bottom-color: var(--accent); }
.today-line { font-size: 13px; color: var(--muted); padding: 8px 12px; background: var(--bg); border: 1px dashed var(--border); border-radius: 10px; margin-bottom: 14px; }
.today-line b { color: var(--fg); font-weight: 600; }
.tgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 14px; align-items: start; }
.tmem-face { font-size: 13px; line-height: 1.75; margin-top: 4px; }
.tquote { font-size: 12.5px; color: var(--muted); font-style: italic; border-left: 2px solid var(--accent); padding-left: 10px; margin: 8px 0 6px; line-height: 1.65; }
.today2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; margin-bottom: 20px; }
.tq { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 12px 16px; }
.tq-head { font-size: 14px; font-weight: 650; margin-bottom: 8px; }
.tday-row { display: flex; gap: 8px; align-items: baseline; font-size: 12.5px; padding: 4px 0; border-top: 1px dashed var(--border); }
.tday-row:first-of-type { border-top: none; }
.tday-name { font-weight: 600; white-space: nowrap; }
.tday-park { color: var(--muted); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tday-time { color: var(--muted); font-size: 11.5px; white-space: nowrap; }
.memrow { margin: 4px 0; }
.memorigin { font-size: 12px; color: var(--muted); margin: 1px 0 2px 14px; }
.exc-link { color: var(--accent); font-size: 12px; cursor: pointer; margin-left: 8px; user-select: none; }
.exc { font-size: 12.5px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; margin: 6px 0 4px 14px; line-height: 1.7; }
.exc div + div { margin-top: 6px; }
.exc-role { display: inline-block; min-width: 30px; margin-right: 6px; font-size: 11px; font-weight: 700; }
.exc-role.u { color: var(--accent); }
.exc-role.a { color: var(--muted); }
.tcard { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 14px 18px; margin: 0; }
.tcard.done { opacity: .62; }
.thead { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.tname { font-size: 15.5px; font-weight: 650; }
.tstat { margin-left: auto; font-size: 12px; color: var(--muted); }
.trow { font-size: 13.5px; line-height: 1.7; margin-top: 5px; }
.trow .tl2 { color: var(--muted); margin-right: 6px; font-size: 12.5px; }
.tnext { color: var(--fg); }
.tnext .tl2 { color: var(--amber); font-weight: 600; }
.tmem { margin-top: 7px; font-size: 12px; color: var(--muted); cursor: pointer; user-select: none; }
.tmem:hover { color: var(--accent); }
.tmem-list { margin-top: 5px; padding: 7px 10px; background: var(--bg); border-radius: 8px; font-size: 12.5px; }
.tmem-list div { padding: 1.5px 0; }
.tdone-btn { font: inherit; font-size: 11.5px; color: var(--muted); background: none; border: 1px solid var(--border); border-radius: 7px; padding: 2px 8px; cursor: pointer; }
.tdone-btn:hover { color: var(--accent); border-color: var(--accent); }
.rv { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 12px 16px; margin-bottom: 14px; }
.rv-item { display: flex; gap: 8px; align-items: baseline; padding: 6px 0; border-bottom: 1px dashed var(--border); font-size: 13px; }
.rv-item:last-child { border-bottom: none; }
.rv-item input { margin-top: 3px; }
.rv-reason { color: var(--muted); font-size: 12px; }
.rv-actions { margin-top: 10px; display: flex; gap: 10px; }
.rv-actions button { font: inherit; font-size: 12.5px; border-radius: 8px; padding: 5px 14px; cursor: pointer; }
.rv-ok { background: var(--accent); color: #fff; border: 1px solid var(--accent); }
.rv-cancel { background: none; color: var(--muted); border: 1px solid var(--border); }
.propose-btn { font: inherit; font-size: 12.5px; color: var(--accent); background: none; border: 1px solid var(--border); border-radius: 9px; padding: 5px 13px; cursor: pointer; margin-bottom: 14px; }
.propose-btn:hover { border-color: var(--accent); }
.propose-btn[disabled] { opacity: .5; cursor: wait; }
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
  // 按「归属的事」分组；未归类的排在最上面，归拢家务也在这里
  const groups = new Map();
  for (const r of data.sessions) {
    const g = r.threadName || "未归类";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  const names = Array.from(groups.keys()).filter((n) => n !== "未归类");
  for (const r of data.sessions) RV_TITLES[r.key] = r.title || r.key;
  let html = "";
  if (groups.has("未归类")) {
    const loose = groups.get("未归类");
    html += '<div class="pgroup"><div class="pgroup-head"><span class="pgroup-name">未归类</span><span class="pgroup-stat">' + loose.length + ' 份 · 还没归入任何事（不管它也没关系）</span></div>'
      + '<div style="margin:2px 2px 10px"><button class="propose-btn" id="propose-btn" onclick="propose()">让 AI 提个归拢建议</button>'
      + '<span style="font-size:12px;color:var(--muted);margin-left:10px">AI 只出建议；你勾选并点「批准」之前，什么都不会改。</span></div>'
      + '<div id="review"></div>'
      + loose.map(cardHtml).join("") + "</div>";
  }
  for (const name of names) {
    const list = groups.get(name);
    html += '<div class="pgroup"><div class="pgroup-head"><span class="pgroup-name">' + escH(name) + '</span><span class="pgroup-stat">' + list.length + ' 份</span></div>'
      + list.map(cardHtml).join("") + "</div>";
  }
  // 10 秒轮询重建 DOM 时，留住归拢核对区
  const keepReview = PROPOSALS ? $("#review") && $("#review").innerHTML : null;
  $("#list").innerHTML = html;
  if (keepReview && $("#review")) $("#review").innerHTML = keepReview;
  if (FEEDBACK && $("#review")) { $("#review").innerHTML = FEEDBACK; FEEDBACK = null; }
  maybeRestoreProposal();
}
// 页面刷新/切换后，把上次没处理完的归拢提议恢复出来
let RV_TRIED = false;
let RV_TITLES = {};
async function maybeRestoreProposal() {
  if (PROPOSALS || RV_TRIED || !$("#review")) return;
  RV_TRIED = true;
  try {
    const res = await fetch(BASE() + "/proposal" + QS());
    const d = await res.json();
    if (d.proposals && d.proposals.length) {
      PROPOSALS = d.proposals;
      RV_TITLES = d.titles || {};
      paintReview(d.ts);
    }
  } catch (e) {}
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
/* ── 台账视图 ── */
let VIEW = "threads";
let TD = null;           // 最近一次 /threads 数据
let MEM_OPEN = {};       // 事卡成员列表展开状态（跨轮询保持）
function switchView(v) {
  VIEW = v;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.v === v));
  $("#threads-view").style.display = v === "threads" ? "" : "none";
  $("#list").style.display = v === "threads" ? "none" : "";
  if (v === "threads") loadThreads();
}
async function loadThreads() {
  try {
    const res = await fetch(BASE() + "/threads" + QS());
    TD = await res.json();
    renderThreads();
  } catch (e) { /* 台账渲染失败不影响会话视图 */ }
}
let LOOSE_OPEN = false;
function renderThreads() {
  const box = $("#threads-view");
  if (!TD || TD.error) { box.innerHTML = '<div class="empty">台账数据加载失败</div>'; return; }
  let html = "";
  // 今天：按「球在谁手里」分队——等你拍板 / 还在弄 / 有动静
  const today = TD.today || [];
  if (today.length) {
    const waiting = [], busy = [], moved = [];
    for (const s of today) {
      const p = s.parkedAt || "";
      if (/等待|等你|待你|验收|确认|已交付|已定稿|已完成|补充/.test(p)) waiting.push(s);
      else if (/正在|中断|受阻|排查|失败|报错|卡住/.test(p)) busy.push(s);
      else moved.push(s);
    }
    const row = (s) => {
      const name = s.threadName || ((s.title && s.title !== s.key) ? s.title : (s.origin ? s.origin.slice(0, 16) + "…" : s.key.slice(0, 8)));
      return '<div class="tday-row"><span class="tday-name">' + escH(name) + '</span><span class="tday-park">' + escH(s.parkedAt || "") + '</span><span class="tday-time">' + rel(s.lastActivityAt) + "</span></div>";
    };
    html += '<div class="today2">'
      + (waiting.length ? '<div class="tq"><div class="tq-head">等你拍板 · ' + waiting.length + "</div>" + waiting.map(row).join("") + "</div>" : "")
      + (busy.length ? '<div class="tq"><div class="tq-head">还在弄 · ' + busy.length + "</div>" + busy.map(row).join("") + "</div>" : "")
      + (moved.length ? '<div class="tq"><div class="tq-head">今天有动静 · ' + moved.length + "</div>" + moved.map(row).join("") + "</div>" : "")
      + "</div>";
  }
  const act = TD.threads.filter((t) => t.status !== "done");
  const done = TD.threads.filter((t) => t.status === "done");
  html += '<div class="tgrid">' + act.map(tcardHtml).join("") + "</div>";
  if (done.length) {
    html += '<div class="label" style="margin:18px 0 10px">办完了 · ' + done.length + '</div><div class="tgrid">' + done.map(tcardHtml).join("") + "</div>";
  }
  if (!TD.threads.length) html += '<div class="empty">还没有归拢出任何「事」。到「会话」标签页跑一次归拢建议就有了。</div>';
  box.innerHTML = html;
}
function looseToggle() { LOOSE_OPEN = !LOOSE_OPEN; renderThreads(); }
/* 事卡：卡面只放能帮你「想起这件事」的东西——事名 + 成员会话的真实标题；
   停在哪 / 更多会话收进展开区，不在卡面占地方 */
/* 事卡（便签墙）：脸上只有 事名 / 最近一次你自己说的话 / 时间 / 几个会话。
   点开：每个会话的标题 + 你的第一句话 + 看看结尾；最底部才是「标为办完」。 */
let EXC = {};       // key -> 原文摘录缓存
let EXC_OPEN = {};  // key -> 展开状态
async function excToggle(key) {
  EXC_OPEN[key] = !EXC_OPEN[key];
  if (EXC_OPEN[key] && !EXC[key]) {
    EXC[key] = "loading";
    renderThreads();
    try {
      const res = await fetch(BASE() + "/excerpt" + QS() + "&key=" + key);
      EXC[key] = await res.json();
    } catch (e) { EXC[key] = { error: "读取失败" }; }
  }
  renderThreads();
}
function memRow(m) {
  const open = EXC_OPEN[m.key];
  const name = (m.title && m.title !== m.key) ? m.title : (m.origin ? m.origin.slice(0, 18) + "…" : m.key.slice(0, 8));
  let excHtml = "";
  if (open) {
    const d = EXC[m.key];
    if (d === "loading") excHtml = '<div class="exc">读原文中……</div>';
    else if (d && d.error) excHtml = '<div class="exc">⚠ ' + escH(d.error) + "</div>";
    else if (d && d.tail) excHtml = '<div class="exc">' + d.tail.map((x) => '<div><span class="exc-role ' + (x.role === "user" ? "u" : "a") + '">' + (x.role === "user" ? "你" : "助手") + "</span>" + escH(x.text) + "</div>").join("") + "</div>";
  }
  return '<div class="memrow"><div>· <span style="font-weight:600">' + escH(name) + '</span> <span style="color:var(--muted)">' + rel(m.lastActivityAt) + '</span> <span class="exc-link" data-key="' + m.key + '" onclick="excToggle(this.dataset.key)">' + (open ? "▾ 收起" : "▸ 看看结尾") + "</span></div>"
    + (m.origin ? '<div class="memorigin">“' + escH(m.origin) + '”</div>' : "")
    + excHtml + "</div>";
}
function tcardHtml(t) {
  const open = MEM_OPEN[t.id] ? "" : " style='display:none'";
  const ms = t.members || [];
  const latest = ms[0] || {};
  const detail = '<div class="tmem-list"' + open + ">"
    + ms.map(memRow).join("")
    + (t.parkedAt ? '<div style="margin-top:8px;font-size:12px;color:var(--muted)">最近一次停在这：' + escH(t.parkedAt) + "</div>" : "")
    + '<div style="margin-top:10px"><button class="tdone-btn" data-id="' + t.id + '" data-st="' + (t.status === "done" ? "active" : "done") + '" onclick="tstatus(this.dataset.id, this.dataset.st)">' + (t.status === "done" ? "其实还没办完" : "标为办完") + "</button></div>"
    + "</div>";
  return '<div class="tcard' + (t.status === "done" ? " done" : "") + '">'
    + '<div class="thead">'
    + '<span class="tname">' + escH(t.name) + "</span>"
    + '<span class="tstat">' + ms.length + ' 个会话 · ' + rel(t.lastTouched) + "</span>"
    + "</div>"
    + (latest.origin ? '<div class="tquote">“' + escH(latest.origin) + '”</div>' : "")
    + '<div class="tmem" data-id="' + t.id + '" onclick="tmem(this.dataset.id)">' + (MEM_OPEN[t.id] ? "▾ 收起" : "▸ 点开看每一段") + "</div>"
    + detail
    + "</div>";
}
function tmem(id) { MEM_OPEN[id] = !MEM_OPEN[id]; renderThreads(); }
async function tstatus(id, status) {
  await fetch(BASE() + "/threads/apply" + QS(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops: [{ action: "status", id, status }] }) });
  loadThreads();
}
/* 归拢建议：拉建议 → 逐条核对（含具体会话名） → 勾选批准才落账 */
let PROPOSALS = null;
let FEEDBACK = null;   // 落账回执：渲染后贴一次就清
function paintReview(ts) {
  const titleOf = RV_TITLES;
  const when = ts ? ' <span style="font-size:12px;color:var(--muted)">（' + rel(ts) + "提的，刷新页面也不会丢）</span>" : "";
  $("#review").innerHTML = '<div class="rv"><div style="font-size:13.5px;margin-bottom:2px"><b>AI 提了 ' + PROPOSALS.length + ' 条建议</b>' + when + '，理由和涉及的具体会话都在下面</div>'
    + '<div style="font-size:12px;color:var(--muted);margin-bottom:8px">逐条核对，不认可的勾掉；点「批准」才落账，点「算了」就清除这条建议。</div>'
    + PROPOSALS.map((p, i) => {
      const target = p.action === "assign" ? "归入已有事卡「" + escH(p.threadName) + "」" : "新建事卡「" + escH(p.name) + "」";
      const titles = p.keys.map((k) => "<div>· " + escH(titleOf[k] || k) + "</div>").join("");
      return '<label class="rv-item" style="align-items:flex-start"><input type="checkbox" checked data-i="' + i + '"><span style="flex:1"><b>' + target + "</b><span class='rv-reason'> —— " + escH(p.reason) + '</span><div style="margin-top:3px;font-size:12px;color:var(--muted)">' + titles + "</div></span></label>";
    }).join("")
    + '<div class="rv-actions"><button class="rv-ok" onclick="applyProposals()">批准选中的建议</button><button class="rv-cancel" onclick="cancelProposals()">算了</button></div></div>';
}
async function propose() {
  const btn = $("#propose-btn");
  btn.disabled = true; btn.textContent = "AI 正在读这些会话的摘要……";
  try {
    const res = await fetch(BASE() + "/threads/propose" + QS(), { method: "POST" });
    const d = await res.json();
    if (d.error) { $("#review").innerHTML = '<div class="err">⚠ ' + escH(d.error) + "</div>"; return; }
    PROPOSALS = d.proposals || [];
    if (!PROPOSALS.length) { $("#review").innerHTML = '<div class="rv">' + escH(d.note || "没有需要归拢的会话") + "</div>"; return; }
    paintReview(d.ts);
  } finally {
    btn.disabled = false; btn.textContent = "让 AI 提个归拢建议";
  }
}
async function applyProposals() {
  const checked = Array.from(document.querySelectorAll("#review input:checked")).map((el) => Number(el.dataset.i));
  const ops = [];
  for (const i of checked) {
    const p = PROPOSALS[i];
    if (!p) continue;
    if (p.action === "assign" && p.threadId) ops.push({ action: "assign", id: p.threadId, keys: p.keys });
    else if (p.name) ops.push({ action: "create", name: p.name, keys: p.keys });
  }
  if (ops.length) {
    await fetch(BASE() + "/threads/apply" + QS(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops }) });
    FEEDBACK = '<div class="rv"><b>落账了：</b>' + ops.map((o) => (o.action === "create" ? "新建事卡「" + escH(o.name) + "」" : "归入已有事卡") + "（" + o.keys.length + " 个会话）").join("；") + "</div>";
  }
  PROPOSALS = null;
  await load();
  await loadThreads();
}
function cancelProposals() {
  PROPOSALS = null;
  $("#review").innerHTML = "";
  fetch(BASE() + "/threads/proposal/clear" + QS(), { method: "POST" }); // 服务端也清掉，不再恢复
}

load();
loadThreads();
setInterval(load, 10000);
setInterval(() => { if (VIEW === "threads" && !PROPOSALS) loadThreads(); }, 15000);
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

  // ── 台账层（「事」的账本）──
  // threads.json 只存归拢结果（事名、状态、成员会话 key）；卡片内容实时从旁录档案推导，不产生新的 AI 文本
  const threadsPath = path.join(dataDir, "threads.json");
  const readThreads = () => {
    try { return JSON.parse(fs.readFileSync(threadsPath, "utf-8")); } catch { return { version: 1, threads: [] }; }
  };
  const writeThreads = (d) => {
    const tmp = threadsPath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(d, null, 2), "utf-8");
    fs.renameSync(tmp, threadsPath);
  };
  // AI 归拢提议落盘：页面刷新/切换不丢，批准或手动清除才消失
  const proposalPath = path.join(dataDir, "proposal.json");
  const readProposal = () => {
    try { return JSON.parse(fs.readFileSync(proposalPath, "utf-8")); } catch { return null; }
  };
  const writeProposal = (p) => {
    try {
      const tmp = proposalPath + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(p), "utf-8");
      fs.renameSync(tmp, proposalPath);
    } catch {}
  };
  const clearProposal = () => { try { fs.rmSync(proposalPath); } catch {} };
  // 一天的边界在凌晨 04:00（用户作息）：现在不到 4 点，今天从昨天 4 点算起
  const dayStart04 = () => {
    const n = new Date();
    const d = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 4, 0, 0, 0);
    if (n.getTime() < d.getTime()) d.setDate(d.getDate() - 1);
    return d.toISOString();
  };
  const deriveThreads = (recs) => {
    const byKey = new Map(recs.map((r) => [r.key, r]));
    const data = readThreads();
    const keyToThreadName = (k) => {
      for (const t of data.threads || []) if ((t.keys || []).includes(k)) return t.name;
      return null;
    };
    const assigned = new Set();
    const cards = [];
    for (const t of data.threads || []) {
      const members = (t.keys || []).map((k) => byKey.get(k)).filter(Boolean)
        .sort((a, b) => String(b.lastActivityAt || "").localeCompare(String(a.lastActivityAt || "")));
      for (const k of t.keys || []) assigned.add(k);
      if (!members.length) continue;
      const head = members[0];
      const nextSet = [];
      const seen = new Set();
      for (const m of members) {
        for (const n of (m.state?.next || [])) {
          const k2 = String(n).trim();
          if (k2 && !seen.has(k2)) { seen.add(k2); nextSet.push(k2); }
        }
      }
      cards.push({
        id: t.id, name: t.name, status: t.status || "active",
        lastTouched: head.lastActivityAt || head.updatedAt,
        memberCount: members.length,
        members: members.map((m) => ({ key: m.key, title: m.title || m.key, agentId: m.agentId, lastActivityAt: m.lastActivityAt, origin: (m.state?.origin || "").slice(0, 120) })),
        parkedAt: head.state?.parkedAt || "",
        outcome: head.state?.outcome || "",
        next: nextSet.slice(0, 5)
      });
    }
    cards.sort((a, b) => String(b.lastTouched).localeCompare(String(a.lastTouched)));
    const unassigned = recs.filter((r) => !assigned.has(r.key))
      .map((r) => ({ key: r.key, title: r.title || r.key, agentId: r.agentId, lastActivityAt: r.lastActivityAt, origin: (r.state?.origin || "").slice(0, 80), messageCount: r.messageCount || 0 }));
    const dayStart = dayStart04();
    const todayNames = cards.filter((k) => String(k.lastTouched) >= dayStart).map((k) => k.name);
    // 「今天」区：所有今天动过的会话（不管归没归类），按「球在谁手里」预分拣
    const today = recs.filter((r) => String(r.lastActivityAt || "") >= dayStart)
      .map((r) => ({
        key: r.key, title: r.title || r.key, threadName: keyToThreadName(r.key),
        origin: (r.state?.origin || "").slice(0, 60),
        parkedAt: (r.state?.parkedAt || "").slice(0, 120),
        lastActivityAt: r.lastActivityAt
      }))
      .sort((a, b) => String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)));
    return { threads: cards, unassigned, todayNames, today, generatedAt: new Date().toISOString() };
  };

  app.get("/sidecar/threads", (c) => {
    try {
      const out = deriveThreads(listSidecars());
      // 附上还活着的旧提议：已不含任何未归拢 key 的提议视为过期
      const saved = readProposal();
      if (saved && Array.isArray(saved.proposals) && saved.proposals.length) {
        const looseKeys = new Set(out.unassigned.map((u) => u.key));
        const alive = saved.proposals.filter((p) => (p.keys || []).some((k) => looseKeys.has(k)));
        if (alive.length) out.proposal = { ts: saved.ts, proposals: alive };
        else clearProposal();
      }
      return c.json(out);
    } catch (e) { return c.json({ error: e.message }, 500); }
  });

  // 会话原文摘录：返回最后几轮「你说 / 助手说」的原文，帮人回忆起这件事
  app.get("/sidecar/excerpt", (c) => {
    try {
      const key = c.req.query("key") || "";
      const rec = listSidecars().find((r) => r.key === key);
      if (!rec) return c.json({ error: "没找到这条会话" }, 404);
      if (!rec.sessionPath || !fs.existsSync(rec.sessionPath)) return c.json({ error: "原文文件不在了（可能已归档或删除）" }, 404);
      const raw = fs.readFileSync(rec.sessionPath, "utf-8");
      const texts = [];
      const clean = (t) => String(t)
        .replace(/\[?hana_reminder\]?[\s\S]*?\[?\/hana_reminder\]?/g, "")
        .replace(/<mood>[\s\S]*?<\/mood>/g, "")
        .trim();
      for (const line of raw.split("\n")) {
        if (!line) continue;
        let r; try { r = JSON.parse(line); } catch { continue; }
        if (r.type !== "message" || !r.message) continue;
        const role = r.message.role;
        if (role !== "user" && role !== "assistant") continue;
        const parts = [];
        for (const cc of r.message.content || []) { if (cc?.type === "text" && cc.text) parts.push(cc.text); }
        if (typeof r.message.content === "string") parts.push(r.message.content);
        const text = clean(parts.join("\n"));
        if (text) texts.push({ role, text: text.slice(0, 220) });
      }
      return c.json({ ok: true, tail: texts.slice(-4) });
    } catch (e) { return c.json({ error: e.message }, 500); }
  });

  app.post("/sidecar/threads/proposal/clear", (c) => {
    clearProposal();
    return c.json({ ok: true });
  });

  app.post("/sidecar/threads/apply", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const ops = Array.isArray(body.ops) ? body.ops : [];
      const data = readThreads();
      data.threads = data.threads || [];
      const now = new Date().toISOString();
      for (const op of ops) {
        if (op.action === "create" && op.name) {
          const id = "t" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
          data.threads.push({ id, name: String(op.name).slice(0, 40), status: "active", keys: Array.isArray(op.keys) ? op.keys : [], createdAt: now, updatedAt: now });
        } else if (op.action === "assign" && op.id && Array.isArray(op.keys)) {
          const t = data.threads.find((x) => x.id === op.id);
          if (t) { t.keys = Array.from(new Set([...(t.keys || []), ...op.keys])); t.updatedAt = now; }
        } else if (op.action === "unassign" && Array.isArray(op.keys)) {
          for (const t of data.threads) { t.keys = (t.keys || []).filter((k) => !op.keys.includes(k)); }
        } else if (op.action === "status" && op.id && op.status) {
          const t = data.threads.find((x) => x.id === op.id);
          if (t && ["active", "done"].includes(op.status)) { t.status = op.status; t.updatedAt = now; }
        } else if (op.action === "rename" && op.id && op.name) {
          const t = data.threads.find((x) => x.id === op.id);
          if (t) { t.name = String(op.name).slice(0, 40); t.updatedAt = now; }
        } else if (op.action === "merge" && op.fromId && op.intoId) {
          const from = data.threads.find((x) => x.id === op.fromId);
          const into = data.threads.find((x) => x.id === op.intoId);
          if (from && into) {
            into.keys = Array.from(new Set([...(into.keys || []), ...(from.keys || [])]));
            into.updatedAt = now;
            data.threads = data.threads.filter((x) => x.id !== op.fromId);
          }
        }
      }
      writeThreads(data);
      clearProposal(); // 落账后旧提议作废
      return c.json({ ok: true, count: data.threads.length });
    } catch (e) { return c.json({ error: e.message }, 500); }
  });

  // 半自动归拢提议：AI 读未归拢会话的摘要，建议「新建事卡」或「归入现有事」，人点头后才 apply
  app.post("/sidecar/threads/propose", async (c) => {
    try {
      const shared = globalThis.__sessionSidecar;
      if (!shared?.sampleText) return c.json({ error: "生成通道未就绪" }, 503);
      const recs = listSidecars();
      const data = readThreads();
      const assigned = new Set();
      for (const t of data.threads || []) for (const k of t.keys || []) assigned.add(k);
      const loose = recs.filter((r) => !assigned.has(r.key) && (r.messageCount || 0) >= 5 && r.state)
        .slice(0, 40)
        .map((r) => ({ key: r.key, 标题: r.title || "", 缘起: (r.state?.origin || "").slice(0, 90), 此刻: (r.state?.parkedAt || "").slice(0, 60) }));
      if (!loose.length) return c.json({ ok: true, proposals: [], note: "没有待归拢的会话" });
      const existing = (data.threads || []).map((t) => ({ id: t.id, 事名: t.name }));
      const sys = "你是个人事务归档助手。给你一批「会话摘要」（每条是一次 AI 对话干了什么）和一份已有的「事」清单。把会话归拢到「事」：能并入已有的就并入，并不了的提出新事名（不超过 15 字，用人话说清这件事是什么）。审阅类会话优先挂进被审的那件事。只输出 JSON：{\"proposals\":[{\"action\":\"assign\",\"threadId\":\"已有事id\",\"keys\":[...],\"reason\":\"一句话\"},{\"action\":\"create\",\"name\":\"新事名\",\"keys\":[...],\"reason\":\"一句话\"}]}";
      const user = "已有的事：" + JSON.stringify(existing) + "\n\n待归拢会话：" + JSON.stringify(loose);
      const raw = await shared.sampleText(sys, user, 2400);
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (!m) return c.json({ error: "模型未返回 JSON", raw: String(raw).slice(0, 300) }, 502);
      let parsed;
      try { parsed = JSON.parse(m[0]); } catch (e) { return c.json({ error: "JSON 解析失败: " + e.message, raw: m[0].slice(0, 300) }, 502); }
      const validKeys = new Set(loose.map((r) => r.key));
      const validIds = new Set(existing.map((t) => t.id));
      const proposals = (parsed.proposals || []).map((p) => ({
        action: p.action === "assign" && validIds.has(p.threadId) ? "assign" : "create",
        threadId: p.threadId || null,
        threadName: p.threadId ? (existing.find((t) => t.id === p.threadId)?.事名 || "") : "",
        name: String(p.name || "").slice(0, 40),
        keys: (Array.isArray(p.keys) ? p.keys : []).filter((k) => validKeys.has(k)),
        reason: String(p.reason || "").slice(0, 80)
      })).filter((p) => p.keys.length);
      const ts = new Date().toISOString();
      if (proposals.length) writeProposal({ ts, proposals });
      return c.json({ ok: true, proposals, looseCount: loose.length, ts });
    } catch (e) { return c.json({ error: e.message }, 500); }
  });

  app.get("/sidecar/data", (c) => {
    const sessions = listSidecars();
    const cat = projectCatalog();
    // 每个会话挂上归属的事名（没归类就是 null）
    const keyToThread = new Map();
    for (const t of readThreads().threads || []) for (const k of t.keys || []) keyToThread.set(k, t.name);
    for (const r of sessions) {
      const pid = r.sessionPath ? projectIdOfSession(r.sessionPath) : null;
      r.projectId = pid;
      r.projectName = pid ? (cat.byId[pid]?.name || null) : null;
      r.threadName = keyToThread.get(r.key) || null;
    }
    return c.json({ sessions, projects: (cat.order || []).map((id) => ({ id, name: cat.byId[id]?.name || id })), generatedAt: new Date().toISOString() });
  });

  // 还活着的归拢提议 + 涉及会话的标题（页面刷新后恢复用）
  app.get("/sidecar/proposal", (c) => {
    const saved = readProposal();
    if (!saved || !Array.isArray(saved.proposals) || !saved.proposals.length) return c.json({ proposals: [] });
    const recs = listSidecars();
    const assigned = new Set();
    for (const t of readThreads().threads || []) for (const k of t.keys || []) assigned.add(k);
    const looseKeys = new Set(recs.filter((r) => !assigned.has(r.key)).map((r) => r.key));
    const alive = saved.proposals.filter((p) => (p.keys || []).some((k) => looseKeys.has(k)));
    if (!alive.length) { clearProposal(); return c.json({ proposals: [] }); }
    const titles = {};
    for (const r of recs) titles[r.key] = r.title || r.key;
    return c.json({ ts: saved.ts, proposals: alive, titles });
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
    // 页面永远是日间模式：夜间模式的适配成本超过收益，统一用暖纸浅色
    const th = "light";
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
  <div class="tabs">
    <button class="tab on" data-v="threads" onclick="switchView('threads')">台账</button>
    <button class="tab" data-v="sessions" onclick="switchView('sessions')">会话</button>
  </div>
  <div id="threads-view"><div class="empty">加载中…</div></div>
  <div id="list" style="display:none"><div class="empty">加载中…</div></div>
</div>
<script>(function(){window.parent.postMessage({source:"hana-plugin",type:"ready"},"*")})();</script>
<script>${PAGE_JS}</script>
</body>
</html>`);
  });
}
