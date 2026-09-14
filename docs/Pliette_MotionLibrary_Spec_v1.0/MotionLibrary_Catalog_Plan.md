# MotionLibrary 动作目录备案

版本：planning-2026-09-14.1。所有条目为 planned；P0/P1/P2 是制作顺序，不能据此判断可播放。

语义能力名需要 Agent 映射到当前 ControlProfile、原动画能力、场景服务；本清单不授予控制权限。

完整字段以 motion-catalog.plan.json 和开发 Spec 为准。所有初始切片仅有 full；有证据后再开放 prepare / stroke / hold / recover。

## 生命感与待机

| actionId | 动作 | 优先级 | variantId | 制作与能力说明 |
|---|---|---|---|---|
| `life.idle` | 自然待机 | P0 | `default` | 优先封装模型原生待机；允许循环须单独验证首尾 |
| `life.breathe` | 轻微呼吸 | P1 | `subtle` | 避免与原动画烘焙呼吸重复 |
| `life.blink` | 眨眼 | P0 | `paired` | 先核实附件实际语义，闭眼附件不必然是眨眼 |
| `life.shift_weight` | 轻微重心变化 | P1 | `left`、`right` | 固定脚底和支撑，不使用模型整体滑动伪造 |
| `life.idle_fidget` | 待机小动作 | P1 | `default` | 只收录有完整进入退出的片段 |
| `life.listen_idle` | 安静倾听待机 | P1 | `default` | 保持少量变化，可做基础动作与头部配方 |
| `life.seated_idle` | 坐姿待机 | P1 | `default` | 必须已有可验证坐姿，不以站姿压缩替代 |
| `life.sleep_idle` | 睡眠待机 | P2 | `seated`、`lying` | 闭眼与支撑姿态一起验证 |

## 头部动作

| actionId | 动作 | 优先级 | variantId | 制作与能力说明 |
|---|---|---|---|---|
| `head.nod` | 点头 | P0 | `small`、`normal` | 可复用已有 nod 草稿，重新检查混入混出 |
| `head.shake` | 摇头 | P1 | `small`、`normal` | 左右转动能力需证据，不把平面摆头标为转头 |
| `head.tilt` | 歪头 | P0 | `gentle.screen_left`、`gentle.screen_right` | 以当前资产视图为方向基准 |
| `head.lower` | 低头 | P1 | `small` | 标明二维轮廓实际表达程度 |
| `head.raise` | 抬头 | P1 | `small` | 不得超出已验证头部控制域 |
| `head.forward` | 头部轻探 | P2 | `small` | 无独立位移能力则记为 unsupported |
| `head.recoil` | 头部轻缩 | P2 | `small` | 不得用头身分离制造效果 |
| `head.reset` | 头部回正 | P0 | `default` | 交还当前基础层而非强制 setup 归零 |

## 注视与注意

| actionId | 动作 | 优先级 | variantId | 制作与能力说明 |
|---|---|---|---|---|
| `gaze.user` | 看向用户 | P1 | `head_assisted` | 先定义可达的目标与朝向范围 |
| `gaze.side` | 看向侧边 | P2 | `screen_left`、`screen_right` | 需要眼部或头部朝向能力，禁止假定存在 |
| `gaze.vertical` | 看向上下 | P2 | `up`、`down` | 独立瞳孔移动与整脸贴图切换分别说明 |
| `gaze.follow` | 跟随目标 | P2 | `default` | 持续目标交给本地控制器，LLM 只声明意图 |
| `gaze.avert` | 移开视线 | P2 | `screen_left`、`screen_right` | 明确移开与恢复时机 |
| `gaze.return` | 视线回到用户 | P2 | `default` | 恢复上层目标，不写死屏幕中心 |

## 面部与眼睛状态

