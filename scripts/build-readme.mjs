/**
 * 2026 机场推荐清单 README 生成器
 * - 数据源:机场查主站公开端点 https://www.jichangcha.com/api/airports.json(单一数据源 src/data/airports.ts)
 * - GitHub Actions 每日运行(.github/workflows/daily-sync.yml),有变化才提交
 * - 本地预览:node scripts/build-readme.mjs --local ../jichangcha.com/dist/api/airports.json
 * - 只为带图表数据的品牌生成 SVG;未实测品牌只展示资料口径,不伪造图表
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = process.env.AIRPORTS_JSON || 'https://www.jichangcha.com/api/airports.json';
const FONT = `system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif`;

/* ---------- 读取数据 ---------- */
async function loadData() {
  const i = process.argv.indexOf('--local');
  if (i > 0 && process.argv[i + 1]) {
    return JSON.parse(readFileSync(resolve(process.cwd(), process.argv[i + 1]), 'utf8'));
  }
  const res = await fetch(API, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'jichangcha-readme-sync' } });
  if (!res.ok) throw new Error(`fetch ${API} -> ${res.status}`);
  return res.json();
}
const data = await loadData();
const { airports, count, categoryLabel, categoryOrder, unlockLabel, links, site } = data;
if (!Array.isArray(airports) || airports.length < 10) throw new Error('数据异常:机场数量 ' + (airports?.length ?? 0));

const today = new Date().toISOString().slice(0, 10);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dotColor = { green: '#00e676', yellow: '#fbbf24', red: '#f87171' };
const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `No.${r}`);
const catEmoji = { classic: '🏛️', value: '💸', stable: '🛡️', premium: '👑' };
const catIntro = {
  classic: '运营年限长、口碑积累久的品牌,适合把稳定放在第一位的用户。',
  value: '入门价格低、流量单价划算的品牌,适合预算敏感和第一次买机场的用户。',
  stable: '以专线、不限速和长期可用为卖点的品牌,其中有站长实测记录的会标注日期。',
  premium: '高端专线定位、套餐层级完整的品牌,适合把网络当生产力的重度用户。',
};
const bySlug = Object.fromEntries(airports.map((a) => [a.slug, a]));
const byRank = [...airports].sort((a, b) => a.rank - b.rank);

/** 资料口径标签:有站长实测 / 套餐已核验 / 资料整理 */
function basisTag(a) {
  if (/站长实测/.test(a.dataBasis) && !/尚无独立实测|未实测/.test(a.dataBasis.split(';')[1] || '') && /有 20\d\d|为 20\d\d/.test(a.dataBasis)) return '✅ 站长实测';
  if (/截图核验/.test(a.dataBasis)) return '📋 套餐已核验';
  return '📝 资料整理';
}
const tested = byRank.filter((a) => basisTag(a) === '✅ 站长实测');

