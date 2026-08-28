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
/* ═══════════════════════════════════════════════════
   1. PRIMITIVE TOKENS — 原始设计值（仅此处出现具体数值）
   ═══════════════════════════════════════════════════ */
:root{
  /* 暖纸色系（HSL，便于透明度控制） */
  --paper-50:  hsl(45, 38%, 97.5%);
  --paper-100: hsl(44, 32%, 94.5%);
  --paper-150: hsl(43, 30%, 92%);
  --paper-200: hsl(42, 26%, 89.5%);
  --paper-300: hsl(40, 22%, 84%);
  --paper-400: hsl(38, 14%, 68%);

  /* 墨色 */
  --ink-900: hsl(36, 20%, 16%);
  --ink-700: hsl(36, 13%, 30%);
  --ink-500: hsl(35, 9%, 45%);
  --ink-400: hsl(36, 8%, 63%);

  /* 状态色 */
  --amber-700: hsl(26, 70%, 34%);
  --amber-600: hsl(28, 76%, 43%);
  --amber-200: hsl(36, 70%, 82%);
  --amber-100: hsl(38, 85%, 93.5%);
  --blue-700:  hsl(210, 42%, 32%);
  --blue-600:  hsl(210, 35%, 44%);
  --blue-200:  hsl(208, 40%, 84%);
  --blue-100:  hsl(207, 45%, 95%);
  --sage-700:  hsl(98, 26%, 32%);
  --sage-600:  hsl(96, 20%, 51%);
  --sage-200:  hsl(97, 26%, 83%);
  --sage-100:  hsl(95, 30%, 93.5%);
  --stone-600: hsl(42, 14%, 42%);
  --stone-500: hsl(42, 12%, 54%);
  --stone-200: hsl(44, 20%, 84%);
  --stone-100: hsl(45, 22%, 91.5%);
  --sand-500:  hsl(38, 16%, 66%);

  /* 点缀金 */
  --gold-700: hsl(36, 45%, 32%);
  --gold-600: hsl(37, 42%, 39%);
  --gold-200: hsl(40, 45%, 82%);
  --gold-100: hsl(42, 55%, 89%);

  /* 间距（4px 基） */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px;

  /* 字号阶梯 */
  --text-xs:   11.5px;
  --text-sm:   12.5px;
  --text-base: 13.5px;
  --text-md:   14.5px;
  --text-lg:   17px;
  --text-xl:   19px;

  /* 圆角 */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 999px;

  /* 阴影（暖色调制） */
  --shadow-sm: 0 1px 2px hsl(40, 30%, 30%, .06);
  --shadow-md: 0 2px 8px hsl(40, 30%, 30%, .08);

  /* 动效 */
  --duration-fast:   150ms;
  --duration-normal: 200ms;
  --ease-standard:   ease-in-out;
  --ease-out:        ease-out;

  /* 焦点环 */
  --ring-width: 2px;
  --ring-offset: 2px;
}

/* ═══════════════════════════════════════════════════
   2. SEMANTIC TOKENS — 用途别名
   ═══════════════════════════════════════════════════ */
:root{
  --surface:          var(--paper-100);   /* 页面底 */
  --surface-raised:   var(--paper-50);    /* 卡片/阅读面板 */
  --surface-sunken:   var(--paper-150);   /* 左栏 */
  --surface-overlay:  var(--gold-100);    /* 选中底 */
  --border:           var(--paper-300);
  --border-strong:    var(--gold-200);

  --text-primary:     var(--ink-900);
  --text-secondary:   var(--ink-500);
  --text-tertiary:    var(--ink-400);

  --accent:           var(--gold-600);
  --accent-strong:    var(--gold-700);
  --ring:             var(--gold-600);

  /* 五类状态：前景 / 底色 / 边线，三组成套 */
  --status-wait-fg:     var(--amber-600);
  --status-wait-strong: var(--amber-700);
  --status-wait-bg:     var(--amber-100);
  --status-wait-border: var(--amber-200);
  --status-doing-fg:     var(--blue-600);
  --status-doing-strong: var(--blue-700);
  --status-doing-bg:     var(--blue-100);
  --status-doing-border: var(--blue-200);
  --status-idle-fg:     var(--stone-600);
  --status-idle-bg:     var(--stone-100);
  --status-idle-border: var(--stone-200);
  --status-old-fg:      var(--sand-500);
  --status-old-bg:      var(--stone-100);
  --status-old-border:  var(--stone-200);
  --status-done-fg:     var(--sage-700);
  --status-done-solid:  var(--sage-600);
  --status-done-bg:     var(--sage-100);
  --status-done-border: var(--sage-200);

  --spacing-component: var(--space-4);
  --spacing-section:   var(--space-6);
}

/* ═══════════════════════════════════════════════════
   3. COMPONENT TOKENS — 组件级
   ═══════════════════════════════════════════════════ */
