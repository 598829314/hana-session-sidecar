import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const HOME = process.env.HANA_HOME || path.join(process.env.HOME || process.env.USERPROFILE, ".hanako");
const AGENTS_DIR = path.join(HOME, "agents");
const STORE_DIR = "sidecars";

// ── 工具函数 ──

function keyOf(sessionPath) {
  return crypto.createHash("sha1").update(String(sessionPath)).digest("hex").slice(0, 16);
}

// ── 记忆系统滚动摘要桥接：sessionPath → manifest DB → sess_id → summaries/<sess_id>.json ──
// 任一环节失败都静默降级返回 null，旁录照常从原始对话生成。
function readRollingSummary(agentId, sessionPath) {
  try {
    const { DatabaseSync } = require("node:sqlite");
    const dbPath = path.join(HOME, "session-manifest.db");
    if (!fs.existsSync(dbPath)) return null;
    const db = new DatabaseSync(dbPath, { readOnly: true });
    let sessId = null;
    try {
      const row = db.prepare("SELECT session_id FROM session_manifests WHERE current_locator_path = ?").get(String(sessionPath));
      sessId = row?.session_id || null;
    } finally { db.close(); }
    if (!sessId) return null;
    const p = path.join(AGENTS_DIR, String(agentId || ""), "memory", "summaries", `${sessId}.json`);
    if (!fs.existsSync(p)) return null;
    const j = JSON.parse(fs.readFileSync(p, "utf-8"));
    return typeof j.summary === "string" && j.summary.trim()
      ? { summary: j.summary, updatedAt: j.updated_at || "" }
      : null;
  } catch { return null; }
}

function isChatSessionPath(sp) {
  if (!sp || typeof sp !== "string") return false;
  if (!sp.endsWith(".jsonl")) return false;
  if (sp.includes(`${path.sep}archived${path.sep}`) || sp.includes("/archived/")) return false;
  if (sp.includes(`${path.sep}activity${path.sep}`) || sp.includes("/activity/")) return false;
  return new RegExp(`agents[\\/][^\\/]+[\\/]sessions[\\/][^\\/]+\\.jsonl$`).test(sp);
}

function agentFromPath(sp) {
  const m = String(sp || "").match(/agents[\\\/]([^\\\/]+)[\\\/]sessions[\\\/]/);
  return m ? m[1] : null;
}

function atomicWrite(filePath, content) {
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, content, "utf-8");
  fs.renameSync(tmp, filePath);
}

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
}

// 从 JSONL 提取浓缩对话摘录与统计
function extractTranscript(filePath, maxChars) {
  const stat = fs.statSync(filePath);
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split("\n");
  const out = {
    sessionId: null, cwd: null, firstUser: "", messages: [],
    messageCount: 0, userCount: 0, lastRole: null, lastTs: null, mtimeMs: stat.mtimeMs
  };
  const texts = (msg) => {
    const parts = [];
    for (const c of msg?.content || []) {
      if (c?.type === "text" && c.text) parts.push(c.text);
      else if (c?.type === "toolCall" || c?.type === "tool_call") {
        const nm = c.toolName || c.name || "tool";
        let args = "";
        try { args = JSON.stringify(c.arguments ?? c.args ?? c.input ?? {}).slice(0, 80); } catch { /* ignore */ }
        parts.push(`⚙ ${nm}(${args})`);
      }
    }
    if (typeof msg?.content === "string") parts.push(msg.content);
    return parts;
  };
  const entries = [];
  for (const line of lines) {
    if (!line) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (rec.type === "session") { out.sessionId = rec.id || null; out.cwd = rec.cwd || null; continue; }
    if (rec.type !== "message" || !rec.message) continue;
    const role = rec.message.role;
    if (role === "toolResult" || role === "tool_result") {
      const nm = rec.message.toolName || "tool";
      let snippet = "";
      for (const c of rec.message.content || []) {
        if (c?.type === "text" && c.text) { snippet = c.text.slice(0, 100); break; }
      }
      entries.push({ role: "toolResult", text: `↳ ${nm}: ${snippet}`, ts: rec.timestamp });
      out.messageCount += 1;
      out.lastRole = "toolResult"; out.lastTs = rec.timestamp || out.lastTs;
      continue;
    }
    if (role !== "user" && role !== "assistant") continue;
    const parts = texts(rec.message).filter(Boolean);
    if (!parts.length) continue;
    const text = parts.join("\n");
    entries.push({ role, text, ts: rec.timestamp });
    out.messageCount += 1;
    if (role === "user") { out.userCount += 1; if (!out.firstUser) out.firstUser = text.slice(0, 1500); }
    out.lastRole = role; out.lastTs = rec.timestamp || out.lastTs;
  }
  // 尾部窗口：从后往前累积到 maxChars
  const tail = [];
  let acc = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    const body = e.text.length > 600 ? e.text.slice(0, 600) + " …" : e.text;
    let tsTag = "";
    try {
      if (e.ts) tsTag = new Date(e.ts).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
    } catch { /* ignore */ }
    const line = `[${tsTag ? tsTag + " " : ""}${e.role}] ${body}`;
    if (acc + line.length > maxChars && tail.length >= 6) break;
    tail.unshift(line);
    acc += line.length;
  }
  out.excerpt = tail.join("\n");
  return out;
}