| actionId | 动作 | 优先级 | variantId | 制作与能力说明 |
|---|---|---|---|---|
| `face.eyes_open` | 睁眼 | P0 | `paired` | 附件组来自当前角色控制档案 |
| `face.eyes_close` | 闭眼 | P1 | `paired` | 闭眼与弯月笑眼分开登记 |
| `face.eyes_squeeze` | 眯眼 | P0 | `paired` | 复核现有 happy 切片是否还写头部 |
| `face.wink` | 单眼眨眼 | P1 | `screen_left`、`screen_right` | 左右变体单独验收，不能镜像猜测 |
| `face.dizzy` | 螺旋眼 | P0 | `paired` | 复用 yun 表情需准确提取写集 |
| `face.sleepy` | 困倦眼 | P1 | `paired` | 只使用已登记附件组合 |
| `face.smile` | 微笑 | P2 | `gentle` | 只有眼睛时不能声称具有独立嘴角动画 |
| `face.surprised` | 惊讶表情 | P2 | `small` | 缺附件记缺口 |
| `face.sad` | 难过表情 | P2 | `small` | 缺附件记缺口 |
| `face.blush` | 脸红 | P2 | `small` | 腮红 slot 有资产与控制能力后才开放 |
| `face.neutral` | 表情恢复 | P0 | `default` | 恢复进入前状态或基础层；不能清空其他表情所有者 |

## 手臂与交流手势

| actionId | 动作 | 优先级 | variantId | 制作与能力说明 |
|---|---|---|---|---|
| `gesture.wave` | 挥手 | P0 | `small.screen_right`、`small.screen_left` | 旧 leftArm 波形实际是短促举手，不能自动算作挥手 |
| `gesture.raise_hand` | 举手 | P0 | `screen_left`、`screen_right` | 迁移 stand 13.0–13.9 的左臂片段至本语义 |
| `gesture.point` | 指向 | P0 | `screen_right`、`screen_left` | 指向方向与目标必须经过可达域检查 |
| `gesture.pump` | 庆祝挥拳 | P0 | `screen_right`、`screen_left` | 优先迁移 victory 3.3–4.1 切片 |
| `gesture.beckon` | 招手示意过来 | P1 | `screen_right`、`screen_left` | 与问候挥手语义分开 |
| `gesture.present` | 介绍或展示 | P1 | `screen_right`、`screen_left`、`both` | 双手版本作为一个原子多通道动作 |
| `gesture.stop` | 抬手示意停止 | P1 | `screen_right`、`screen_left` | 不假定手掌贴图可以自由旋转 |
| `gesture.shrug` | 耸肩摊手 | P1 | `both` | 完整进入、主体、退出 |
| `gesture.clap` | 鼓掌 | P2 | `both` | 手部接触未经标定不得上线 |
| `gesture.thumbs_up` | 竖拇指 | P2 | `screen_right`、`screen_left` | 依赖手型附件或独立手指 |
| `gesture.ok` | OK 手势 | P2 | `screen_right`、`screen_left` | 无手型能力时直接 unsupported |
| `gesture.peace` | 比耶 | P2 | `screen_right`、`screen_left` | 不可用举臂替代后标为成功 |
| `gesture.heart` | 比心 | P2 | `both` | 后续内容任务 |
| `gesture.hands_reset` | 手臂收回 | P0 | `screen_right`、`screen_left`、`both` | 只释放自身写集；保留他人动作 |

## 躯干与身体表达

| actionId | 动作 | 优先级 | variantId | 制作与能力说明 |
|---|---|---|---|---|
| `body.lean` | 身体轻倾 | P0 | `screen_left`、`screen_right` | 头身拓扑不联动时显式组合头部 |
| `body.shrink` | 缩身 | P1 | `small` | 保持脚底和头身连贯 |
| `body.straighten` | 挺直身体 | P1 | `small` | 不以整体缩放替代 |
| `body.bow` | 鞠躬 | P2 | `small` | 先验收平面角色能表达的幅度 |
| `body.stretch` | 伸懒腰 | P2 | `both` | 限制肩部衣袖变形 |
| `body.cross_arms` | 抱臂 | P2 | `both` | 资产与接触不具备则缺口 |
| `body.hands_on_hips` | 叉腰 | P2 | `both` | 后续标定 |
| `body.sway` | 轻轻摇摆 | P1 | `gentle` | 循环需要同相位边界 |