:root{
  /* 通用交互 */
  --interactive-transition: color var(--duration-fast) var(--ease-standard),
                            background-color var(--duration-fast) var(--ease-standard),
                            border-color var(--duration-fast) var(--ease-standard),
                            box-shadow var(--duration-normal) var(--ease-out),
                            transform var(--duration-normal) var(--ease-out);

  /* 左栏导航项 */
  --nav-item-radius: var(--radius-md);
  --nav-item-hover-bg: var(--paper-200);
  --nav-item-active-bg: var(--surface-overlay);

  /* 中栏条目 */
  --row-radius:        var(--radius-lg);
  --row-hover-bg:      var(--paper-50);
  --row-hover-border:  var(--paper-300);
  --row-active-bg:     var(--surface-overlay);
  --row-active-border: var(--border-strong);
  --row-padding:       var(--space-3);

  /* 字形徽章 */
  --badge-size:   20px;
  --badge-size-lg: 26px;
  --badge-radius: var(--radius-sm);

  /* 阅读面板卡片 */
  --pcard-bg:     hsl(44, 45%, 95.5%);
  --pcard-border: hsl(42, 30%, 87%);
  --pcard-radius: var(--radius-lg);
  --pcard-padding: var(--space-4);

  /* 输入框 */
  --input-bg:            var(--surface-raised);
  --input-border:        var(--border);
  --input-focus-border:  var(--gold-200);

  /* 按钮 */
  --btn-bg:         var(--surface-raised);
  --btn-border:     var(--border);
  --btn-hover-border: var(--border-strong);
  --btn-radius:     var(--radius-md);
}

/* ═══ 基础 ═══ */
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%}
body{
  background:var(--surface);color:var(--text-primary);
  font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB",sans-serif;
  font-size:var(--text-base);line-height:1.6;-webkit-font-smoothing:antialiased;overflow:hidden;
}
.app{height:100vh;display:flex;flex-direction:column}

/* 通用可交互元素 */
.sitem,.mrow,.sort-btn,.tabs button{transition:var(--interactive-transition)}
:focus{outline:none}
:focus-visible{
  box-shadow:0 0 0 var(--ring-offset) var(--surface),
             0 0 0 calc(var(--ring-offset) + var(--ring-width)) var(--ring);
  border-radius:var(--radius-sm);
}

/* 滚动条 */
::-webkit-scrollbar{width:8px;height:8px}
::-webkit-scrollbar-thumb{background:var(--paper-300);border-radius:var(--radius-full)}
::-webkit-scrollbar-thumb:hover{background:var(--paper-400)}
::-webkit-scrollbar-track{background:transparent}

/* ═══ 顶栏 ═══ */
header.top{
  flex:0 0 54px;display:flex;align-items:center;gap:var(--space-6);
  padding:0 var(--space-6);border-bottom:1px solid var(--border);background:var(--surface);
}
header.top h1{font-size:var(--text-lg);font-weight:700;white-space:nowrap;letter-spacing:.3px}
.tabs{display:flex;gap:var(--space-5)}
.tabs button{
  background:none;border:none;font-size:var(--text-base);color:var(--text-secondary);cursor:pointer;
  padding:var(--space-2) var(--space-1);font-family:inherit;position:relative;
}
.tabs button:hover{color:var(--text-primary)}
.tabs button.on{color:var(--text-primary);font-weight:600}
.tabs button.on::after{
  content:"";position:absolute;left:0;right:0;bottom:-2px;height:2px;
  background:var(--accent);border-radius:var(--radius-full);
}
.search{margin-left:auto;position:relative;width:280px}
.search input{
  width:100%;padding:7px var(--space-3) 7px 30px;font-size:13px;font-family:inherit;
  background:var(--input-bg);border:1px solid var(--input-border);border-radius:var(--radius-md);
  color:var(--text-primary);
}
.search input:focus{border-color:var(--input-focus-border);box-shadow:0 0 0 3px var(--gold-100)}
.search::before{
  content:"";position:absolute;left:11px;top:50%;width:10px;height:10px;transform:translateY(-58%);
  border:2px solid var(--text-tertiary);border-radius:50%;
}
.search::after{
  content:"";position:absolute;left:20px;top:calc(50% + 2px);width:6px;height:2px;
  background:var(--text-tertiary);transform:rotate(45deg);
}
.search kbd{
  position:absolute;right:8px;top:50%;transform:translateY(-50%);
  font-family:inherit;font-size:var(--text-xs);color:var(--text-tertiary);
  border:1px solid var(--border);border-radius:var(--radius-sm);padding:0 5px;background:var(--surface);
}
.fresh{font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:6px;white-space:nowrap;font-variant-numeric:tabular-nums}
.fresh .dot{width:7px;height:7px;border-radius:50%;background:var(--stone-200);transition:background var(--duration-normal) var(--ease-standard)}
.fresh.pulse .dot{background:var(--status-done-solid);box-shadow:0 0 0 4px var(--status-done-bg)}

/* ═══ 三栏 ═══ */
.main{flex:1;display:flex;min-height:0}

/* ── 左栏 ── */
.side{flex:0 0 172px;border-right:1px solid var(--border);padding:var(--space-4) var(--space-2);overflow-y:auto;background:var(--surface-sunken)}
.side .cap{font-size:var(--text-xs);color:var(--text-tertiary);letter-spacing:2px;padding:var(--space-2) var(--space-3) var(--space-1)}
.sitem{
  display:flex;align-items:center;gap:10px;padding:7px var(--space-3);border-radius:var(--nav-item-radius);
  cursor:pointer;font-size:var(--text-base);color:var(--text-primary);
}
.sitem:hover{background:var(--nav-item-hover-bg)}
.sitem.on{background:var(--nav-item-active-bg);font-weight:600}
.sitem .cnt{margin-left:auto;font-size:12px;color:var(--text-secondary);font-variant-numeric:tabular-nums}
.sitem .sic{flex:0 0 18px;text-align:center;font-size:14px}
.sitem.dim{color:var(--text-secondary)}
.shr{height:1px;background:var(--border);margin:10px var(--space-3)}