const SYSTEM_PROMPT = `你是「Session 旁录员」。你的职责是为一个 AI 助手会话维护一份结构化状态档案，让主人无需翻阅对话，就能知道这个会话为何开始、做了什么、形成了什么结果、停在哪里、以及后续可能继续什么。

输入会给你四部分：之前的状态档案（JSON，可能为空）、记忆系统滚动摘要（对会话早期历史的浓缩，可能缺失或滞后）、会话缘起（第一条用户消息）、最近的对话摘录（带时刻的最新细节）。滚动摘要与摘录冲突时，以摘录为准。

请输出更新后的状态档案，只输出一个 JSON 对象，不要输出任何其他内容。字段定义：
{
  "origin": "一句话说明会话为何开始（目的明确改变时才更新，否则保持稳定）",
  "narrative": "这一程：2~3 句连贯叙事，讲清这段时间会话做了什么、关键转折是什么、现在成了什么局面。像给同事发的一段工作交接，有因果有重点；不要罗列条目，不要复读时间线，每句不超过 40 字",
  "progress": ["最多 20 条时间线精选节点，从早到晚排列；每条尽量以 HH:MM 时刻开头（依据对话中出现的时间信息），一句话叙事该步骤做了什么；保留仍然成立的旧条目，追加新进展，可合并过时条目"],
  "outcome": "已形成的结果或产物（文件、结论、决策、修复），只说交付了什么，不复述过程；没有则为空字符串",
  "parkedAt": "此刻：一句话说明当前状态——正在推进什么，或停在哪个等待点。写状态本身，不要复述最后一个动作的细节过程，不要以「停在」开头",
  "next": ["最多 3 条，后续最可能继续的方向或明确待办，按优先级排列"],
  "status": "active（正在推进）/ parked（搁置等待外部输入）/ done（目标已达成）"
}

要求：严格基于对话事实与滚动摘要，不编造不存在的内容；对话中没有可靠时间信息的条目不写时刻；全部使用中文；progress 与 next 必须是字符串数组；narrative 是给人读的主体，必须比时间线更有提炼和取舍。`;

function renderMarkdown(rec) {
  const s = rec.state || {};
  const rel = rec.updatedAt || "";
  const lines = [];
  lines.push(`# ${rec.title || rec.sessionId || rec.key}`);
  lines.push(`> 旁录 · ${rec.agentId || "?"} · 更新于 ${rel}`);
  lines.push("");
  lines.push(`- 状态：${s.status === "done" ? "已完成" : s.status === "parked" ? "已搁置" : "进行中"}`);
  lines.push(`- 消息数：${rec.messageCount} · 工作目录：${rec.cwd || "—"}`);
  lines.push("");
  lines.push(`## 缘起`);
  lines.push(s.origin || "（尚无）");
  lines.push("");
  lines.push(`## 这一程`);
  lines.push(s.narrative || "（尚无）");
  lines.push("");
  lines.push(`## 进展时间线`);
  if (s.progress?.length) s.progress.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
  else lines.push("（尚无）");
  lines.push("");
  lines.push(`## 结果`);
  lines.push(s.outcome || "（尚无）");
  lines.push("");
  lines.push(`## 此刻`);
  lines.push(s.parkedAt || "（尚无）");
  lines.push("");
  lines.push(`## 接下来`);
  if (s.next?.length) s.next.forEach(n => lines.push(`- ${n}`));
  else lines.push("（尚无）");
  if (rec.notes?.length) {
    lines.push("");
    lines.push(`## 备注`);
    rec.notes.forEach(n => lines.push(`- [${n.kind}] ${n.text}`));
  }
  lines.push("");
  lines.push(`---`);
  lines.push(`*由 session-sidecar 自动生成 · ${rec.sessionPath}*`);
  return lines.join("\n");
}

