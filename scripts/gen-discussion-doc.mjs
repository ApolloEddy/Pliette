/**
 * 生成《实时生成动作的技术路线研究》讨论稿 docx。
 * 运行：node scripts/gen-discussion-doc.mjs
 * 输出：docs/实时生成动作技术路线-讨论稿.docx
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, AlignmentType, HeadingLevel, WidthType,
  BorderStyle, ShadingType, TableOfContents, TableLayoutType, PageBreak,
} from "docx";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(here, "../docs/实时生成动作技术路线-讨论稿.docx");

// ---------- 调色板（CM-2 Blue Orange，白皮书风格） ----------
const P = {
  bg: "FEFEFE", primary: "1284BA", accent: "FF862F",
  cover: { titleColor: "1284BA", subtitleColor: "606060", metaColor: "707070", footerColor: "A0A0A0" },
  table: { headerBg: "1284BA", headerText: "FFFFFF", accentLine: "1284BA", innerLine: "D8E4EC", surface: "EDF4F9" },
};
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

// ---------- 标题排版助手（来自 design-system） ----------
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const lines = [];
  let rest = title;
  while (rest.length > charsPerLine) {
    lines.push(rest.slice(0, charsPerLine));
    rest = rest.slice(charsPerLine);
  }
  if (rest.length) lines.push(rest);
  return lines;
}
function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / (pt * 20));
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) {
    lines = splitTitleLines(title, charsPerLine(minPt));
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}

// ---------- 封面（R2 双横线白皮书式） ----------
function buildCoverR2(config) {
  const padL = 1400, padR = 1400;
  const { titlePt, titleLines } = calcTitleLayout(config.title, 11906 - padL - padR, 40, 24);
  const titleSize = titlePt * 2;
  const thickBorder = { style: BorderStyle.SINGLE, size: 18, color: P.accent, space: 20 };
  const children = [];
  children.push(new Paragraph({
    indent: { left: padL - 400, right: padR - 400 }, spacing: { before: 1200, after: 200 },
    border: { top: thickBorder }, children: [],
  }));
  children.push(new Paragraph({ spacing: { before: 1800 } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 500 },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, color: P.accent, font: { ascii: "Calibri" } })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: i < titleLines.length - 1 ? 80 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, color: P.cover.titleColor, font: { eastAsia: "SimHei", ascii: "Arial" } })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 400 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: P.cover.subtitleColor, font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: 1200 } }));
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100, line: Math.ceil(18 * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: line, size: 36, color: P.cover.metaColor, font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: 2000 } }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    indent: { left: padL - 400, right: padR - 400 }, spacing: { before: 200 },
    border: { bottom: thickBorder },
    children: [new TextRun({ text: config.footerRight || "", size: 18, color: P.cover.footerColor, font: { ascii: "Arial" } })],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({ shading: { type: ShadingType.CLEAR, fill: P.bg }, borders: noBorders, children })],
    })],
  })];
}

// ---------- 正文构件助手 ----------
const F = { eastAsia: "Microsoft YaHei", ascii: "Calibri" };

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 160, line: 312 },
    children: [new TextRun({ text, bold: true, size: 32, color: "1A1E28", font: F })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120, line: 312 },
    children: [new TextRun({ text, bold: true, size: 26, color: "1A1E28", font: F })],
  });
}
function p(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED, spacing: { after: 100, line: 312 },
    indent: { firstLine: 420 },
    children: [new TextRun({ text, size: 21, color: "1A1E28", font: F, bold: !!opts.bold })],
  });
}
function pRuns(runs) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED, spacing: { after: 100, line: 312 },
    indent: { firstLine: 420 },
    children: runs.map((r) => new TextRun({ size: 21, color: "1A1E28", font: F, ...r })),
  });
}
function bullet(text, bold = false) {
  return new Paragraph({
    spacing: { after: 80, line: 312 }, indent: { left: 420 },
    children: [
      new TextRun({ text: "\u2022  ", size: 21, color: P.primary, font: F, bold: true }),
      new TextRun({ text, size: 21, color: "1A1E28", font: F, bold }),
    ],
  });
}
function tableTitle(text) {
  return new Paragraph({
    keepNext: true, spacing: { before: 160, after: 80, line: 312 },
    children: [new TextRun({ text, bold: true, size: 21, color: "1A1E28", font: F })],
  });
}
function mkTable(headers, rows, widths) {
  const mkCell = (text, i, isHeader) => new TableCell({
    children: [new Paragraph({ spacing: { line: 288 }, children: [new TextRun({ text, size: isHeader ? 21 : 20, bold: isHeader, color: isHeader ? P.table.headerText : "1A1E28", font: F })] })],
    shading: { type: ShadingType.CLEAR, fill: isHeader ? P.table.headerBg : "FFFFFF" },
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    width: { size: widths[i], type: WidthType.PERCENTAGE },
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: P.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: P.table.accentLine },
      left: NB, right: NB,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: P.table.innerLine },
      insideVertical: NB,
    },
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((t, i) => mkCell(t, i, true)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => mkCell(t, i, false)) })),
    ],
  });
}

// ---------- 正文内容 ----------
const body = [];

body.push(new Paragraph({
  spacing: { after: 200, line: 312 },
  children: [new TextRun({ text: "摘要：本文记录一个桌面 AI 伴侣项目（Pliette）在\u201c实时生成动作\u201d问题上的完整实验过程与结论。我们用两轮被否决的实验证明：以 LLM/Agent 生成稀疏关键帧的方式做实时动作生成，在 Q 版 2D 骨骼角色上不可行；随后用\u201c原动画切片 + 通道叠加\u201d的替代方案以零迭代达到了验收质量。本文给出问题的精确定义、实验数据、六条经验总结，以及五条候选技术路线的对比分析，供进一步讨论。", size: 21, color: "3A3F4A", font: F, italics: true })],
}));

// 1 问题定义
body.push(h1("1  问题定义"));
body.push(h2("1.1  产品背景"));
body.push(p("Pliette（纸栖）是一个桌面 AI 伴侣项目：用户喜欢的角色（首个角色为游戏 IP 的 Q 版立绘角色\u201c拉菲\u201d，Spine 2D 骨骼动画格式）住在桌面上的一个有空间感的 3D 房间场景里，能看见用户、听用户说话，根据对话情境自然地说话和做动作；动作可以中途打断和切换。技术栈为 TypeScript + Three.js + 官方 Spine WebGL 运行时。"));
body.push(p("与其他虚拟助手/桌宠类产品的核心差异在于\u201c根据情境自然地动作\u201d：不是循环播放几段固定待机动画，而是希望角色的肢体表达能跟随对话内容即兴变化——这正是\u201c实时生成动作\u201d诉求的来源。"));
body.push(h2("1.2  技术问题的精确定义"));
body.push(p("给定：一个已绑定的 2D 骨骼角色（79 根骨骼、42 个 Slot、20 段官方美术制作的动画、仅正面视图），以及一个运行时的行为目标（如\u201c用户夸了她，表现出开心并挥手\u201d），在 50 毫秒级决策延迟、60 FPS 渲染帧率的约束下，产出一段\u201c可接受\u201d的角色动作。"));
body.push(p("其中\u201c可接受\u201d由用户目视验收定义，包含四个维度：多部位协调（不允许只有施动部位在动而身体其余部分僵直）、节奏与重量感（缓动性格、幅度可读、无滑步漂移）、轮廓可读性（意图一眼可辨）、与角色既有风格一致。这四个维度的具体含义由失败样本反向定义——我们最初的生成样本正是在这四点上全部失败。"));
body.push(h2("1.3  关键约束"));
body.push(bullet("资产形态：Spine 3.6 二维纸片角色，只有正面视图；贴图图集仅 1024\u00d7256；无独立嘴部骨骼（不宣称口型同步）"));
body.push(bullet("数据规模：只有 1 个角色的 20 段官方动画（合计约 80 秒），无任何同风格的大规模动作数据集；3D 人体动捕数据集（HumanML3D、CMU 等）因骨架拓扑完全不同而不可迁移"));
body.push(bullet("实时性：目标 60 FPS；决策到可见响应 p95 \u2264 50ms；本机实测渲染管线的整帧动画成本约 0.5ms，实时性瓶颈不在渲染"));
body.push(bullet("工程边界：使用官方 Spine 运行时（不重写蒙皮/约束/绘制顺序）；禁止执行 LLM 输出的代码；LLM 密钥不入前端"));

// 2 研究背景
body.push(h1("2  研究背景与行业现状"));
body.push(h2("2.1  游戏工业的成熟答案：片段组合与过渡"));
body.push(p("3D 游戏工业对\u201c实时产生自然动作\u201d的主流答案是运动匹配（Motion Matching）与动作图（Motion Graphs）：把大量专业动捕数据切分成片段，按姿态相似度建立转移网络，运行时根据角色状态在网络上遍历，转移处做姿态混合。代表作包括《For Honor》的运动匹配、《漫威蜘蛛侠》的动作系统，学术源头是 Kovar 等 2002 年 SIGGRAPH 的 Motion Graphs 论文。它们的共同点：动作数据全部来自专业动捕，系统做的是检索、过渡与组合——从不\u201c发明\u201d新的肢体轨迹。"));
body.push(h2("2.2  数据驱动生成：依赖大规模同质数据"));
body.push(p("学术界的动作生成（Motion Diffusion Models、MotionGPT、T2M 系列等）在 3D 人体骨架上进展显著，但依赖大规模、同拓扑、同比例的训练数据（如 HumanML3D 的数万段人体动捕）。2D 骨骼动画（Spine/Live2D）领域不存在这样的公开数据集：骨架拓扑因角色而异、绘制依赖逐角色图集与层级，3D 路线的模型与数据无法直接迁移。Live2D 生态的\u201c动态\u201d基本依赖手工参数曲线；Spine 游戏的动作也是手工制作加有限的程序混合。换言之，\u201cQ 版 2D 骨骼角色的学习式动作生成\u201d目前是空白，且数据门槛在可见的未来难以跨越。"));
body.push(h2("2.3  LLM 参与动作生成的现状"));
body.push(p("LLM 在动作领域的有效应用集中在语义层：文本理解、动作序列检索与编排（Text-to-Motion 检索增强）、参数化动画函数的调用。社区有少量把 LLM 接到 Spine/参数化动画上的尝试（如 spine-animation-ai 类项目），但公开信息中未见\u201cLLM 直接输出骨骼关键帧并达到商业美术质量\u201d的可验证案例。这与我们的独立实验结论一致（见第 3、4 节）。"));

// 3 实验环境
body.push(h1("3  实验环境与方法"));
body.push(h2("3.1  系统管线"));
body.push(p("我们搭建了完整的实验管线：官方 Spine 3.6 WebGL 运行时渲染角色到透明画布，再作为纹理贴到 Three.js 场景中的双面纸片平面上；其上实现了资产检查器（自动产出骨骼/槽位/动画/约束报告）、语义绑定层（RigProfile：语义部位到真实骨骼的映射）、动作编译器（把 JSON 动作草稿编译为版本匹配的官方 Timeline 对象）、调度器（通道占用、幂等提交、冲突与取消）与实验室界面（参数编辑、逐帧检查、探针、录像）。"));
body.push(h2("3.2  评测方法"));
body.push(p("动作质量的评测采用用户目视验收（0-5 分四维：部位协调、节奏重量、轮廓可读、风格一致；并设硬失败清单：缺部件、明显穿模、弹回参考姿态、错误朝向等）。所有候选保留原始输出与修订历史，禁止人工改动后冒充一次生成。另以官方运行时的数值采样做客观校验（如 0\u00b0\u2192-72\u00b0\u21920\u00b0 线性示例在关键帧时刻的真实局部旋转断言）。"));

// 4 实验一
body.push(h1("4  实验一：LLM 生成稀疏关键帧（被否决）"));
body.push(h2("4.1  实验设计"));
body.push(p("选取六项低风险动作：轻微待机、点头、单手小幅挥手、指向、倾身倾听、害羞收缩。两种生成模式：Tune（固定参数化动作函数，LLM 只输出幅度/节奏/次数等有界数值）与 Author（LLM 直接输出语义部位 + 关键帧曲线的 JSON 草稿，编译器转换为官方 Timeline）。每个候选保留首次输出，经确定性截图逐帧目视评审，最多三轮修订。"));
body.push(h2("4.2  结果"));
body.push(tableTitle("表 1  生成实验结果汇总"));
body.push(mkTable(
  ["项目", "数据"],
  [
    ["首输出生成", "6/6 产出合法 JSON，全部通过 Schema 与编译"],
    ["目视质量", "两轮用户验收均否决：\u201c单部位僵直、根本不达标、其他部位不动\u201d"],
    ["修订成本", "每轮修订需重新编译、逐帧截图、视频合成与人工评审"],
    ["典型失败", "呼吸幅度 0.008H（约 0.8% 身高）不可读；挥手只有手臂两根骨骼在动；节奏呈机械线性"],
    ["对照", "官方动画切片叠加方案：零迭代直接达到可接受质量"],
  ],
  [30, 70]
));
body.push(h2("4.3  失败模式分析"));
body.push(bullet("协调性缺失：生成器按\u201c施动部位\u201d思考，而自然动作是全身性的——挥手需要头部偏向、躯干反倾、重心起伏的配合。我们补写协调通道后仅部分改善，且每加一个部位都是人工编排"));
body.push(bullet("幅度语义缺失：\u201c轻微待机\u201d的呼吸该是多大？参数域给了 0~2，正确答案 0.022H 只能靠目视试出来。这个先验在动画师的肌肉记忆里，不在任何 prompt 可传递的文本里"));
body.push(bullet("缓动性格缺失：线性关键帧组成了\u201c机械感\u201d的主体；好的缓动是逐段设计的性格，无法由通用插值替代"));
body.push(bullet("开环生成：LLM 看不到渲染结果，只能靠外部反馈循环收敛——而每轮反馈的人工/管线成本使得实时化完全不可行"));

// 5 实验二
body.push(h1("5  实验二：原动画切片叠加（成功）"));
body.push(h2("5.1  方法"));
body.push(p("转向不从零生成：把角色自带 20 段官方美术动画当作素材库。先用世界坐标勘探器（手部世界高度高于头顶 = 举手；注意局部旋转角会误导——一段局部旋转 90\u00b0 的动画实际是弯腰做事而非挥手）扫描全部动画，标注出举手、低头、伸臂等语义片段；再按身体通道（头/眼/左臂/右臂/躯干）过滤出片段的 timeline 子集，用运行时的动画时间窗 + 轨道叠加机制，把切片叠合到正在播放的基础动画上，窗口结束自动混合交还。"));
body.push(h2("5.2  结果"));
body.push(tableTitle("表 2  切片叠加组合（全部零迭代达标）"));
body.push(mkTable(
  ["组合", "观感"],
  [
    ["待机 + touch 头部切片", "被摸头时眯眼微笑（美术附件）"],
    ["待机 + yun 头部切片", "螺旋晕眼 + 身体摇晃"],
    ["行走 + stand 右臂切片[4.9-7.3]", "边走边举起可乐（专业挥手/举臂）"],
    ["行走 + normal 头部切片", "行走中的自然头部细节"],
    ["sit 坐姿 + 指向切片", "低头害羞 / 右臂前伸指向"],
  ],
  [45, 55]
));
body.push(p("关键机制实测：官方运行时中高层轨道在满权重时对该属性为\u201c绝对接管\u201d（基础层 10\u00b0 + 叠加层 40\u00b0 \u2192 结果 40\u00b0 而非 50\u00b0），混合期平滑过渡、混出后交还基础层——即标准的\u201c手势接管\u201d语义，可叠加性与可取消性同时成立。"));
body.push(h2("5.3  顺带发现：局部角不等于世界姿态"));
body.push(p("勘探初期我们把\u201c局部旋转 \u2265 90\u00b0\u201d误判为举手，渲染后手臂下垂——实际是弯腰动作（局部角的方向取决于整条父链）。正确判定必须用世界坐标（手的世界高度对比头顶）。这个教训推广开：任何涉及姿态与方向的自动判断，都必须在世界坐标或渲染结果上验证。"));

// 6 实验三
body.push(h1("6  实验三：接触交互与误差测量（机制验证）"));
body.push(p("为验证\u201c接触逻辑\u201d的工程可行性，实现了\u201c走向矮桌并触碰桌沿\u201d场景：勘探发现一段右手世界坐标波动为 0 的稳定窗口（0.5 秒内高度偏差 0，高度 0.27H）；角色按\u201c手部局部偏移解算\u201d自动站位，播放切片后于稳定段采样手的世界坐标与接触锚点的偏差。实测 4 次采样最大误差 0.0027H（验收门槛 0.02H，8 倍余量）。同时标定了行走速度（实测步幅 44.9 骨骼单位/1.17 秒周期 \u2248 0.115H/s，此前凭直觉给的 0.567 快了 5 倍，正是脚滑的根因）。"));

// 7 性能
body.push(h1("7  性能数据"));
body.push(tableTitle("表 3  实时性能实测（headless 软件渲染，为真机 GPU 的下界）"));
body.push(mkTable(
  ["指标", "数值", "备注"],
  [
    ["完整渲染路径平均帧率", "168 FPS", "Spine 求解 + 纹理上传 + 3D 场景渲染"],
    ["帧间隔 p95", "4.3 ms", "验收门槛 20 ms"],
    ["整帧动画成本", "0.478 ms", "不含决策层"],
    ["30 分钟浸泡", "堆内存 26.2MB 恒定，零增长", "自动行为+眨眼持续运行"],
    ["超分 3x 贴图", "性能零损失", "清晰度显著提升"],
  ],
  [40, 25, 35]
));
body.push(p("结论：实时性的瓶颈不在渲染与动画解算（软件渲染下都有 2.5 倍以上余量），而 entirely 在动作内容的生产方式上——这进一步把讨论聚焦到本文主题。"));

// 8 经验总结
body.push(h1("8  经验总结"));
body.push(bullet("洞察一：动作质量存在于专业数据中，不存在于参数里。生成实验的每次失败都不是\u201c参数没调对\u201d，而是\u201c好的参数组合空间无法从文本先验中推出\u201d。", true));
body.push(bullet("洞察二：\u201c实时生成\u201d的行业成熟形态是检索与组合（专业片段 + 图遍历 + 混合），不是从零合成。把问题从\u201c生成轨迹\u201d改写成\u201c检索并编排轨迹\u201d，可行性发生质变。"));
body.push(bullet("洞察三：局部坐标会撒谎。姿态、朝向、接触的一切自动判定必须在世界坐标或渲染像素上做。"));
body.push(bullet("洞察四：评测是最大的隐性成本。动作好坏只能目视验收，任何路线都必须先做最小可视样本再投入——我们的生成路线在第一轮小样时就有明确信号，但多轮迭代的沉没成本仍然过高。"));
body.push(bullet("洞察五：叠加与取消的运行时语义（轨道接管、混合交还）是组合式动作的地基，值得最先夯实。"));
body.push(bullet("洞察六：否定性结论是有效交付。生成路线的两轮失败有完整的数据、影像与机制分析，直接换来了资源向正确方向的重新配置。"));

// 9 候选路线
body.push(h1("9  候选技术路线对比"));
body.push(tableTitle("表 4  五条候选路线"));
body.push(mkTable(
  ["路线", "核心思想", "质量", "实时", "成本", "风险"],
  [
    ["动作图", "自动切分专业动画为片段图，按姿态相似度连边，运行时图遍历+混合", "专业（片段来自美术）", "优", "中（切分与转移点需目视打磨）", "库里没有的动作类型造不出"],
    ["程序化生命层", "呼吸/重心/发裙摆的弹簧物理叠加", "增益性质", "优", "小", "与烤入动画的摆动冲突需逐一测量"],
    ["LLM 编舞", "LLM 输出节拍化演出脚本（选片段+定时机+定表情），运行时组合执行", "专业（解耦）", "良", "已半建成", "受限于库覆盖"],
    ["离线人机共创", "LLM 起草新动作，人工在编辑器制作/修订后入库", "人工把关", "不适用（离线）", "中", "库增长速度受人力限制"],
    ["学习式生成", "在 Q 版 2D 骨架数据上训练 in-betweening/扩散模型", "未知", "未知", "高（数据不存在）", "数据门槛不可见地高，明确搁置"],
  ],
  [14, 30, 14, 10, 16, 16]
));
body.push(p("推荐组合：以动作图为核心（提供无限不重复的专业动作流），程序化生命层小步叠加，LLM 作为编舞与行为选择层（已半建成），离线人机共创作为库的长期增长机制，学习式生成挂起并明确触发条件（同管线角色资产积累到足够数量时重评）。"));

// 10 待讨论问题
body.push(h1("10  希望与各位讨论的问题"));
body.push(bullet("动作图路线在 2D 骨骼动画（Spine/Live2D）领域有无已知先例或踩坑记录？2D 纸片角色的姿态相似度度量（骨骼世界坐标距离 vs 屏幕轮廓 vs 学习特征）哪种更可靠？"));
body.push(bullet("单角色 20 段动画（80 秒）的规模，能否支撑某种轻量的风格学习或自动 in-betweening？数据增广（时间伸缩、幅度缩放、镜像）在其中是否被验证有效？"));
body.push(bullet("LLM 编舞的输出粒度如何取舍：逐句对话触发的离散事件，还是带节拍时序的连续演出脚本？各自与调度器/动画状态的对接经验？"));
body.push(bullet("程序化叠加层与烤入动画的\u201c双重摆动\u201d冲突，业界有无系统性的检测或规避方法？"));
body.push(bullet("是否存在我们遗漏的第四类范式——既不需要大数据训练、又能超出\u201c片段重组\u201d表达边界的实时动作技术？"));
body.push(bullet("商业侧：有无 Q 版 2D 桌宠/虚拟形象产品做过真正的实时动作变化？其动作管线形态可否参考？"));

// 11 附录
body.push(h1("11  附录：资产与系统事实"));
body.push(tableTitle("表 5  角色资产与系统关键事实"));
body.push(mkTable(
  ["项", "事实"],
  [
    ["角色", "游戏 IP Q 版立绘角色（拉菲），Spine 3.6.52 导出，仅正面视图"],
    ["骨架", "79 骨骼 / 42 Slot / 67 附件（含 8-9 个眼部表情变体）/ 双腿 IK / 无嘴部骨骼"],
    ["动画", "20 段官方美术动画：stand 待机 20.33s（含丰富表情与小动作）、walk/move、sit、sleep、dance、attack 等"],
    ["运行时", "官方 spine-ts 3.6.53（vendor 锁定哈希），Three.js r178 场景，60 FPS 目标实测余量 2.5\u00d7"],
    ["工程", "TypeScript + Vite；测试 55 项全绿；Electron 宿主骨架（安全基线）"],
    ["评测", "用户目视验收 + 官方运行时数值采样 + 世界坐标勘探器 + 确定性逐帧出证管线"],
  ],
  [22, 78]
));
body.push(p("本文所有实验均有可复现的工程产物：勘探与标定脚本、确定性逐帧出证管线（每帧冷启动渲染，保证可对照）、12 段带标注的验收视频，以及完整保留的生成候选与评审记录。", {}));

// ---------- 组装文档 ----------
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: F, size: 21, color: "1A1E28" } },
    },
  },
  features: { updateFields: true },
  sections: [
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR2({
        englishLabel: "REALTIME MOTION GENERATION - RESEARCH BRIEF",
        title: "实时生成动作的技术路线研究",
        subtitle: "Pliette 桌面角色项目的实验、教训与候选路线（讨论稿）",
        metaLines: ["Pliette（纸栖）项目组", "2026 年 9 月", "内部讨论稿 · 仅供交流"],
        footerRight: "PLIETTE PROJECT",
      }),
    },
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1417, bottom: 1417, left: 1701, right: 1417 } } },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "D0D0D0" } },
            children: [new TextRun({ text: "实时生成动作的技术路线研究 · 讨论稿", size: 16, color: "8A93A6", font: F })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "8A93A6", font: F })],
          })],
        }),
      },
      children: [
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "目录", bold: true, size: 28, color: "1A1E28", font: F })] }),
        new TableOfContents("目录", { hyperlink: true, headingStyleRange: "1-2" }),
        new Paragraph({ children: [new PageBreak()] }),
        ...body,
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, buffer);
console.log("生成完成:", outPath, `(${(buffer.length / 1024).toFixed(0)} KB)`);