/* 窗口不够宽时：左栏收成图标条，把宽度让给阅读区 */
.slbl-short{display:none}
@media (max-width: 1150px){
  .slbl-full{display:none}
  .slbl-short{display:inline}
  .side{flex-basis:56px;padding:var(--space-4) 6px}
  .side .cap{display:none}
  .sitem{flex-direction:column;gap:2px;padding:8px 2px;text-align:center}
  .sitem .sic{flex:none;font-size:17px}
  .sitem{font-size:10px;line-height:1.2;word-break:keep-all;overflow:hidden}
  .sitem .cnt{margin-left:0;font-size:10px}
  .shr{margin:8px 4px}
}

/* ── 中栏 ── */
.list{flex:0 1 400px;min-width:300px;border-right:1px solid var(--border);display:flex;flex-direction:column;min-height:0}
.lhead{
  flex:0 0 auto;padding:10px 18px;border-bottom:1px solid var(--border);
  display:flex;align-items:center;gap:10px;
}
.lhead h2{font-size:var(--text-md);font-weight:700}
.lhead .cnt{font-size:12px;color:var(--text-secondary);font-variant-numeric:tabular-nums}
.sort-btn{
  margin-left:auto;font-size:12px;color:var(--text-secondary);
  background:var(--btn-bg);border:1px solid var(--btn-border);border-radius:var(--btn-radius);
  padding:3px 10px;cursor:pointer;font-family:inherit;white-space:nowrap;
}
.sort-btn:hover{border-color:var(--btn-hover-border);color:var(--text-primary)}
.lrows{flex:1;overflow-y:auto;padding:6px var(--space-2) var(--space-5)}

/* 分组带 */
.gband{
  display:flex;align-items:center;gap:var(--space-2);margin:10px 6px var(--space-1);padding:var(--space-1) 10px;
  font-size:12px;font-weight:600;border-radius:7px;
}
.gband.wait {color:var(--status-wait-fg); background:var(--status-wait-bg)}
.gband.doing{color:var(--status-doing-fg);background:var(--status-doing-bg)}
.gband.idle {color:var(--status-idle-fg); background:var(--status-idle-bg)}