## 场景移动

| actionId | 动作 | 优先级 | variantId | 制作与能力说明 |
|---|---|---|---|---|
| `locomotion.walk` | 行走 | P1 | `in_place`、`to_target` | 原地动画与场景根节点位移分别验收 |
| `locomotion.run` | 跑步 | P2 | `in_place`、`to_target` | 需要原生跑步或完整已验收动作 |
| `locomotion.stop` | 停止移动 | P1 | `default` | 先处理场景速度与脚步相位 |
| `locomotion.step` | 侧移一步 | P2 | `screen_left`、`screen_right` | 禁止直接滑动模型冒充迈步 |
| `locomotion.turn` | 转向 | P2 | `screen_left`、`screen_right` | 首角色仅正面，不能默认支持背面转身 |
| `locomotion.approach` | 靠近目标 | P1 | `default` | 目标由场景注册表提供 |
| `locomotion.retreat` | 后退 | P2 | `default` | 不能倒放原动画默认通过 |

## 姿势切换

| actionId | 动作 | 优先级 | variantId | 制作与能力说明 |
|---|---|---|---|---|
| `posture.sit_down` | 坐下 | P1 | `chair`、`floor` | 椅子版本需要 seat 接触资源 |
| `posture.stand_up` | 起身 | P1 | `chair`、`floor` | 不能任意倒放坐下动作 |
| `posture.crouch` | 蹲下 | P2 | `default` | 需要腿部姿势能力 |
| `posture.kneel` | 跪坐 | P2 | `default` | 模型骨架不足则 unsupported |
| `posture.lie_down` | 躺下 | P2 | `default` | 需要场景支撑与适合的视图 |
| `posture.prone` | 趴下 | P2 | `default` | 不旋转整张纸片冒充身体动作 |
| `posture.get_up` | 从躺姿起身 | P2 | `default` | 成套验收进入退出 |

## 身体接触与支撑

| actionId | 动作 | 优先级 | variantId | 制作与能力说明 |
|---|---|---|---|---|
| `contact.touch_table` | 手触桌面 | P0 | `screen_right`、`screen_left` | 已有固定场景证据不能推广到任意桌高 |
| `contact.chin_rest` | 托腮 | P1 | `both`、`screen_right`、`screen_left` | 当前 Author 能力缺口；列为重点备案，不承诺首期生成成功 |
| `contact.cheek_touch` | 摸脸颊 | P2 | `screen_right`、`screen_left` | 需位置接触标定 |
| `contact.scratch_head` | 挠头 | P2 | `screen_right`、`screen_left` | 动作不可切在穿越脸部或头部的中间态 |
| `contact.rub_eyes` | 揉眼 | P2 | `both` | 接触与眼睛附件必须协调 |
| `contact.cover_face` | 捂脸 | P2 | `both` | 检查遮挡和退出 |
| `contact.hug_self` | 抱住自己 | P2 | `both` | 后续内容任务 |
| `contact.release` | 解除接触并收回 | P1 | `default` | 交还资源前执行已验收退出 |

## 物品互动

