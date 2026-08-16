import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const name = "sidecar_status";
export const description = "读取当前会话的「旁录」状态档案：为何开始、做了什么、形成了什么结果、停在哪里、后续可能继续什么。当用户问当前会话进展/状态/旁录，或你想确认旁录记录了什么时使用。";
export const parameters = {
  type: "object",
  properties: {},
  required: []
};
export const sessionPermission = {
  kind: "external_side_effect",
  describeSideEffect: () => ({
    kind: "local_read",
    summary: "读取 session-sidecar 插件数据目录中当前会话的旁录档案",
    ruleId: "session-sidecar-status"
  })
};

function keyOf(sessionPath) {
  return crypto.createHash("sha1").update(String(sessionPath)).digest("hex").slice(0, 16);
}

const STATUS_ZH = { active: "进行中", parked: "已搁置", done: "已完成" };

export async function execute(input, ctx) {
  try {
    const sp = ctx.sessionPath;
    if (!sp) return { content: [{ type: "text", text: "无法确定当前会话路径，旁录不可用。" }] };
    const storeDir = path.join(ctx.dataDir, "sidecars");
    const p = path.join(storeDir, `${keyOf(sp)}.json`);
    if (!fs.existsSync(p)) {
      return { content: [{ type: "text", text: "当前会话还没有旁录档案。旁录会在会话静止片刻后自动生成；也可以稍后再问。" }] };
    }
    const rec = JSON.parse(fs.readFileSync(p, "utf-8"));
    const s = rec.state || {};
    const lines = [];
    lines.push(`状态：${STATUS_ZH[s.status] || "进行中"} · 消息数 ${rec.messageCount} · 更新于 ${rec.updatedAt}`);
    lines.push(`【缘起】${s.origin || "（尚无）"}`);
    if (s.progress?.length) lines.push(`【进展】\n${s.progress.map((x, i) => `${i + 1}. ${x}`).join("\n")}`);
    if (s.outcome) lines.push(`【结果】${s.outcome}`);
    lines.push(`【停在】${s.parkedAt || "（尚无）"}`);
    if (s.next?.length) lines.push(`【接下来】\n${s.next.map(x => `- ${x}`).join("\n")}`);
    if (rec.notes?.length) lines.push(`【备注】\n${rec.notes.map(n => `- [${n.kind}] ${n.text}`).join("\n")}`);
    if (rec.gen?.lastError) lines.push(`⚠ 上次生成失败：${rec.gen.lastError}`);
    return {
      content: [{ type: "text", text: lines.join("\n") }],
      details: { sidecar: rec }
    };
  } catch (e) {
    ctx.log?.error?.("[session-sidecar] sidecar_status failed:", e?.stack || e?.message || String(e));
    throw e;
  }
}