/* 条目卡 */
.mrow{
  display:flex;gap:10px;padding:9px 10px;margin:var(--space-1);border-radius:var(--row-radius);
  cursor:pointer;border:1px solid transparent;
}
.mrow:hover{background:var(--row-hover-bg);border-color:var(--row-hover-border);box-shadow:var(--shadow-sm)}
.mrow.on{background:var(--row-active-bg);border-color:var(--row-active-border)}
.mrow .body{flex:1;min-width:0}
.mr-top{display:flex;align-items:baseline;gap:var(--space-2)}
.mr-thread{font-weight:600;font-size:var(--text-base);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mr-top time{margin-left:auto;font-size:var(--text-xs);color:var(--text-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}
.mr-quote{font-size:13px;color:var(--text-primary);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mr-quote::before{content:"“";color:var(--text-tertiary)}
.mr-quote::after{content:"”";color:var(--text-tertiary)}
.mr-sub{font-size:12px;margin-top:1px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mr-sub.wait{color:var(--status-wait-fg)}
.mr-sub.doing{color:var(--status-doing-fg)}
.mrow.dim .mr-thread,.mrow.dim .mr-quote{color:var(--text-secondary);font-weight:400}

/* 字形徽章：类别三编码（字形 + 色彩 + 图标），不依赖颜色单通道 */
.badge{
  flex:0 0 var(--badge-size);height:var(--badge-size);border-radius:var(--badge-radius);margin-top:2px;
  display:flex;align-items:center;justify-content:center;
  font-size:var(--text-xs);font-weight:700;color:var(--paper-50);
}
.badge.wait {background:var(--status-wait-fg)}
.badge.doing{background:var(--status-doing-fg)}
.badge.idle {background:var(--status-idle-fg)}
.badge.old  {background:var(--status-old-fg)}
.badge.done {background:var(--status-done-solid)}
.badge.lg{flex:0 0 var(--badge-size-lg);height:var(--badge-size-lg);font-size:var(--text-md);border-radius:var(--radius-md);margin-top:0}

/* ── 右栏 ── */
.pane{flex:1.8;overflow-y:auto;background:var(--surface-raised);min-width:0}
.p-inner{max-width:var(--pane-max,680px);margin:0 auto;padding:var(--space-6) var(--space-8) 80px}
.p-head{display:flex;gap:14px;align-items:flex-start}
.p-title{flex:1;min-width:0}
.p-tags{display:flex;gap:var(--space-2);align-items:center;margin-bottom:var(--space-2);flex-wrap:wrap}
.ptag{
  background:var(--surface-sunken);border:1px solid var(--border);border-radius:var(--radius-sm);
  padding:2px 10px;font-size:12px;color:var(--ink-700);
}
.pchip{
  display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;
  padding:2px 10px;border-radius:var(--radius-full);border:1px solid transparent;
}
.pchip.wait {background:var(--status-wait-bg); color:var(--status-wait-fg); border-color:var(--status-wait-border)}
.pchip.doing{background:var(--status-doing-bg);color:var(--status-doing-fg);border-color:var(--status-doing-border)}
.pchip.idle,.pchip.old{background:var(--status-idle-bg);color:var(--status-idle-fg);border-color:var(--status-idle-border)}
.pchip.done {background:var(--status-done-bg); color:var(--status-done-fg); border-color:var(--status-done-border)}
.p-quote{font-size:var(--text-xl);line-height:1.55;font-weight:600}
.p-quote::before{content:"“";color:var(--text-tertiary)}
.p-quote::after{content:"”";color:var(--text-tertiary)}
.p-meta{font-size:var(--text-sm);color:var(--text-secondary);margin-top:var(--space-2)}

/* 状态横幅 */
.p-status{
  display:flex;align-items:center;gap:10px;font-size:var(--text-base);font-weight:500;
  margin:var(--space-4) 0 6px;padding:11px 14px;border-radius:10px;border-left:4px solid;
}
.p-status.wait {background:var(--status-wait-bg); color:var(--status-wait-strong); border-left-color:var(--status-wait-fg)}
.p-status.doing{background:var(--status-doing-bg);color:var(--status-doing-strong);border-left-color:var(--status-doing-fg)}
.p-status.idle,.p-status.old{background:var(--status-idle-bg);color:var(--status-idle-fg);border-left-color:var(--status-idle-fg)}
.p-status.done {background:var(--status-done-bg); color:var(--status-done-fg);    border-left-color:var(--status-done-solid)}

/* 描述列表卡片 */
.pcard{
  background:var(--pcard-bg);border:1px solid var(--pcard-border);
  border-radius:var(--pcard-radius);padding:13px var(--pcard-padding);margin-top:var(--space-3);
}
.pcard h4{
  display:flex;align-items:center;gap:7px;font-size:var(--text-xs);font-weight:700;
  color:var(--text-secondary);letter-spacing:1.5px;margin-bottom:6px;
}
.pcard h4 .ic{font-size:13px;letter-spacing:0}
.pcard p{font-size:var(--text-base);color:var(--ink-700)}
.pcard ul{list-style:none}
.pcard li{font-size:var(--text-base);color:var(--ink-700);padding-left:13px;position:relative}
.pcard li::before{content:"·";position:absolute;left:2px;color:var(--text-tertiary)}

/* 文件卡 */
.files{display:flex;flex-wrap:wrap;gap:var(--space-2);margin-top:var(--space-1)}
.file{
  display:inline-flex;align-items:center;gap:7px;background:var(--surface-raised);
  border:1px solid var(--border);border-radius:var(--radius-md);padding:6px 11px;
  font-size:var(--text-sm);color:var(--ink-700);box-shadow:var(--shadow-sm);
}
.file .ic{font-size:14px}

/* 时间轴 */
.tl{margin-top:var(--space-1);padding-left:var(--space-1)}
.tl-item{display:flex;gap:var(--space-3);position:relative;padding:0 0 var(--space-3) 18px}
.tl-item::before{content:"";position:absolute;left:4px;top:16px;bottom:-2px;width:2px;background:var(--border)}
.tl-item:last-child::before{display:none}
.tl-item .tdot{
  position:absolute;left:0;top:6px;width:10px;height:10px;border-radius:50%;
  background:var(--surface-raised);border:2.5px solid var(--paper-400);
}
.tl-item:first-child .tdot{border-color:var(--accent);background:var(--accent)}
.tl-time{flex:0 0 64px;font-size:12px;font-weight:600;color:var(--text-secondary);font-variant-numeric:tabular-nums}
.tl-txt{font-size:13px;color:var(--ink-700)}

/* 会话列表 */
.sess li{display:flex;justify-content:space-between;gap:var(--space-3);font-size:13px;color:var(--text-secondary);padding:7px 0;border-bottom:1px solid var(--paper-200)}
.sess li:last-child{border-bottom:none}
.sess li::before{display:none}
.sess .s-time{color:var(--text-tertiary);font-size:12px;white-space:nowrap;font-variant-numeric:tabular-nums}
.sess li b{font-weight:500;color:var(--ink-700)}
.p-empty{height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);font-size:var(--text-base)}
.empty{padding:var(--space-10);text-align:center;color:var(--text-tertiary);font-size:13px}

/* 会话页（旧样式，见底部 legacy 块） */
#page-sessions{display:none;flex:1;overflow-y:auto}

/* 降低动效偏好 */
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{transition:none !important;animation:none !important}
}

/* 旧变量 → 新 token 别名（会话页旧组件继续用旧名） */
:root{
  --fg: var(--ink-900); --muted: var(--ink-500); --text-muted: var(--ink-400);
  --card: var(--paper-150); --bg: var(--paper-100);
  --accent: var(--gold-600); --amber: var(--amber-600);
  --green: var(--sage-600); --blue: var(--blue-600);
}

/* ═══ legacy：会话标签页样式 ═══ */
.wrap { max-width: 860px; margin: 0 auto; padding: 28px 20px 64px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px; margin-bottom: 16px; }
.pgroup { margin-bottom: 30px; }
.pgroup-head { display: flex; align-items: baseline; gap: 10px; margin: 6px 2px 12px; border-bottom: 1px solid var(--border); padding-bottom: 7px; }
.pgroup-name { font-size: 15px; font-weight: 650; letter-spacing: .02em; }
.pgroup-stat { color: var(--muted); font-size: 11.5px; }
.card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.sbadge { font-size: 11px; padding: 2px 9px; border-radius: 99px; font-weight: 600; }
.sbadge.active { color: var(--green); background: color-mix(in srgb, var(--green) 14%, transparent); }
.sbadge.parked { color: var(--amber); background: color-mix(in srgb, var(--amber) 14%, transparent); }
.sbadge.done { color: var(--blue); background: color-mix(in srgb, var(--blue) 14%, transparent); }
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
.err { color: var(--amber); font-size: 12px; }
button.rf { font: inherit; font-size: 12px; color: var(--accent); background: none; border: 1px solid var(--border); border-radius: 8px; padding: 3px 10px; cursor: pointer; }
button.rf:hover { border-color: var(--accent); }
.exc-link { color: var(--accent); font-size: 12px; cursor: pointer; margin-left: 8px; user-select: none; }
.exc { font-size: 12.5px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; margin: 6px 0 4px; line-height: 1.7; }
.exc div + div { margin-top: 6px; }
.exc-role { display: inline-block; min-width: 30px; margin-right: 6px; font-size: 11px; font-weight: 700; }
.exc-role.u { color: var(--accent); }
.exc-role.a { color: var(--muted); }
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
.pdone { color: var(--accent); text-decoration: none; border-bottom: 1px dashed var(--accent); cursor: pointer; }
/* 顶栏版心宽度调节 */
.padctl { display: flex; align-items: center; gap: 8px; margin-left: 12px; user-select: none; }
.padctl-name { font-size: 12px; color: var(--ink-500); }
.padctl input[type="range"] { width: 110px; accent-color: var(--gold-600); cursor: pointer; }
/* 折叠卡：长的内容默认收起，第一眼不糊脸 */
details.pcard { padding: 0; }
details.pcard summary { cursor: pointer; list-style: none; padding: var(--space-4) var(--space-5); display: flex; align-items: center; gap: 8px;
  font-size: 12px; font-weight: 700; letter-spacing: .08em; color: var(--text-tertiary); text-transform: uppercase; user-select: none; }
details.pcard summary::-webkit-details-marker { display: none; }
details.pcard summary::after { content: "▸"; margin-left: auto; color: var(--ink-400); font-size: 12px; transition: transform var(--dur-fast) var(--ease-out); }
details.pcard[open] summary::after { transform: rotate(90deg); }
details.pcard summary .ic { font-size: 15px; }
details.pcard .fold-body { padding: 0 var(--space-5) var(--space-4); }
details.pcard .fold-body > p { margin: 0; }
/* 阅读面板正文字号抬一档，别密密麻麻 */
.pcard p, .pcard ul, .pcard li { font-size: var(--text-md); }
.pcard li { padding: 3px 0; }
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
      + '<span class="sbadge ' + st[1] + '">' + st[0] + "</span>"
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
/* ── 台账视图（三栏 master-detail，原型 v5 落地） ── */
const GDEF = {
  wait:  { char: "等", icon: "✋", name: "等你拍板" },
  doing: { char: "弄", icon: "⚙️", name: "还在弄" },
  idle:  { char: "缓", icon: "💤", name: "暂无待办" },
  old:   { char: "旧", icon: "🗄", name: "更早没动过的" },
  done:  { char: "完", icon: "✅", name: "办完的事" }
};
const GORDER = ["wait", "doing", "idle", "old", "done"];
const SIDENAV = [
  { id: "all",   label: "全部在途", short: "全部", groups: ["wait", "doing", "idle"], icon: "📋" },
  { id: "wait",  label: "等你拍板", short: "拍板", groups: ["wait"],  icon: "✋" },
  { id: "doing", label: "还在弄",   short: "在弄", groups: ["doing"], icon: "⚙️" },
  { id: "idle",  label: "暂无待办", short: "待办", groups: ["idle"],  icon: "💤" },
  { hr: true },
  { id: "old",   label: "更早没动过的", short: "更早", groups: ["old"],  icon: "🗄", dim: true },
  { id: "done",  label: "办完的事", short: "办完", groups: ["done"], icon: "✅", dim: true },
  { hr: true },
  { id: "inbox", label: "未归拢", short: "未归拢", groups: [], icon: "📥", dim: true, goto: "sessions" }
];
const SORTS = [ { id: "status", label: "⇅ 按状态" }, { id: "time", label: "⇅ 按时间" }, { id: "sess", label: "⇅ 按会话数" } ];
let TD = null;
let ENTRIES = [];
let NAV = "all", ROW = null, SORT_IDX = 0;
let EXC = {};       // key -> 原文摘录缓存
let EXC_OPEN = {};  // key -> 展开状态

function switchView(v) {
  document.querySelectorAll(".tabs button").forEach((b) => {
    const on = b.dataset.tab === v;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", on);
  });
  document.getElementById("page-ledger").style.display = v === "threads" ? "" : "none";
  document.getElementById("page-sessions").style.display = v === "threads" ? "none" : "block";
  if (v === "threads") loadThreads(); else load();
}

function dayStartJs() { const n = new Date(); const d = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 4, 0, 0, 0); if (n < d) d.setDate(d.getDate() - 1); return d; }
function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts), ds = dayStartJs();
  const hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  if (d >= ds) return "今天 " + hm;
  const y = new Date(ds); y.setDate(y.getDate() - 1);
  if (d >= y) return "昨天 " + hm;
  if ((ds - d) / 86400000 < 7) return "周" + "日一二三四五六"[d.getDay()] + " " + hm;
  return (d.getMonth() + 1) + "月" + d.getDate() + "日";
}
// 状态分拣：不看状态字段，看「此刻」那句话 + 最近动它的时间
function classify(status, parkedAt, lastTouched) {
  if (status === "done") return "done";
  const p = parkedAt || "";
  if (/等待|等你|待你|验收|确认|已交付|已定稿|已完成|补充|定夺|过目|选择/.test(p)) return "wait";
  if (/正在|中断|受阻|排查|失败|报错|卡住|修复中/.test(p)) return "doing";
  const days = (Date.now() - new Date(lastTouched).getTime()) / 86400000;
  return days >= 3 ? "old" : "idle";
}
function buildEntries() {
  const out = [];
  for (const t of (TD.threads || [])) {
    const ms = t.members || [];
    out.push({
      id: t.id, thread: t.name, quote: (ms[0] && ms[0].origin) || "",
      status: t.parkedAt || "", lastTouched: t.lastTouched, sess: t.memberCount || ms.length,
      agent: (ms[0] && ms[0].agentId) || "", state: t.status,
      detail: { narrative: t.narrative || "", parkedAt: t.parkedAt || "", outcome: t.outcome || "", next: t.next || [], progress: t.progress || [], members: ms }
    });
  }
  for (const u of (TD.unassigned || [])) {
    out.push({
      id: "u" + u.key, singleton: true,
      thread: (u.title && u.title !== u.key) ? u.title : ((u.origin || "").slice(0, 14) + "…"),
      quote: u.origin || "", status: u.parkedAt || "", lastTouched: u.lastActivityAt,
      sess: 1, agent: u.agentId || "", state: "active",
      detail: { narrative: u.narrative || "", parkedAt: u.parkedAt || "", outcome: u.outcome || "", next: u.next || [], progress: u.progress || [],
        members: [{ key: u.key, title: u.title, origin: u.origin, agentId: u.agentId, lastActivityAt: u.lastActivityAt }] }
    });
  }
  for (const e of out) e.g = classify(e.state, e.status, e.lastTouched);
  ENTRIES = out;
}
function entOf(groups) { return ENTRIES.filter((e) => groups.includes(e.g)); }