/* ---------- SVG(只给有图表数据的品牌) ---------- */
function speedSvg(a) {
  const rows = a.speed
    .map((n, i) => {
      const y = 96 + i * 66;
      return `
  <text x="40" y="${y}" fill="#e2e8f0" font-size="13" font-weight="600">● ${esc(n.region)}</text>
  <text x="660" y="${y}" fill="#94a3b8" font-size="12" text-anchor="end">延迟 ${n.latency}ms · 下载 <tspan fill="#00e676" font-weight="700">${n.download} MB/s</tspan></text>
  <rect x="40" y="${y + 10}" width="620" height="12" rx="6" fill="#ffffff12"/>
  <rect x="40" y="${y + 10}" width="${Math.round(620 * (n.pct / 100))}" height="12" rx="6" fill="${dotColor[n.status]}"/>`;
    })
    .join('');
  const avg = Math.round(a.speed.reduce((s, n) => s + n.latency, 0) / a.speed.length);
  const max = Math.max(...a.speed.map((n) => n.download));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 330" font-family="${FONT}">
  <rect width="700" height="330" rx="16" fill="#1e1e1e"/>
  <text x="24" y="36" fill="#00e676" font-size="16" font-weight="700">🌐 ${esc(a.name)}测速示意(统一口径模拟示例)</text>
  <text x="24" y="58" fill="#64748b" font-size="11">软件环境 Clash Verge Rev · 测试节点 Speedtest.net · 非站长实测,实际以自行测试为准</text>
  <line x1="24" x2="676" y1="68" y2="68" stroke="#ffffff22"/>${rows}
  <line x1="24" x2="676" y1="292" y2="292" stroke="#ffffff22"/>
  <text x="24" y="316" fill="#94a3b8" font-size="12">汇总:平均延迟 <tspan fill="#e2e8f0">${avg}ms</tspan> · 最高下载 <tspan fill="#00e676">${max} MB/s</tspan></text>
  <text x="676" y="316" fill="#ffffff4d" font-size="10" text-anchor="end" letter-spacing="2">jichangcha</text>
</svg>`;
}
const mark = { yes: ['✅', '#00e676', '已解锁'], partial: ['⚠️', '#fbbf24', '部分区'], no: ['❌', '#f87171', '不支持'] };
function unlockSvg(a) {
  const cells = unlockLabel
    .map((u, i) => {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = 28 + col * 130;
      const y = 84 + row * 92;
      const [icon, color, text] = mark[a.unlock[u.key]] || mark.no;
      return `
  <rect x="${x}" y="${y}" width="118" height="76" rx="10" fill="#ffffff0a"/>
  <text x="${x + 59}" y="${y + 26}" fill="#e2e8f0" font-size="12.5" font-weight="600" text-anchor="middle">${esc(u.name)}</text>
  <text x="${x + 59}" y="${y + 48}" font-size="14" text-anchor="middle">${icon}</text>
  <text x="${x + 59}" y="${y + 66}" fill="${color}" font-size="10.5" text-anchor="middle">${text}</text>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 300" font-family="${FONT}">
  <rect width="700" height="300" rx="16" fill="#1e1e1e"/>
  <text x="24" y="36" fill="#00e676" font-size="16" font-weight="700">🎬 ${esc(a.name)}流媒体 &amp; AI 解锁示意(模拟示例)</text>
  <text x="24" y="56" fill="#64748b" font-size="11">解锁状态随节点调整可能变化 · 非站长实测,购买前自行验证</text>
  <line x1="24" x2="676" y1="66" y2="66" stroke="#ffffff22"/>${cells}
  <text x="676" y="288" fill="#ffffff4d" font-size="10" text-anchor="end" letter-spacing="2">jichangcha</text>
</svg>`;
}
const banner = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 240" font-family="${FONT}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16181d"/><stop offset="1" stop-color="#1e2330"/></linearGradient>
  <linearGradient id="ac" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#00e676"/><stop offset="1" stop-color="#00b0ff"/></linearGradient></defs>
  <rect width="900" height="240" rx="18" fill="url(#bg)"/>
  <circle cx="790" cy="40" r="140" fill="#00e676" opacity="0.06"/><circle cx="90" cy="220" r="100" fill="#00b0ff" opacity="0.07"/>
  <text x="60" y="86" fill="#00e676" font-size="16" font-weight="600" letter-spacing="2">jichangcha.com 出品 · 每日自动同步 · ${today}</text>
  <text x="60" y="140" fill="#ffffff" font-size="42" font-weight="800">2026 机场推荐清单</text>
  <text x="60" y="178" fill="#cbd5e1" font-size="17">${count} 家机场 · 老牌 / 性价比 / 稳定 / 高端 · 套餐价格 · 优惠码 · 站长实测记录</text>
  <rect x="60" y="196" width="80" height="4" rx="2" fill="url(#ac)"/>
  <text x="840" y="220" fill="#ffffff4d" font-size="11" text-anchor="end" letter-spacing="2">jichangcha</text>
</svg>`;

mkdirSync(`${ROOT}/images`, { recursive: true });
writeFileSync(`${ROOT}/images/banner.svg`, banner);
let svgCount = 1;
for (const a of byRank) {
  if (a.speed && a.unlock) {
    writeFileSync(`${ROOT}/images/${a.slug}-speed.svg`, speedSvg(a));
    writeFileSync(`${ROOT}/images/${a.slug}-unlock.svg`, unlockSvg(a));
    svgCount += 2;
  }
}

/* ---------- README 片段 ---------- */
const promoText = (a) => (a.promoCode ? `优惠码 \`${a.promoCode}\`${a.promoName ? `(${a.promoName})` : ''}` : '暂无公开优惠码');
const promoCell = (a) => (a.promoCode ? `\`${a.promoCode}\`` : '—');
const catNames = (a) => a.categories.map((c) => categoryLabel[c]).join(' / ');

const main = byRank.find((a) => a.tier === 'main');
const seconds = byRank.filter((a) => a.tier === 'second');
const top = byRank.slice(0, 3);

/* 快速选择指南:按需求 → 品牌(slug 不存在时自动跳过) */
const guide = [
  ['第一次买 / 预算敏感', ['feimao', 'worryfree', 'civet'], '7 元/月起的年付小包,先用月付验证'],
  ['求稳、打算长期用', ['xingdaomeng', 'feimao'], '有多年运营记录且有站长实测'],
  ['主用香港节点 / 看流媒体', ['breezenet', 'xingdaomeng'], '实测香港速度与流媒体解锁最好'],
  ['ChatGPT 等 AI 工具为主', ['lingdong', 'feimao', 'xingdaomeng'], '实测 OpenAI 解锁覆盖广'],
  ['大流量 / 重度下载', ['kuajie', 'yifan', 'twilight'], '大流量档单价低'],
  ['高端专线、套餐层级完整', ['twilight', 'flyv', 'laddercloud'], 'IEPL 专线定位,先月付验证'],
  ['想要不限时流量', ['xingdaomeng', 'worryfree', 'breezenet'], '有永久不限时或买断档'],
]
  .map(([need, slugs, why]) => {
    const list = slugs.filter((s) => bySlug[s]).map((s) => `[${bySlug[s].name}](#${s})`);
    return list.length ? `| ${need} | ${list.join('、')} | ${why} |` : null;
  })
  .filter(Boolean)
  .join('\n');

const overview = byRank
  .map((a) => `| ${medal(a.rank)} | [${a.name}](#${a.slug}) | ${catNames(a)} | ${a.priceText} | ${promoCell(a)} | ${basisTag(a)} | [官网](${a.go}) · [测评](${a.review}) |`)
  .join('\n');

const printed = new Set();
function fullBlock(a) {
  const imgs =
    a.speed && a.unlock
      ? `
![${a.name}测速示意图(模拟示例)](images/${a.slug}-speed.svg)

![${a.name}流媒体与 AI 解锁示意图(模拟示例)](images/${a.slug}-unlock.svg)
`
      : '';
  return `<a name="${a.slug}"></a>
### ${medal(a.rank)} ${a.name} —— ${a.oneLiner}

**${a.priceText} 起**${a.openYear ? ` · 开业 ${a.openYear}` : ''} · ${a.tierLabel}位 · ${catNames(a)} · ${promoText(a)}

> ${a.verdict}

${a.sellingPoints.map((p) => `- ${p}`).join('\n')}

📌 **资料口径:**${a.dataBasis}
${imgs}
👉 **[前往 ${a.name} 官网](${a.go})** · [查看完整资料页与替代选择](${a.review})

---
`;
}
function briefRow(a) {
  return `- ${medal(a.rank)} **[${a.name}](#${a.slug})** —— ${a.oneLiner}(${a.priceText} 起 · ${basisTag(a)})`;
}
const catSections = categoryOrder
  .map((c) => {
    const list = byRank.filter((a) => a.categories.includes(c));
    if (!list.length) return '';
    const full = [];
    const brief = [];
    for (const a of list) {
      if (printed.has(a.slug)) brief.push(briefRow(a));
      else {
        printed.add(a.slug);
        full.push(fullBlock(a));
      }
    }
    return `<a name="cat-${c}"></a>
## ${catEmoji[c]} ${categoryLabel[c]}(${list.length} 家)

${catIntro[c]}

${full.join('\n')}${brief.length ? `\n**同时属于本类、已在上文展开的品牌:**\n\n${brief.join('\n')}\n` : ''}`;
  })
  .join('\n');

const readme = `# 2026 机场推荐清单｜老牌 / 性价比 / 稳定 / 高端(${count} 家,每日自动同步)

![更新日期](https://img.shields.io/badge/更新-${today.replace(/-/g, '--')}-00e676) ![收录](https://img.shields.io/badge/收录机场-${count}%20家-00b0ff) ![站长实测](https://img.shields.io/badge/站长实测-${tested.length}%20家-fbbf24) [![主站](https://img.shields.io/badge/主站-jichangcha.com-00e676)](${links.home}) [![Telegram](https://img.shields.io/badge/Telegram-%40jichangcha-26A5E4?logo=telegram&logoColor=white)](${links.telegram})

![2026 机场推荐清单](images/banner.svg)

这是 [机场查 jichangcha.com](${links.home}) 品牌库的 GitHub 镜像:**${count} 家机场按老牌 / 性价比 / 稳定 / 高端四类整理**,每家给出套餐价格、优惠码、线路口径和资料来源;有站长实测记录的品牌注明测试日期与环境,没有实测的只列已核验的套餐,不给速度结论。数据每天从主站自动同步,更新时间见顶部徽章。

> 🏠 横向对比表、每家机场的完整资料页、189 题长尾问题库在主站:**[jichangcha.com](${links.home})** · [对比总表](${links.compare}) · [品牌库](${links.brands})
> 📣 每日免费节点 / 共享 Apple ID / 跑路预警,TG 频道自动推送:**[@jichangcha](${links.telegram})**,新手求助进 [互助群](${links.telegramChat})
> ⚠️ 订阅链接等同账号密码,切记不要泄露;任何机场第一个月都建议月付试水
> 🗂️ 四站精品聚合(机场推荐 / 免费节点 / 共享 Apple ID / 跑路预警 / 客户端教程 / 翻墙科普):**[github.com/jichangx](https://github.com/jichangx)**

<a name="toc"></a>
## 📋 目录导航

- [📢 本期更新](#update) · [🏆 本期主推](#top) · [⚡ 快速选择指南](#guide) · [📊 全部机场速览](#all)
- [🏛️ 老牌机场](#cat-classic) · [💸 性价比机场](#cat-value) · [🛡️ 稳定机场](#cat-stable) · [👑 高端机场](#cat-premium)
- [📱 客户端与教程](#tools) · [❓ 快速问答](#faq) · [📌 更新与声明](#notes)

<a name="update"></a>
## 📢 本期更新(${today})

- 收录 **${count} 家**机场;主推 **${main ? `[${main.name}](#${main.slug})` : '—'}**,次推 ${seconds.map((a) => `[${a.name}](#${a.slug})`).join('、')}
- 有站长实测记录的品牌(${tested.length} 家):${tested.map((a) => `[${a.name}](#${a.slug})`).join('、')}
- 价格与优惠码以主站品牌资料为准,官网调整后会在下一次同步更新;发现失效请到 [Issues](../../issues) 反馈

<a name="top"></a>
## 🏆 本期主推

| 位置 | 机场 | 最低套餐 | 优惠码 | 一句话 | 资料口径 | 入口 |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- |
${top.map((a) => `| ${medal(a.rank)} ${a.tierLabel} | [${a.name}](#${a.slug}) | ${a.priceText} | ${promoCell(a)} | ${a.oneLiner} | ${basisTag(a)} | [官网](${a.go}) · [测评](${a.review}) |`).join('\n')}

<a name="guide"></a>
## ⚡ 快速选择指南

| 你的需求 | 先看这几家 | 为什么 |
| ---- | ---- | ---- |
${guide}

> 💡 选购纪律:第一个月**月付试水**,体验完整晚高峰周期再考虑季付 / 年付吃优惠码折扣;**一定要有备用机场**,避免完全失联。

<a name="all"></a>
## 📊 全部机场速览(${count} 家,按榜单排序)

| 排名 | 机场 | 分类 | 最低套餐 | 优惠码 | 资料口径 | 入口 |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- |
${overview}

资料口径说明:✅ 站长实测 = 有测试日期与环境的实测记录;📋 套餐已核验 = 套餐名称、流量与价格按截图核验,速度与解锁未实测;📝 资料整理 = 来自站长品牌清单。

${catSections}
<a name="tools"></a>
## 📱 客户端与教程(免费开源)

- Windows / macOS:[Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev/releases) · [v2rayN](https://github.com/2dust/v2rayN/releases)
- 安卓:[Clash Meta for Android](https://github.com/MetaCubeX/ClashMetaForAndroid/releases) · [v2rayNG](https://github.com/2dust/v2rayNG/releases)
- iOS:Shadowrocket / Stash(需外区 Apple ID,[共享 Apple ID 每日更新](${links.shareId}))
- 配置教程:[Clash](${links.tutorials.clash}) · [小火箭](${links.tutorials.shadowrocket}) · [v2rayN](${links.tutorials.v2rayn}) · [专线科普](${links.tutorials.zhuanxian}) · [ChatGPT 机场怎么选](${links.tutorials.chatgpt}) · [优惠码汇总](${links.tutorials.youhuima})
- 同系仓库:[每日免费节点](https://github.com/jichangx/free-nodes) · [共享 Apple ID](https://github.com/jichangx/share-apple-id) · [机场跑路预警](https://github.com/jichangx/airport-status)

<a name="faq"></a>
## ❓ 快速问答

**机场和 VPN 有什么区别?** VPN 一键连接但单线路、高峰限速;机场提供几十个节点 + 规则分流,国内直连国外代理互不干扰,速度与灵活性都更好。[更多概念解释](${links.faq})

**怎么判断机场会不会跑路?** 高危信号:突然推终身 / 五年套餐、节点质量断崖下滑、公告长期不更新。纪律:新机场只月付,仅对运营 2 年以上的老牌年付。[跑路预警名单](${links.airportStatus})

**晚高峰卡怎么办?** 换冷门节点临时缓解;根治靠 IEPL / IPLC 专线,专线不经公网,晚高峰几乎不掉速。[专线科普](${links.tutorials.zhuanxian})

**ChatGPT 用不了?** 香港节点对 AI 常常无效,换标注 AI 解锁的新加坡 / 日本 / 美国原生 IP 节点。[AI 工具选购指南](${links.tutorials.chatgpt})

<a name="notes"></a>
## 📌 更新与声明

- 本清单由 GitHub Actions 每日从主站公开数据端点自动同步生成,不手工维护;主站资料变更后次日生效
- 「站长实测」条目注明日期、线路与节点数,只代表当时环境;「模拟示例」图表为统一口径的示意图,不是实测承诺;未实测品牌只列已核验套餐
- 本仓库链接经主站中转页跳转,部分为推广链接,可能为我们带来收益,不影响排序;内容仅供学习交流,请遵守当地法律法规
- 反馈与纠错:[Issues](../../issues) · Telegram [@jichangcha_chat](${links.telegramChat}) · 主站 [jichangcha.com](${links.home})

⭐ 觉得有用请点个 Star,清单每天更新,你会在动态里看到变化。
`;

writeFileSync(`${ROOT}/README.md`, readme);
console.log(`完成:README(${count} 家,实测 ${tested.length} 家)+ ${svgCount} 张 SVG → ${ROOT}`);
