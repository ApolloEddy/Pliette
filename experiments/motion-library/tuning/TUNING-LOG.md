# MotionLibrary 动作族精调台账（2026-09-14/15 夜间批次）

方法：每个动作族经 Lab 确定性渲染（`?overlay=源:通道:t0:t1:mixIn:mixOut&phases=...`），
逐相位截图评估自然度与字段语义，不满意即调参重渲染；定稿后经 3D 纸片视图
（默认机位 + OrbitControls 拖拽斜视角）复核。证据 PNG 即本目录各子文件夹（本地保留，不入库）。

状态标记：✅ 验收通过（窗口/混合定稿并回写 manifest）· 🔶 迭代中 · ⛔ 缺口（不可制作）

## 种子迁移批次（9/9 完成）

| # | 逻辑键 | 定稿窗口 | 混入/混出 | 相位证据 | 结论 |
|---|---|---|---|---|---|
| 1 | gesture.wave / small.screen_right | stand[5850,6900] | 150/200ms | wave_v3/（10 相位 + 3D×2） | ✅ 原窗口 4.9–7.3 有 1s 死准备段且尾部撞基础层弯倾；收紧后入场平滑、双摆动、无跳变 |
| 2 | gesture.raise_hand / screen_left | stand[12900,14500] | 150/200ms | raise_hand_v2/（9 相位 + 3D×1） | ✅ 原窗口 13.0–13.9 截断落下段；现含完整抬-保持-落弧线 |
| 3 | reaction.dizzy / small | yun[400,1750] | 120/200ms | dizzy_v5/（9 相位） | ✅ 原 2.0 尾点头部歪斜未回正；1.55 头近中位时混出回神；螺旋眼全弧线保留 |
| 4 | reaction.happy / small | touch[0,670] | 120/150ms | happy_v1/（8 相位） | ✅ 眯眼+眉毛+头轻顶，混出后表情归位（附件恢复修复验证用例） |
| 5 | reaction.shy / small | sit[0,1330] | 150/200ms | shy_v2/（8 相位） | ✅ 眼睑下垂+腮红+头微低；站姿基础合成已验证（坐姿复验列入制作计划） |
| 6 | gesture.pump / screen_right | victory[3000,4400] | 150/200ms | pump_v2/（8 相位） | ✅ 原 3.3 起点缺抬拳段；现含抬拳-挥击-收落完整弧线 |
| 7 | life.idle_fidget / default | normal[500,2500] | 150/200ms | idle_fidget_scan/（9 相位） | ✅ 头部轻微摇摆，原窗口即合理 |
| 8 | gesture.point / screen_right | attack[100,800] | 120/150ms | point_scan/（8 相位） | ✅ 原 0.15–0.7 缺抬臂起点；现含抬臂-前伸-收回 |
| 9 | contact.touch_table / screen_right | victory[700,1200] | 150/250ms | touch_table_scan/（7 相位） | ✅ 窗口即已标定稳定接触段（0.27H），混合参数与已验收触碰场景保持一致，不破坏接触误差标定 |

## 播放层缺陷修复（调参过程中发现并修复）

**附件混出残留**：Spine 3.6 `attachmentThreshold=0` 导致附件时间线在混合期被整体跳过——
dizzy 的螺旋眼、happy 的眯眼等 overlay 附件在混出后永久残留（基础层无更晚的键时永不恢复）。
修复：`overlay.ts#withAttachmentRestore` 在混出起点前一个帧间隔（1/60s，最后一个满权重帧）
追加 setup 附件恢复键，并丢弃恢复点之后的原始键。经 dizzy_v5/happy_v1 视觉复验归位。

## 过程记录

### 1. gesture.wave / small.screen_right
- v1 [4900,7300]：0–1.0s 手臂完全静止（死准备段）；且发现 stand 本体 6.8s 后进入弯倾段落——窗口必须避开。
- 扫描 6.9–9.6：7.6s 起基础层身体大幅弯倾（伸展/揉眼段），挥手必须在此之前结束。
- v2 [5850,7300]：尾端 7.3s 实为"前伸递可乐"起点，非自然收回点。
- **v3 [5850,6900] 定稿**：0.05 臂在体侧（混入无跳变）→ 0.35 举臂头旁 → 0.35–0.85 双摆动 → 0.85–1.05 混出与自然落下重叠 → 1.25 完全回基础层直立。3D 默认机位 + 斜视角均自然。
- 附注：手持可乐为角色常驻附件（hand_R2 setup 附件，stand 无该槽位附件时间线），挥手带可乐是官方资产语义，非缺陷。