function renderSide() {
  const el = document.getElementById("side");
  let html = '<div class="cap">盘点</div>';
  for (const it of SIDENAV) {
    if (it.hr) { html += '<div class="shr"></div>'; continue; }
    const cnt = it.id === "inbox" ? (TD.unassigned || []).length : entOf(it.groups).length;
    html += '<div class="sitem' + (it.dim ? " dim" : "") + (NAV === it.id ? " on" : "") + '" data-nav="' + it.id + '" tabindex="0" role="button">'
      + '<span class="sic">' + it.icon + "</span>" + '<span class="slbl-full">' + it.label + '</span><span class="slbl-short">' + (it.short || it.label) + "</span>" + '<span class="cnt">' + cnt + "</span></div>";
  }
  el.innerHTML = html;
  el.querySelectorAll(".sitem").forEach((s) => {
    s.addEventListener("click", () => {
      const it = SIDENAV.find((x) => x.id === s.dataset.nav);
      if (it.goto) { switchView("sessions"); return; }
      NAV = it.id; ROW = null; renderSide(); renderList();
    });
  });
}

function sortedEntries() {
  const nav = SIDENAV.find((x) => x.id === NAV);
  const q = document.getElementById("q").value.trim().toLowerCase();
  let list = q
    ? ENTRIES.filter((e) => ((e.quote || "") + " " + e.thread + " " + (e.status || "") + " " + JSON.stringify(e.detail || {})).toLowerCase().includes(q))
    : entOf(nav.groups);
  const mode = SORTS[SORT_IDX].id;
  if (mode === "time") list = list.slice().sort((a, b) => String(b.lastTouched).localeCompare(String(a.lastTouched)));
  else if (mode === "sess") list = list.slice().sort((a, b) => b.sess - a.sess || String(b.lastTouched).localeCompare(String(a.lastTouched)));
  else list = list.slice().sort((a, b) => GORDER.indexOf(a.g) - GORDER.indexOf(b.g) || String(b.lastTouched).localeCompare(String(a.lastTouched)));
  return list;
}