| actionId | 动作 | 优先级 | variantId | 制作与能力说明 |
|---|---|---|---|---|
| `object.reach` | 伸手接近物品 | P2 | `screen_right`、`screen_left` | 目标 ID 必须来自场景 |
| `object.grasp` | 抓握物品 | P2 | `screen_right`、`screen_left` | 手型与持物 slot 就绪后实现 |
| `object.pick_up` | 拿起物品 | P2 | `screen_right`、`screen_left` | 持物状态事件必须恰好执行一次 |
| `object.hold` | 持有物品 | P2 | `screen_right`、`screen_left`、`both` | 保持物体归属与位置 |
| `object.move` | 移动手中物品 | P2 | `screen_right`、`screen_left` | 不可独立重播改变物品所有权 |
| `object.put_down` | 放下物品 | P2 | `screen_right`、`screen_left` | 依赖抓握状态与支撑面 |
| `object.release` | 松开物品 | P2 | `screen_right`、`screen_left` | 不能与当前接触状态相冲突 |
| `object.drink` | 喝饮料 | P2 | `screen_right` | 手上画有可乐不等于可执行完整喝水链 |
| `object.read` | 拿书阅读 | P2 | `both` | 可先做无翻页的完整动作 |
| `object.turn_page` | 翻页 | P2 | `screen_right`、`screen_left` | 先定义书页状态事件 |
| `object.write` | 写字 | P2 | `screen_right`、`screen_left` | 细手动作缺失时不要假装完成 |
| `object.type` | 打字 | P2 | `both` | 键盘资源和双手同步 |

## 情境反应

| actionId | 动作 | 优先级 | variantId | 制作与能力说明 |
|---|---|---|---|---|
| `reaction.happy` | 开心反应 | P0 | `small` | 迁移 touch 片段后保留实际写集 |
| `reaction.shy` | 害羞反应 | P0 | `small` | 迁移 sit 片段必须声明适用姿势 |
| `reaction.dizzy` | 晕乎乎反应 | P0 | `small` | 整段反应与单纯螺旋眼分开 |
| `reaction.surprised` | 惊讶反应 | P1 | `small` | 优先小幅可达动作，不伪造惊讶脸 |
| `reaction.startled` | 被吓一跳 | P1 | `small` | 首次反馈与完整反应分别计时 |
| `reaction.embarrassed` | 尴尬反应 | P1 | `small` | 挠头能力不足时备案其他明确变体 |
| `reaction.disappointed` | 失落反应 | P1 | `small` | 控制幅度，完整恢复 |
| `reaction.sleepy` | 打瞌睡反应 | P1 | `small` | 不把循环结束卡在垂头失衡处 |
| `reaction.celebrate` | 开心庆祝 | P1 | `small` | 可由已验收 pump 与 head 组成配方 |

## 完整动作配方

| actionId | 动作 | 优先级 | variantId | 制作与能力说明 |
|---|---|---|---|---|
| `routine.greet` | 问候：挥手并点头 | P0 | `default` | 先检查完整配方；子动作共用冻结版本 |
| `routine.farewell` | 告别：挥手后收回 | P1 | `default` | 完整进入退出，序列不能截断在举手中 |
| `routine.listen` | 倾听：注视并轻点头 | P1 | `default` | 只在具备注视能力时加入 gaze 子动作 |
| `routine.think` | 思考：歪头并短暂停留 | P0 | `default` | hold 是明确安全相位，不能循环任意最后一帧 |
| `routine.explain` | 解释：点头配合展示手势 | P1 | `default` | 复用身体通道组合 |
| `routine.chin_rest` | 双手托腮并安静停留 | P1 | `both` | 重点后续内容任务，当前不可用 |
| `routine.touch_and_retract` | 触桌后收回 | P1 | `screen_right` | 接触建立与释放必须配对 |
| `routine.pick_and_place` | 拿起再放下物品 | P2 | `screen_right` | 一个不可拆断事务 |
| `routine.sit_and_read` | 走到座位并坐下阅读 | P2 | `default` | 场景动作与骨骼动作共同准备 |
| `routine.react_and_recover` | 短反应后恢复待机 | P1 | `default` | 明确恢复当前基础层 |
| `routine.return_idle` | 退出当前动作回待机 | P0 | `default` | 按所有权退出，不调用全局 clearTracks |
| `routine.long_sequence` | 长连贯表演 | P2 | `custom` | 具体脚本先备案；该占位本身不是通用任意动作能力 |

合计：12 类、110 个动作族、154 个命名变体。