### 3. reaction.dizzy / small（附件残留缺陷的发现与修复用例）
- 扫描 0–2.6：螺旋眼全程存在，头部左右摇摆；2.0 尾点头部歪斜未回正；1.7 附近头近中位。
- v2 [400,1750]：混出后螺旋眼残留（缺陷）。
- 根因：AttachmentTimeline 在 alpha<1 不生效 + attachmentThreshold=0 混合期整体跳过 → 恢复键必须在最后一个满权重帧命中。
- **v5 [400,1750] mixIn 120 定稿**：恢复键置于混出起点前 1/60s，1.3s 眼睛回神、2.0 完全归位。

### 6. gesture.pump / screen_right
- 扫描 [2.8,4.8]：3.0–3.3 抬拳、3.3 已到位、3.6–4.0 挥击、4.5 落定。
- **v2 [3000,4400] 定稿**：完整抬-挥-落弧线，首尾混入混出均平滑。

## P0 扩展族批次（+6 条，全部 candidate）

勘探方法：face 骨 arotation 增量曲线（0.2s 采样）+ 各动画附件键位表 → 候选窗口 → 相位截图视觉验收。
关键发现：stand 本体 7.6–11.6 为低头弯倾段（此前是 overlay 禁区，现在本身成为 sleepy/lower 的素材源）；
stand2 是带更多表情键的 stand 变体；dance/sleep/wash 是未被发掘的表情动作源。

| # | 逻辑键 | 定稿窗口 | 混入/混出 | 相位证据 | 结论 |
|---|---|---|---|---|---|
| 10 | head.shake / normal | dance[0,1170] | 100/150ms | head_shake_scan/（8 相位） | ✅ 单眼眨+左右大幅摆头，俏皮自然；闭眼笑附件随行 |
| 11 | reaction.sleepy / small | stand[7550,12100] | 120/150ms | head_lower_scan/（9 相位） | ✅ 源内自带完整低头-走神-回正过渡（0→-26°→0），闭眼随行；不依赖混合 |
| 12 | head.lower / small | stand[7550,8300] | 120/300ms | head_lower_small_v1/（6 相位） | ✅ 源内垂下+混出托底抬头（0.3s 慢混出自然回正） |
| 13 | life.blink / paired | normal[3750,4250] | 50/80ms | eyes_blink_scan/（8 相位） | ✅ 双眨键精确覆盖（3.83 闭/3.93 开/4.03 闭/4.13 开），纯 face 通道 |
| 14 | face.eyes_squeeze / paired | touch[170,670] | 50/100ms | eyes_squeeze_scan/（8 相位） | ✅ > < 眯眼+眉毛，无头部动作（face 通道纯净性验证） |
| 15 | life.idle / default | stand[0,20330] native_clip | — | Lab 默认视图即本动作 | ✅ 原生待机全段封装，首尾同相位（arotation 0→0）可循环 |

### 机制发现（infra TODO）

**overlay 首个 entry 的 mixIn 无效**：轨道为空时 setAnimationWith 无 mixingFrom，
entry 立即满权重生效（node 复现确认）——sleep 全程垂姿保持因此不适合直接切片，
入场平滑必须依赖源动画自身的准备段（窗口选取原则）或未来的 alpha 渐升驱动
（GestureLayer.sync 内按 entry.alpha 0→1 逐帧爬升，列为 infra TODO）。

## 草稿转换批次（+1 条，candidate）

| # | 逻辑键 | 来源 | 产物 | 重验证 | 结论 |
|---|---|---|---|---|---|
| 16 | head.nod / small | public/motions/llm_nod.json（MiMo V1.1 协议产物的 V1 内部格式存档） | drafts/lafei.nod.v11.json | ✅ 七步管线（编译+隔离采样）零失败，tests/m5-seed-manifest.test.ts | ✅ 转换+重验证通过 |

### 转换要点（数据驱动，无硬编码）

