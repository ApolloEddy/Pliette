# MotionLibrary 动作族结论总表（110 族全量判定）

日期：2026-09-17。对应目录 `activation-2026-09-17.1` 及后续修订。
每族结论三值：**✅ 已完成**（manifest 有条目，含视觉/管线证据）· **☑ 机制覆盖**（无需独立条目，
由播放层/场景层/已有动作承载）· **⛔ 不可制作**（含具体缺口，解除条件注明）。
条目状态 candidate/approved 与证据见 `public/motion-library/models/lafei_8/front/manifest.json`；
逐条精调记录见 [TUNING-LOG.md](../../experiments/motion-library/tuning/TUNING-LOG.md)。

## 生命感与待机（8）

| 族 | 结论 | 说明 |
|---|---|---|
| life.idle | ✅ | stand 全段 native_clip（approved，可循环） |
| life.breathe | ✅ | torso.bob ±0.006H 创作草稿（approved，可循环） |
| life.blink | ✅ | normal 双眨键切片（approved） |
| life.shift_weight | ✅ | left/right 躯干缓倾（approved） |
| life.idle_fidget | ✅ | normal 切片 + idle_subtle r1 创作版（approved/candidate） |
| life.listen_idle | ✅ | lean_listen r1 转换（approved） |
| life.seated_idle | ⛔ | 缺口：无坐姿保持动画（sit 为坐下过渡非 hold）；解除：坐姿 hold 源或姿态保持切片机制 |
| life.sleep_idle | ⛔ | 缺口：seated/lying 变体无姿态源（站立垂头已由 reaction.sleepy 覆盖） |

## 头部（8）

| 族 | 结论 | 说明 |
|---|---|---|
| head.nod | ✅ | small：llm_nod 转换版 + nod_primitive r1/r2（本 rig 点头=头部快倾） |
| head.shake | ✅ | normal：dance 切片（approved） |
| head.tilt | ✅ | gentle.screen_left/right（approved） |
| head.lower | ✅ | small：stand[7550,8300]（approved） |
| head.raise | ⛔ | 缺口：rig 头部仅滚转维度（左右倾），无俯仰轴——抬头不可表达；解除：需新骨骼/附件维度 |
| head.forward | ⛔ | 缺口：头部 translate 曲线勘探为全零（无前后位移维度） |
| head.recoil | ⛔ | 同上（无位移/俯仰维度） |
| head.reset | ☑ | 机制覆盖：所有动作混出即交还基础层（setup 附件恢复键+rotate 混出），独立条目无必要 |

## 注视与注意（6）

| 族 | 结论 | 说明 |
|---|---|---|
| gaze.user / side / vertical / follow / avert / return | ⛔ 全族 | 缺口：眼睛为整附件切换（6 值枚举 open/blink/squeeze/dizzy/sleepy/wink），无瞳孔/眼球方向控制；头部滚转不构成注视方向。解除：眼神附件组扩展（需资产）或瞳孔骨骼 |

## 面部与眼睛（11）

| 族 | 结论 | 说明 |
|---|---|---|
| face.eyes_open | ✅ | pair open 显式恢复（candidate） |
| face.eyes_close | ✅ | pair blink 保持（approved） |
| face.eyes_squeeze | ✅ | touch 纯 face 通道切片（approved） |
| face.dizzy | ✅ | yun face 通道纯眼切片（candidate）+ reaction.dizzy 头眼组合（approved） |
| face.sleepy | ✅ | pair sleepy 保持（candidate） |
| face.neutral | ✅ | pair 显式回 open（candidate） |
| face.wink | ⛔ | 缺口：单眼眨需单侧写权限——face.eyeL/R.state 为 candidate 且 Spec 禁单眼直写（pair 枚举 wink 为双眼） |
| face.smile | ⛔ | 缺口：无嘴角独立控制（mouth slot 存在但无控制证据/附件组） |
| face.surprised | ⛔ | 缺口：Skin 附件组无惊讶眼/眉 |
| face.sad | ⛔ | 缺口：无难过表情附件 |
| face.blush | ⛔ | 缺口：hongyun slot 存在但无独立开关证据（仅动画内嵌）；可后续勘探 |

