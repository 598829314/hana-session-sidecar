import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const name = "sidecar_note";
export const description = "向当前会话的「旁录」档案追加一条人工备注（关键决策、阻塞点、下一步、备忘）。当用户在会话中做出重要决策、确认口径、标记阻塞或明确下一步时使用，让旁录更准确地反映人的意志。";
export const parameters = {
  type: "object",
  properties: {
    text: { type: "string", description: "备注内容，一句话，不超过 80 字" },
    kind: {
      type: "string",
      enum: ["decision", "blocker", "next", "memo"],
      description: "decision=关键决策 / blocker=阻塞点 / next=明确的下一步 / memo=一般备忘"
    }
  },
  required: ["text"]
};
export const sessionPermission = {
  kind: "external_side_effect",
  describeSideEffect: () => ({
    kind: "local_write",
    summary: "向 session-sidecar 插件数据目录写入当前会话的一条旁录备注",
    ruleId: "session-sidecar-note"
  })
};

function keyOf(sessionPath) {
  return crypto.createHash("sha1").update(String(sessionPath)).digest("hex").slice(0, 16);
}

function agentFromPath(sp) {
  const m = String(sp || "").match(/agents[\\\/]([^\\\/]+)[\\\/]sessions[\\\/]/);
  return m ? m[1] : null;
}

export async function execute(input, ctx) {
  try {
    const sp = ctx.sessionPath;
    if (!sp) return { content: [{ type: "text", text: "无法确定当前会话路径，备注未写入。" }] };
    const text = String(input.text || "").trim().slice(0, 200);
    if (!text) return { content: [{ type: "text", text: "备注内容为空，未写入。" }] };
    const kind = ["decision", "blocker", "next", "memo"].includes(input.kind) ? input.kind : "memo";

    const storeDir = path.join(ctx.dataDir, "sidecars");
    fs.mkdirSync(storeDir, { recursive: true });
    const k = keyOf(sp);
    const p = path.join(storeDir, `${k}.json`);
    let rec = null;
    try { rec = JSON.parse(fs.readFileSync(p, "utf-8")); } catch { /* first note */ }
    if (!rec) {
      rec = {
        version: 1, key: k, sessionPath: sp, sessionId: null,
        agentId: agentFromPath(sp), title: "",
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(), messageCount: 0,
        state: null, notes: [], gen: { lastMsgCount: -1 }
      };
    }
    rec.notes = rec.notes || [];
    rec.notes.push({ ts: new Date().toISOString(), kind, text });
    if (rec.notes.length > 20) rec.notes = rec.notes.slice(-20);
    rec.updatedAt = new Date().toISOString();
    const tmp = p + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(rec, null, 2), "utf-8");
    fs.renameSync(tmp, p);

    // 让 runtime 尽快重新生成，把备注语境吸收进档案
    const shared = globalThis.__sessionSidecar;
    if (shared?.touch) shared.touch(sp);

    return {
      content: [{ type: "text", text: `旁录备注已写入：[${kind}] ${text}` }],
      details: { sidecar: { key: k, kind, text } }
    };
  } catch (e) {
    ctx.log?.error?.("[session-sidecar] sidecar_note failed:", e?.stack || e?.message || String(e));
    throw e;
  }
}