function renderList() {
  const list = sortedEntries();
  const q = document.getElementById("q").value.trim();
  const nav = SIDENAV.find((x) => x.id === NAV);
  document.getElementById("ltitle").textContent = q ? "搜索“" + q + "”" : nav.label;
  document.getElementById("lcnt").textContent = list.length + " 件";
  const showBands = NAV === "all" && !q && SORTS[SORT_IDX].id === "status";
  let html = "", lastG = null;
  for (const e of list) {
    if (showBands && e.g !== lastG) { const gd = GDEF[e.g]; html += '<div class="gband ' + e.g + '">' + gd.icon + " " + gd.name + "</div>"; lastG = e.g; }
    const gd = GDEF[e.g];
    const dim = (e.g === "old" || e.g === "done") ? " dim" : "";
    html += '<div class="mrow' + dim + (ROW === e.id ? " on" : "") + '" data-id="' + e.id + '" tabindex="0" role="option" aria-selected="' + (ROW === e.id) + '">'
      + '<span class="badge ' + e.g + '" title="' + gd.name + '">' + gd.char + "</span>"
      + '<div class="body"><div class="mr-top"><span class="mr-thread">' + escH(e.thread) + "</span><time>" + fmtTime(e.lastTouched) + "</time></div>"
      + (e.quote ? '<div class="mr-quote" title="' + escH(e.quote) + '">' + escH(e.quote) + "</div>" : "")
      + (e.status ? '<div class="mr-sub ' + e.g + '" title="' + escH(e.status) + '">' + escH(e.status) + " · " + e.sess + " 段会话</div>" : '<div class="mr-sub">' + e.sess + " 段会话</div>")
      + "</div></div>";
  }
  document.getElementById("lrows").innerHTML = html || '<div class="empty">没查到，换个词试试</div>';
  document.querySelectorAll(".mrow").forEach((r) => {
    r.addEventListener("click", () => { ROW = r.dataset.id; renderList(); });
  });
  if (!ROW || !list.find((x) => x.id === ROW)) ROW = list.length ? list[0].id : null;
  document.querySelectorAll(".mrow").forEach((x) => { const on = x.dataset.id === ROW; x.classList.toggle("on", on); x.setAttribute("aria-selected", on); });
  renderPane();
}

