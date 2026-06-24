# 训练数据结构化 + 可视化仪表盘 — 设计文档

**日期:** 2026-06-23
**状态:** 待用户确认
**前置:** 演进自 `2026-06-22-cc-workout-assistant-design.md`(纯 markdown 方案)

## 1. 背景与目标

现状:训练计划、记录、动作要领都是 markdown,靠 CC 对话读写。
演进诉求:把数据**结构化存储**,加一个**可视化网页**在手机上查看;录入方式不变(用户在 session 说,CC 写)。

目标:给现有方案加一个**数据层**(JSON)和一个**查看层**(网页),录入端仍是 CC。

## 2. 架构总览

```
录入:  用户(session) → CC 写 JSON
数据层: data/log.json(记录) + data/plan.json(计划)   ← 唯一数据源
知识库: 动作库.md + 拉伸方案.md                        ← CC 读,给要领
查看层: index.html(读两个 JSON,渲染仪表盘)
托管:  git 仓库 → GitHub Pages(public)→ 手机开网址看
```

无后端、无数据库服务。数据是 git 仓库里的 JSON,手机通过 GitHub Pages 静态访问。

## 3. 数据层

### `data/log.json` — 训练记录(唯一源)

```json
{
  "sessions": [
    {
      "date": "2026-06-22",
      "type": "推",
      "round": 1,
      "exercises": [
        { "name": "上斜哑铃卧推", "sets": [ { "weight": null, "reps": null } ], "note": "" }
      ],
      "note": "基本都练了,重量没记住"
    }
  ]
}
```

- `weight`:number 或 null(单位 kg,哑铃记单只)
- `reps`:number 或 null
- `sets`:数组,每组一项 `{weight, reps}`
- 趋势图从这里算「最大重量」和「容量 Σ(weight×reps)」

### `data/plan.json` — 训练计划(唯一源)

```json
{
  "splits": [
    {
      "key": "推",
      "label": "推 Push(胸 / 肩 / 三头)",
      "exercises": [
        {
          "name": "上斜哑铃卧推",
          "setsReps": "4 × 8-12",
          "target": "上胸",
          "cue": "椅背 30°,肘略低于肩,下放到充分拉伸",
          "alternates": ["上斜史密斯卧推", "平板哑铃卧推"],
          "superset": null
        }
      ]
    }
  ]
}
```

- `superset`:"A" / "B" … 标超级组配对,null 表示不配
- 内容从现有 `训练计划.md` 转换,**无损**

## 4. 查看层:`index.html`

自包含、手机友好的单页。读 `./data/log.json` + `./data/plan.json`。三个模块:

1. **趋势图** — 下拉选一个动作,Chart.js 折线:X = 日期,Y = 最大重量 / 容量。null 数据点跳过。
2. **计划总览** — 读 `plan.json` 渲染完整的推/拉/腿安排(动作 / 组数次数 / 目标肌 / 要点 / 备用 / 超级组标记);每个动作旁拼上 `log.json` 里该动作的**最近成绩 + 距今几天**。
3. **训练日历** — 近 N 周热力图,标出训练日 + 部位,显示连续打卡。

技术:单 HTML,内联 CSS/JS,图表用 Chart.js(CDN);响应式适配手机。

## 5. 文件变更清单

| 文件 | 处理 |
|------|------|
| `data/log.json` | **新增**(迁入 6-22 记录) |
| `data/plan.json` | **新增**(从 训练计划.md 转换) |
| `index.html` | **新增**(仪表盘) |
| `CLAUDE.md` | **更新**:规约改为读写 JSON;并入营养与恢复要点 |
| `训练计划.md` | **退役**(被 plan.json 取代) |
| `训练日志.md` | **退役**(被 log.json + 网页取代) |
| `动作库.md` | 保留不变 |
| `拉伸方案.md` | 保留不变 |

## 6. CLAUDE.md 更新点

- 「今天练 X」→ 读 `data/plan.json` 对应 split + `动作库.md` 要领;并从 `data/log.json` 取上次成绩提醒
- 报数据 → 写入 `data/log.json`(当天有 session 则 append exercise,没有则新建 session 对象)
- 「换动作」→ 改 `data/plan.json` 的 alternates
- 营养与恢复要点(蛋白 1.6–2.2 g/kg、热量 +200–300、练后碳水蛋白、睡眠 7–9h、渐进超负荷、6–8 周减载)并入 CLAUDE.md

## 7. 部署

1. `git config user.email` 设为 GitHub noreply 邮箱(`<ID>+<用户名>@users.noreply.github.com`)——**需用户提供 GitHub 用户名**
2. `git init` → add → commit
3. 创建 GitHub public repo,push(用 `gh` CLI 或用户网页操作)
4. Settings → Pages → 从 `main` 分支 root 发布
5. 手机访问 `https://<用户名>.github.io/<repo>/`

## 8. 隐私

- public 仓库:训练数字公开可见(无 PII,可接受)
- 用 noreply 邮箱提交,不暴露真实/公司邮箱
- 仓库内无真实姓名

## 9. 验收标准

1. `log.json` 含 6-22 记录,schema 正确
2. 在 session 报新数据 → 正确写入 `log.json`
3. 网页打开(本地或 Pages):选动作看趋势、看完整计划 + 最近成绩、看日历,三块都正确渲染
4. 手机访问 Pages URL 正常显示

## 10. 非目标(YAGNI)

- 不做后端 / 数据库服务 / SQLite
- 不做网页端编辑(录入只靠 CC)
- 不做登录 / 多用户

## 11. 实现阶段

1. **数据层**:建 plan.json、log.json;退役两个 md;更新 CLAUDE.md → 验证 CC 仍能正确响应「今天练 X」「报数据」
2. **查看层**:写 index.html 三模块 → 本地打开验证渲染
3. **部署**:noreply 邮箱 + git init + GitHub repo + Pages → 手机访问验证