// ── 跟随桥自愈注入 ──
// 背景：桌面端 UI 以 file:// 加载，挂件 iframe 是 http 源，跨域读不到父页面 DOM；
// 宿主没有任何官方 API 告知“正在查看的会话”。此补丁在顶层 frame 轮询激活的
// 聊天外壳并 postMessage 广播给插件 iframe；宿主 OTA 升级后自动重打。
// 卸载：删除 renderer 版本目录 index.html 中的 hana-session-follow.js script 标签即可。
const FOLLOW_BRIDGE_JS = `
(function () {
  "use strict";
  var PROTO = "hana.session-follow";
  var current = null;
  function readActive() {
    try {
      var shell = document.querySelector('[class*="sessionShellActive"] [data-session-path]');
      if (shell) return shell.getAttribute("data-session-path");
      var items = document.querySelectorAll('[data-session-path][class*="sessionItemActive"]');
      for (var i = 0; i < items.length; i++) {
        if (items[i].offsetParent !== null) return items[i].getAttribute("data-session-path");
      }
    } catch (e) {}
    return null;
  }
  function broadcast(p) {
    var msg = { protocol: PROTO, version: 1, type: "current-session", sessionPath: p };
    var frames = document.querySelectorAll("iframe");
    for (var i = 0; i < frames.length; i++) {
      try { if (frames[i].contentWindow) frames[i].contentWindow.postMessage(msg, "*"); } catch (e) {}
    }
  }
  function tick() {
    var p = readActive();
    if (p !== current) { current = p; broadcast(p); }
  }
  window.addEventListener("message", function (ev) {
    var d = ev && ev.data;
    if (d && d.protocol === PROTO && d.type === "ping") {
      broadcast(current !== null ? current : readActive());
    }
  });
  setInterval(tick, 700);
  tick();
})();
`;

function ensureFollowPatch(log) {
  try {
    const home = path.join(os.homedir(), ".hanako");
    const ptrDir = path.join(home, "artifacts", "pointers");
    if (!fs.existsSync(ptrDir)) return;
    const ptrFile = fs.readdirSync(ptrDir).find(f => f.endsWith(".renderer.current.json"));
    if (!ptrFile) return;
    const ptr = JSON.parse(fs.readFileSync(path.join(ptrDir, ptrFile), "utf-8"));
    const dir = ptr.versionDir;
    if (!dir || !fs.existsSync(dir)) return;
    const htmlPath = path.join(dir, "index.html");
    const modDir = path.join(dir, "modules");
    if (!fs.existsSync(htmlPath)) return;
    fs.mkdirSync(modDir, { recursive: true });
    fs.writeFileSync(path.join(modDir, "hana-session-follow.js"), FOLLOW_BRIDGE_JS);
    let html = fs.readFileSync(htmlPath, "utf-8");
    if (html.includes("hana-session-follow.js")) {
      log?.info?.("[sidecar] 跟随桥已存在:", htmlPath);
      return;
    }
    const backup = htmlPath + ".hana-follow-backup";
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, html);
    html = html.replace("</body>", '    <script src="modules/hana-session-follow.js"></script>\n</body>');
    if (html.includes("hana-session-follow.js")) {
      fs.writeFileSync(htmlPath, html);
      log?.info?.("[sidecar] 跟随桥已注入:", htmlPath, "（需重启 Hana 生效）");
    }
  } catch (e) {
    log?.warn?.("[sidecar] 跟随桥注入失败:", e?.message);
  }
}

// ── 插件主体 ──