function pcard(icon, title, inner) { return '<div class="pcard"><h4><span class="ic">' + icon + "</span>" + title + "</h4>" + inner + "</div>"; }
function pfold(icon, title, inner) { return '<details class="pcard fold"><summary><span class="ic">' + icon + "</span>" + title + "</summary><div class='fold-body'>" + inner + "</div></details>"; }
function extractFiles(texts) {
  const found = [];
  const re = /[\w一-龥（）()·\-【】《》\s]{2,60}\.(?:docx|xlsx|pptx|pdf|png|jpe?g|md|zip|html)/g;
  for (const t of texts) { let m; while ((m = re.exec(t || ""))) { const f = m[0].trim(); if (!found.includes(f)) found.push(f); } }
  return found.slice(0, 8);
}
async function excToggle(key) {
  EXC_OPEN[key] = !EXC_OPEN[key];
  if (EXC_OPEN[key] && !EXC[key]) {
    EXC[key] = "loading";
    renderPane();
    try {
      const res = await fetch(BASE() + "/excerpt" + QS() + "&key=" + key);
      EXC[key] = await res.json();
    } catch (e) { EXC[key] = { error: "读取失败" }; }
  }
  renderPane();
}
function sessRow(m) {
  const open = EXC_OPEN[m.key];
  const name = (m.title && m.title !== m.key) ? m.title : ((m.origin || "").slice(0, 16) + "…");
  let inner = "<b>" + escH(name) + '</b> <span class="exc-link" data-key="' + m.key + '" onclick="excToggle(this.dataset.key)">' + (open ? "▾ 收起" : "▸ 看看结尾") + '</span><span class="s-time">' + rel(m.lastActivityAt) + "</span>";
  if (open) {
    const d = EXC[m.key];
    if (d === "loading") inner += '<div class="exc">读原文中……</div>';
    else if (d && d.error) inner += '<div class="exc">⚠ ' + escH(d.error) + "</div>";
    else if (d && d.tail) inner += '<div class="exc">' + d.tail.map((x) => '<div><span class="exc-role ' + (x.role === "user" ? "u" : "a") + '">' + (x.role === "user" ? "你" : "助手") + "</span>" + escH(x.text) + "</div>").join("") + "</div>";
  }
  return "<li>" + inner + "</li>";
}
function renderPane() {
  const pane = document.getElementById("pane");
  const e = ENTRIES.find((x) => x.id === ROW);
  if (!e) { pane.innerHTML = '<div class="p-empty">点左边任何一条，这里看原文</div>'; return; }
  const d = e.detail || {};
  const gd = GDEF[e.g];
  let cards = "";
  // 第一眼只留三样：现在到哪了（横幅）→ 接下来要干什么 → 做成了什么；长的默认折叠
  if (d.next && d.next.length) cards += pcard("👉", "接下来要干什么", "<ul>" + d.next.map((x) => "<li>" + escH(x) + "</li>").join("") + "</ul>");
  const files = extractFiles([d.outcome || "", (d.progress || []).join(" ")]);
  if (d.outcome || files.length) {
    cards += pcard("📦", "做成了什么",
      (d.outcome ? "<p>" + escH(d.outcome) + "</p>" : "")
      + (files.length ? '<div class="files">' + files.map((f) => '<span class="file"><span class="ic">📄</span>' + escH(f) + "</span>").join("") + "</div>" : ""));
  }
  if (d.narrative) cards += pfold("🗂", "来龙去脉 · 这件事怎么走到今天的", "<p>" + escH(d.narrative) + "</p>");
  if (d.progress && d.progress.length) {
    const items = d.progress.slice().reverse().map((p) => {
      const m = String(p).match(/^\[?(\d{1,2}:\d{2})\]?\s+(.+)$/);
      return '<div class="tl-item"><span class="tdot"></span><span class="tl-time">' + (m ? escH(m[1]) : "") + '</span><span class="tl-txt">' + escH(m ? m[2] : p) + "</span></div>";
    }).join("");
    cards += pfold("🕐", "过程记录 · " + d.progress.length + " 条", '<div class="tl">' + items + "</div>");
  }
  if (d.members && d.members.length) {
    cards += pcard("💬", "相关的聊天 · " + d.members.length + " 段", '<ul class="sess">' + d.members.map(sessRow).join("") + "</ul>");
  }
  const doneLink = e.singleton ? "" : ' · <a href="javascript:void 0" class="pdone" data-id="' + e.id + '" data-st="' + (e.state === "done" ? "active" : "done") + '" onclick="tstatus(this.dataset.id, this.dataset.st)">' + (e.state === "done" ? "其实还没办完" : "标为办完") + "</a>";
  pane.innerHTML = '<div class="p-inner"><div class="p-head"><span class="badge lg ' + e.g + '">' + gd.char + "</span>"
    + '<div class="p-title"><div class="p-tags"><span class="ptag">' + escH(e.thread) + '</span><span class="pchip ' + e.g + '">' + gd.icon + " " + gd.name + "</span></div>"
    + '<div class="p-quote">' + escH(e.quote || e.thread) + "</div>"
    + '<div class="p-meta">' + fmtTime(e.lastTouched) + " · " + e.sess + " 段会话 · 由 " + escH(e.agent || "—") + " 经手" + doneLink + "</div></div></div>"
    + (e.status ? '<div class="p-status ' + e.g + '">' + gd.icon + " " + escH(e.status) + "</div>" : "")
    + cards + "</div>";
}
async function tstatus(id, status) {
  if (!id) return;
  await fetch(BASE() + "/threads/apply" + QS(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops: [{ action: "status", id, status }] }) });
  loadThreads();
}