## 手臂与手势（14）

| 族 | 结论 | 说明 |
|---|---|---|
| gesture.wave | ✅ | stand 切片（approved）+ 3 个创作版备选 |
| gesture.raise_hand | ✅ | screen_left（approved） |
| gesture.point | ✅ | attack 切片 + 2 创作版 |
| gesture.pump | ✅ | victory 切片（approved） |
| gesture.beckon | ✅ | 创作草稿（approved） |
| gesture.present | ✅ | both（approved） |
| gesture.stop | ✅ | 创作草稿（approved） |
| gesture.hands_reset | ✅ | both（approved） |
| gesture.shrug | ⛔ | 缺口：无独立肩部骨骼（肩随臂）；外展+头倾不构成耸肩视觉 |
| gesture.clap | ⛔ | 缺口：双手合拍需手型与双臂接触标定（手仅 2 段无手指） |
| gesture.thumbs_up / ok / peace / heart | ⛔ 全族 | 缺口：无手指骨骼（hand 仅 hand_R/L + R3/L3 两段）——手型不可表达；解除：手型附件组资产 |

## 躯干与身体（8）

| 族 | 结论 | 说明 |
|---|---|---|
| body.lean | ✅ | screen_left/right（approved） |
| body.shrink | ✅ | small：shrink_shy r1 转换（approved） |
| body.straighten | ✅ | bob 上展创作（candidate） |
| body.sway | ✅ | gentle ±8° 摆动（approved，可循环） |
| body.stretch | ✅ | both 双臂上展（candidate） |
| body.bow | ⛔ | 缺口：2D 正面 rig 无前屈维度（旋转为侧向、无 Z 轴位移） |
| body.cross_arms | ⛔ | 缺口：前臂验证域 ±20° 不足以抱臂缠绕；解除：域扩展标定（±45 探针）或姿势资产 |
| body.hands_on_hips | ⛔ | 缺口：肘外撑姿态超出前臂域且无叉腰手型 |

## 场景移动（7）

| 族 | 结论 | 说明 |
|---|---|---|
| locomotion.walk | ✅ | in_place：move 全段 native_clip（candidate，可循环；步速 0.115H/s 已标定） |
| locomotion.run | ⛔ | 缺口：无跑步动画资产 |
| locomotion.stop | ⛔ | 缺口：步态相位对齐与滑步消除未标定（场景层职责） |
| locomotion.step | ⛔ | 缺口：无侧移动画 |
| locomotion.turn | ☑ | 场景层覆盖：stage.turnActor（非骨骼动作；首角色仅正面，Spec A01 限制朝向） |
| locomotion.approach | ☑ | 场景层覆盖：A08 walk_in 锚点位移+步速标定（有视频证据） |
| locomotion.retreat | ☑ | 场景层覆盖：A08 walk_back（场景位移合法；倒放禁令仅针对骨骼动画） |

## 姿势切换（7）

| 族 | 结论 | 说明 |
|---|---|---|
| posture.sit_down | ✅ | chair：sit 全段 native_clip（candidate；seat 接触资源契约已登记） |
| posture.stand_up | ⛔ | 缺口：无独立起身动画且倒放被 Spec 禁止；解除：起身过渡资产 |
| posture.crouch / kneel / lie_down / prone / get_up | ⛔ 全族 | 缺口：无对应姿态动画源（骨架/皮肤不支持这些姿态表达） |

## 身体接触（8）

| 族 | 结论 | 说明 |
|---|---|---|
| contact.touch_table | ✅ | screen_right（approved；0.27H 标定+资源契约） |
| contact.chin_rest | ✅ | both（approved；4 轮视觉迭代） |
| contact.cheek_touch | ✅ | screen_right（approved） |
| contact.scratch_head | ✅ | screen_right（approved） |
| contact.rub_eyes | ✅ | both（candidate） |
| contact.cover_face | ✅ | both（candidate） |
| contact.hug_self | ✅ | both（candidate，双臂内交叉） |
| contact.release | ☑ | 机制覆盖：gesture.hands_reset（臂收回）+ Scheduler 资源账本释放（contact 资源原子释放） |