export default class SessionSidecarPlugin {
  async onload() {
    const { dataDir, config, log, bus, pluginId } = this.ctx;
    const storeDir = path.join(dataDir, STORE_DIR);
    fs.mkdirSync(storeDir, { recursive: true });
    ensureFollowPatch(log);

    const shared = {
      dataDir, storeDir, log,
      sessions: new Map(),   // key -> { sessionPath, agentId, sessionId, title, dirtyTs, lastGenAt, lastMsgCount, generating }
      titleCacheAt: 0,
      queue: Promise.resolve()
    };
    globalThis.__sessionSidecar = shared;

    const cfg = () => ({
      enabled: config.get("enabled") !== false,
      debounceMs: Math.max(3, Number(config.get("debounceSec")) || 12) * 1000,
      minIntervalMs: Math.max(10, Number(config.get("minIntervalSec")) || 45) * 1000,
      maxExcerpt: Math.max(2000, Number(config.get("maxExcerptChars")) || 9000),
      debug: config.get("debugEvents") === true,
      genEndpoint: String(config.get("genEndpoint") || "").trim(),
      genApiKey: String(config.get("genApiKey") || ""),
      genModel: String(config.get("genModel") || "").trim()
    });

    // ── 调试事件日志：只记每种事件类型的首次出现，防刷屏 ──
    const debugPath = path.join(dataDir, "debug-events.jsonl");
    const debugSeen = new Set();
    const debugLog = (ev, sp) => {
      if (!cfg().debug) return;
      try {
        const type = ev?.type || (typeof ev === "string" ? ev : "?");
        if (debugSeen.has(type)) return;
        debugSeen.add(type);
        fs.appendFileSync(debugPath, JSON.stringify({ ts: new Date().toISOString(), type, sp: sp || null }) + "\n");
      } catch { /* ignore */ }
    };

    // ── 标题映射（尽力而为）──
    const refreshTitles = async () => {
      if (Date.now() - shared.titleCacheAt < 5 * 60 * 1000) return;
      try {
        const res = await bus.request("session:list", {});
        const list = res?.sessions || res?.items || (Array.isArray(res) ? res : []);
        for (const s of list) {
          const sp = s.sessionPath || s.path;
          if (!sp) continue;
          const k = keyOf(sp);
          const ent = shared.sessions.get(k);
          const title = s.title || s.name || "";
          if (ent) { ent.title = title || ent.title; }
          else if (isChatSessionPath(sp)) {
            shared.sessions.set(k, { sessionPath: sp, agentId: s.agentId || agentFromPath(sp), sessionId: null, title, dirtyTs: 0, lastSeenAt: 0, lastGenAt: 0, lastMsgCount: -1, generating: false });
          }
        }
        shared.titleCacheAt = Date.now();
      } catch (e) {
        log?.debug?.("[sidecar] session:list failed:", e?.message);
      }
    };

    // ── 标记脏 / 仅标记活跃 ──
    const ensure = (sp) => {
      if (!isChatSessionPath(sp)) return null;
      const k = keyOf(sp);
      let ent = shared.sessions.get(k);
      if (!ent) {
        ent = { sessionPath: sp, agentId: agentFromPath(sp), sessionId: null, title: "", dirtyTs: 0, lastSeenAt: 0, lastGenAt: 0, lastMsgCount: -1, generating: false };
        shared.sessions.set(k, ent);
      }
      return ent;
    };
    const touch = (sp) => {
      const ent = ensure(sp);
      if (ent) { ent.dirtyTs = Date.now(); ent.lastSeenAt = Date.now(); }
    };
    const seen = (sp) => {
      const ent = ensure(sp);
      if (ent) ent.lastSeenAt = Date.now();
    };
    shared.touch = touch;

    // ── 状态读写 ──
    const recPath = (k) => path.join(storeDir, `${k}.json`);
    const loadRec = (k) => readJsonSafe(recPath(k));
    const saveRec = (rec) => {
      rec.updatedAt = new Date().toISOString();
      atomicWrite(recPath(rec.key), JSON.stringify(rec, null, 2));
      atomicWrite(path.join(storeDir, `${rec.key}.md`), renderMarkdown(rec));
    };

    // ── LLM 生成 ──
    // ── LLM 调用：优先自定义 OpenAI 兼容端点，留空则走宿主默认模型 ──
    const sampleText = async (systemPrompt, userContent, maxTokens) => {
      const c = cfg();
      if (!c.genEndpoint) {
        const res = await bus.request("model:sample-text", {
          systemPrompt,
          messages: [{ role: "user", content: userContent }],
          maxTokens,
          temperature: 0.2,
          pluginId
        });
        return res?.text || res?.content || "";
      }
      const url = c.genEndpoint.replace(/\/+$/, "") + "/chat/completions";
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(c.genApiKey ? { Authorization: `Bearer ${c.genApiKey}` } : {})
        },
        body: JSON.stringify({
          model: c.genModel || "default",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent }
          ],
          max_tokens: maxTokens,
          temperature: 0.2,
          chat_template_kwargs: { enable_thinking: false }
        }),
        signal: AbortSignal.timeout(120000)
      });
      if (!r.ok) throw new Error(`自定义生成端点 HTTP ${r.status}`);
      const j = await r.json();
      return j?.choices?.[0]?.message?.content || "";
    };
    shared.sampleText = sampleText; // 暴露给路由层：台账归拢提议复用同一 LLM 通道

    const regenerate = async (ent, k) => {
      const c = cfg();
      ent.generating = true;
      try {
        const tr = extractTranscript(ent.sessionPath, c.maxExcerpt);
        const prev = loadRec(k);
        if (prev?.gen?.lastMsgCount === tr.messageCount && prev?.sessionPath === ent.sessionPath) {
          // 内容没有新增：活动时间以转录末尾消息为准（不用当前时间，避免重生成伪装成活跃）
          prev.lastActivityAt = tr.lastTs || prev.lastActivityAt;
          prev.messageCount = tr.messageCount;
          atomicWrite(recPath(k), JSON.stringify(prev, null, 2));
          ent.lastMsgCount = tr.messageCount;
          return;
        }
        const rs = readRollingSummary(ent.agentId, ent.sessionPath);
        const userPrompt = [
          "【之前的状态档案】",
          prev?.state ? JSON.stringify(prev.state, null, 2) : "（空，这是第一次生成）",
          "",
          "【记忆系统滚动摘要】（会话早期历史浓缩，可能滞后）",
          rs ? rs.summary : "（无）",
          "",
          "【会话缘起（第一条用户消息）】",
          tr.firstUser || "（未获取到）",
          "",
          "【最近对话摘录】",
          tr.excerpt || "（空）",
          "",
          "请输出更新后的状态档案 JSON。"
        ].join("\n");

        const text = (await sampleText(SYSTEM_PROMPT, userPrompt, 1500)).replace(/<think>[\s\S]*?<\/think>/g, "");
        const m = text.match(/\{[\s\S]*\}/);
        if (!m) throw new Error("LLM 未返回 JSON: " + text.slice(0, 120));
        const state = JSON.parse(m[0]);
        // 字段兜底
        state.progress = Array.isArray(state.progress) ? state.progress.map(String).slice(0, 20) : [];
        state.next = Array.isArray(state.next) ? state.next.map(String).slice(0, 3) : [];
        if (!state.narrative && state.parkedAt) state.narrative = String(state.parkedAt || "");
        state.narrative = String(state.narrative || "");
        if (!["active", "parked", "done"].includes(state.status)) state.status = "active";
        for (const f of ["origin", "outcome", "parkedAt"]) state[f] = String(state[f] || "");

        const rec = {
          version: 1,
          key: k,
          sessionPath: ent.sessionPath,
          sessionId: tr.sessionId,
          agentId: ent.agentId,
          cwd: tr.cwd,
          title: ent.title || prev?.title || "",
          createdAt: prev?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastActivityAt: tr.lastTs || new Date().toISOString(),
          messageCount: tr.messageCount,
          lastRole: tr.lastRole,
          state,
          notes: prev?.notes || [],
          gen: {
            lastGenAt: new Date().toISOString(),
            lastMsgCount: tr.messageCount,
            genCount: (prev?.gen?.genCount || 0) + 1,
            lastError: null
          }
        };
        saveRec(rec);
        ent.lastGenAt = Date.now();
        ent.lastMsgCount = tr.messageCount;
        log?.info?.(`[sidecar] generated for ${ent.agentId}/${path.basename(ent.sessionPath)} (msgs=${tr.messageCount}, gen#${rec.gen.genCount})`);
      } catch (e) {
        log?.warn?.("[sidecar] generate failed:", e?.message);
        const prev = loadRec(k);
        if (prev) {
          prev.gen = prev.gen || {};
          prev.gen.lastError = String(e?.message || e);
          try { atomicWrite(recPath(k), JSON.stringify(prev, null, 2)); } catch { /* ignore */ }
        }
        ent.lastGenAt = Date.now(); // 失败也退避，避免热循环
      } finally {
        ent.generating = false;
      }
    };

    // ── 调度循环 ──
    let tickCount = 0;
    const tick = () => {
      tickCount += 1;
      if (tickCount % 12 === 0) {
        const dirty = [...shared.sessions.values()].filter(e => e.dirtyTs).length;
        log?.debug?.(`[sidecar] heartbeat tick#${tickCount} sessions=${shared.sessions.size} dirty=${dirty}`);
      }
      if (!cfg().enabled) return;
      const now = Date.now();
      const c = cfg();
      for (const [k, ent] of shared.sessions) {
        if (!ent.dirtyTs || ent.generating) continue;
        if (now - ent.dirtyTs < c.debounceMs) continue;
        if (now - ent.lastGenAt < c.minIntervalMs) continue;
        ent.dirtyTs = 0;
        shared.queue = shared.queue.then(() => regenerate(ent, k)).catch(() => {});
      }
    };
    const timer = setInterval(tick, 5000);
    timer.unref?.();
    this.register(() => clearInterval(timer));

    // ── 事件总线订阅 ──
    // 实测事件谱系（2026-08-16 验证）：message_update 流式期间高频连发，不能作为生成触发，
    // 否则去抖永不成立；message_end / tool_execution_end 才是「一段工作落定」的边界信号。
    const SETTLE_EVENTS = new Set(["message_end", "tool_execution_end"]);
    const ACTIVE_ONLY = new Set(["message_update", "llm_usage", "tool_execution_start", "tool_execution_update", "token_usage", "context_usage"]);
    const unsub = bus.subscribe((ev, sp) => {
      debugLog(ev, sp);
      const path2 = sp || ev?.sessionPath || ev?.meta?.sessionPath || ev?.payload?.sessionPath || null;
      if (!path2 || !isChatSessionPath(path2)) return;
      const t = ev?.type || "";
      if (SETTLE_EVENTS.has(t)) touch(path2);
      else if (ACTIVE_ONLY.has(t)) seen(path2);
      else touch(path2); // 未知类型保守处理：标脏（消息数未变时不会触发 LLM 调用）
    });
    this.register(unsub);

    // ── 兜底扫描（mtime 驱动）──
    const sweep = (withinMs) => {
      if (!cfg().enabled) return;
      log?.debug?.("[sidecar] sweep within=" + withinMs);
      let agents = [];
      try { agents = fs.readdirSync(AGENTS_DIR, { withFileTypes: true }); } catch { return; }
      const now = Date.now();
      for (const a of agents) {
        if (!a.isDirectory()) continue;
        const sdir = path.join(AGENTS_DIR, a.name, "sessions");
        let files = [];
        try { files = fs.readdirSync(sdir, { withFileTypes: true }); } catch { continue; }
        for (const f of files) {
          if (!f.isFile() || !f.name.endsWith(".jsonl")) continue;
          const fp = path.join(sdir, f.name);
          try {
            const st = fs.statSync(fp);
            if (now - st.mtimeMs <= withinMs) touch(fp);
          } catch { /* ignore */ }
        }
      }
    };
    const sweepTimer = setInterval(() => sweep(15 * 60 * 1000), 60 * 1000);
    sweepTimer.unref?.();
    this.register(() => clearInterval(sweepTimer));

    // ── 启动播种：最近 2 小时有活动的会话先建档 ──
    refreshTitles().then(() => sweep(2 * 60 * 60 * 1000));

    log?.info?.("session-sidecar loaded; store=" + storeDir);
  }

  async onunload() {
    delete globalThis.__sessionSidecar;
  }
}