async function loadThreads() {
  try {
    const res = await fetch(BASE() + "/threads" + QS());
    TD = await res.json();
    if (TD.error) return;
    buildEntries();
    const y1 = document.getElementById("lrows").scrollTop;
    const y2 = document.getElementById("pane").scrollTop;
    renderSide(); renderList();
    document.getElementById("lrows").scrollTop = y1;
    document.getElementById("pane").scrollTop = y2;
    const f = document.getElementById("fresh");
    f.classList.add("pulse"); setTimeout(() => f.classList.remove("pulse"), 900);
  } catch (e) { /* 台账渲染失败不影响会话视图 */ }
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
/* 顶栏交互 */
/* 版心宽度调节：拖动即改，关掉页面也记得住 */
(function () {
  const KEY = "sidecar-pane-max";
  const saved = parseInt(localStorage.getItem(KEY) || "0", 10);
  const range = document.getElementById("padRange");
  const apply = (v) => document.documentElement.style.setProperty("--pane-max", v + "px");
  if (saved >= 560 && saved <= 1000) { range.value = saved; apply(saved); }
  range.addEventListener("input", () => { const v = parseInt(range.value, 10); apply(v); localStorage.setItem(KEY, String(v)); });
})();

document.getElementById("sortBtn").addEventListener("click", () => {
  SORT_IDX = (SORT_IDX + 1) % SORTS.length;
  document.getElementById("sortBtn").textContent = SORTS[SORT_IDX].label;
  renderList();
});
document.getElementById("q").addEventListener("input", () => { ROW = null; renderList(); });
document.addEventListener("keydown", (ev) => {
  if (ev.key === "/" && document.activeElement.id !== "q") { ev.preventDefault(); document.getElementById("q").focus(); }
  if (ev.key === "Escape" && document.activeElement.id === "q") { document.getElementById("q").value = ""; ROW = null; renderList(); document.activeElement.blur(); }
});
document.querySelectorAll(".tabs button").forEach((b) => { b.addEventListener("click", () => switchView(b.dataset.tab)); });

load();
loadThreads();
setInterval(load, 10000);
setInterval(loadThreads, 15000);

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
        narrative: head.state?.narrative || "",
        progress: head.state?.progress || [],
        next: nextSet.slice(0, 5)
      });
    }
    cards.sort((a, b) => String(b.lastTouched).localeCompare(String(a.lastTouched)));
    const unassigned = recs.filter((r) => !assigned.has(r.key))
      .map((r) => ({ key: r.key, title: r.title || r.key, agentId: r.agentId, lastActivityAt: r.lastActivityAt, origin: (r.state?.origin || "").slice(0, 120), messageCount: r.messageCount || 0,
        parkedAt: (r.state?.parkedAt || "").slice(0, 160), outcome: r.state?.outcome || "", next: r.state?.next || [], narrative: r.state?.narrative || "", progress: r.state?.progress || [] }));
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
<div class="app">
  <header class="top">
    <h1>Session 旁录</h1>
    <nav class="tabs" role="tablist">
      <button class="on" data-tab="threads" role="tab" aria-selected="true">台账</button>
      <button data-tab="sessions" role="tab" aria-selected="false">会话</button>
    </nav>
    <div class="search">
      <input id="q" type="text" placeholder="搜原话、事名、文件名……" autocomplete="off" aria-label="搜索旁录">
      <kbd>/</kbd>
    </div>
    <label class="padctl" title="调整右侧阅读区的版心宽度">
      <span class="padctl-name">版心</span>
      <input id="padRange" type="range" min="560" max="1000" step="10" value="680" aria-label="阅读区宽度">
    </label>
    <div class="fresh" id="fresh"><span class="dot"></span><span id="meta">加载中…</span></div>
  </header>
  <div class="main" id="page-ledger">
    <aside class="side" id="side" role="navigation" aria-label="盘点分组"></aside>
    <section class="list" aria-label="事项清单">
      <div class="lhead">
        <h2 id="ltitle">全部在途</h2><span class="cnt" id="lcnt"></span>
        <button class="sort-btn" id="sortBtn" aria-label="切换排序方式">⇅ 按状态</button>
      </div>
      <div class="lrows" id="lrows" role="listbox" aria-label="事项列表"></div>
    </section>
    <section class="pane" id="pane" aria-label="旁录详情"><div class="p-empty">点左边任何一条，这里看原文</div></section>
  </div>
  <div id="page-sessions"><div class="wrap"><div id="list"><div class="empty">加载中…</div></div></div></div>
</div>
<script>(function(){window.parent.postMessage({source:"hana-plugin",type:"ready"},"*")})();</script>
<script>${PAGE_JS}</script>
</body>
</html>`);
  });
}