- role+property → controlId 经档案 mapsTo；composite 子控制（face.eyeL.state/face.eyeR.state）
  不单独出曲线，由 face.eyes.pair 组合枚举统一表达（双眼附件值对经 compositeEntries 反查枚举键）
- **Retime 显式策略**：V1 bezier 缓动在 V1.1（linear/smooth）下峰值速率 209.6°/s 超 head.nod
  限速 200°/s → 统一放慢 1.25 倍（0.8s→1.0s，采样复核 168°/s）——转换器规则而非校验放宽
- 语义澄清：本 rig 的 head.nod 控制实际为头部左右快倾（±40° 已验证域）——
  "点头"在本资产的表达形式即快倾摆动，与原动画师节奏一致（stand 采样 191°/s）

### 至此 manifest：16 条 candidate（9 迁移 + 6 P0 扩展 + 1 草稿转换），覆盖
native_slice（14）/ native_clip（1）/ draft（1）三种载体；配方族待 nod 组件 approved 后组合。

## 受限 Author 创作批次（+17 条 draft 载体，2026-09-15 上午）

应用户指令"不存在的动作由你来创作"：在本 rig 10 个已验证控制的域内直接创作 V1.1 草稿
（数据驱动写集派生），全部经七步管线重验证（编译+隔离采样，tests 内全量循环），
关键动作经 Lab 冻结截图视觉迭代。

| # | 逻辑键 | 曲线设计 | 视觉证据 | 结论 |
|---|---|---|---|---|
| 18 | contact.chin_rest / both | 双臂内收捧脸+前臂内折+头倾 −5°，2.8s | v1→v4 四轮迭代（v1 右臂横越、v2 左臂腰位、v3 双臂外展、**v4 定稿**） | ✅ 双手收拢下巴/脸颊两侧，读法自然 |
| 19 | contact.cheek_touch / screen_right | 右手到脸侧轻碰，1.3s | v1_pose065 | ✅ |
| 20 | contact.scratch_head / screen_right | 举手到头旁+前臂挠动，1.8s | v1_pose090 | ✅ |
| 21 | gesture.beckon / screen_right | 举臂+前臂摆动×3，1.5s | v1_waggle | ✅ |
| 22 | gesture.stop / screen_right | 快起长停（45°），1.6s | 管线证据（与 cheek_touch 同 mechanics） | ✅ |
| 23 | gesture.present / both | 双臂外展对称（左负右正），1.5s | 管线证据 | ✅ |
| 24 | gesture.hands_reset / both | 双臂回归位，0.9s | 管线证据 | ✅ |
| 25 | life.breathe / subtle | torso.bob ±0.006H 呼吸，3.2s 可循环 | 管线证据 | ✅ |
| 26 | life.shift_weight / left·right | 躯干缓倾 ±4° 保持，2.2s | 管线证据 | ✅ |
| 27 | body.lean / screen_right·left | 躯干 ±10° 弧线，1.3s | 管线证据 | ✅ |
| 28 | body.sway / gentle | 躯干 ±8° 摆动，2.8s 可循环 | 管线证据 | ✅ |
| 29 | reaction.celebrate / small | 挥拳+眯眼多曲线组合，1.3s | v1_peak | ✅ |
| 30 | face.eyes_close / paired | eyes.pair blink 保持后睁开，1.2s | 管线证据 | ✅ |
| 31 | head.tilt / gentle.screen_right | 头倾 +14° 保持，1.6s | 管线证据 | ✅ |
| 32 | head.tilt / gentle.screen_left | 头倾 −14° 保持，1.6s | 管线证据 | ✅ |

**实测符号语义（后续创作必读）**：左臂 raise 正值=向躯干内收（横越身前）、负值=向外展
——与档案描述的直觉相反，以本轮冻结截图实测为准；右臂正值=前上举。

### 管线验证明细

- 首轮 18 草稿：11 通过 / 7 失败（5 个为验证脚本误用 legacy 预算 [0.4,2]s——改用
  interaction 预算 [0.4,5]s；2 个前臂曲线 7 键超 ≤6 键预算——减一次摆动）
- 复验 **18/18 全部通过**（含 chin_rest/celebrate 多曲线组合、breathe/sway 向量曲线、
  eyes_close stepped 组合控制）