## 物品互动（12）

| 族 | 结论 | 说明 |
|---|---|---|
| object.reach | ☑ | 机制覆盖：gesture.point/stop 同臂位表达（手持可乐随动）；独立 reach 无附加语义 |
| object.grasp / pick_up / hold / move / put_down / release | ⛔ 全族 | 缺口：无抓握控制——kele 为固定常驻附件（不可挂载/卸载），无独立手持物状态机；解除：手持物 slot 化（资产+状态机） |
| object.drink | ☑ | 机制覆盖：stand 原生含举瓶喝可乐段（基础层自然行为+手持可乐常驻） |
| object.read / turn_page / write / type | ⛔ 全族 | 缺口：无书/笔/键盘资产与手型（含 object.grasp 全部缺口） |

## 情境反应（9）

| 族 | 结论 | 说明 |
|---|---|---|
| reaction.happy | ✅ | touch 切片（approved） |
| reaction.shy | ✅ | sit head 切片（approved） |
| reaction.dizzy | ✅ | yun 切片（approved，含螺旋眼+摇摆） |
| reaction.sleepy | ✅ | stand 低头弯倾段（approved） |
| reaction.celebrate | ✅ | 挥拳+眯眼创作（approved） |
| reaction.embarrassed | ✅ | 挠头+困倦眼创作（candidate） |
| reaction.disappointed | ✅ | 低头+困倦眼创作（candidate；无专用失落附件，近似已注明） |
| reaction.surprised | ⛔ | 缺口：无惊讶表情附件（attack 的 bushuang 为不悦；硬凑不诚实） |
| reaction.startled | ⛔ | 缺口：无惊跳位移维度（身体无快速位移/Z 轴控制） |

## 完整动作配方（12）

| 族 | 结论 | 说明 |
|---|---|---|
| routine.greet | ✅ | recipe：wave+nod（approved，子动作冻结修订） |
| routine.chin_rest | ✅ | both（approved） |
| routine.explain | ✅ | 展示手+双点头创作（candidate） |
| routine.farewell | ☑ | 由 gesture.wave 全弧覆盖（切片含自然收回；同物别名不重复入册） |
| routine.listen | ☑ | 由 life.listen_idle 覆盖（倾身+头侧即倾听姿态） |
| routine.think | ☑ | 由 head.tilt/gentle 覆盖（歪头短暂停留即思考） |
| routine.touch_and_retract | ☑ | 由 contact.touch_table 全弧覆盖（混出收回+A03/A08 场景触碰标定） |
| routine.react_and_recover | ☑ | 由 reaction.dizzy 等全弧覆盖（混出恢复即 recover 相位） |
| routine.return_idle | ☑ | 机制覆盖：Scheduler 所有权退出+混出交还基础层（gesture.hands_reset 可显式触发） |
| routine.pick_and_place | ⛔ | 缺口：同 object.grasp（无抓握） |
| routine.sit_and_read | ⛔ | 缺口：无书资产+坐姿保持（同 life.seated_idle） |
| routine.long_sequence | ⛔ | 占位条目非通用能力；长序列由 bufferedSequence/rolling 播放机制承载（待 RTF 实测准入） |

## 汇总

| 结论 | 族数 |
|---|---|
| ✅ 已完成（manifest 条目） | 46 |
| ☑ 机制/场景层覆盖（无需独立条目） | 12 |
| ⛔ 不可制作（缺口明确） | 52 |
| **合计** | **110** |

缺口归类：手指/手型（gesture 5 + object 6 + 部分 contact）· 眼神方向（gaze 6）·
表情附件缺失（face 4 + reaction 2）· 姿态资产缺失（posture 6 + life 2 + locomotion.run/step）·
2D 维度限制（head.raise/forward/recoil、body.bow）· 接触/抓握系统（object 族、cross_arms 等）。
各项"解除条件"见对应行——多数需新资产（附件组/骨骼/动画），少数需标定扩展（左臂域、blush 勘探）。
