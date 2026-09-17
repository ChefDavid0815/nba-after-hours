# 本地进度备份格式

`src/profile.ts` 仅处理本游戏的本地存档，不联网、不上传、不读取其它应用的键。备份是可下载的 UTF-8 JSON 文本，当前格式为 `nba-after-hours.profile`，版本为 `1`，上限为 **1 MiB（1,048,576 字节）**。

## API

```ts
exportProfile(storage?)
// { ok: true, text, summary, warnings } | { ok: false, code }

inspectProfile(text)
// { ok: true, profile, summary } | { ok: false, code }

importProfile(text, storage?)
// { ok: true, summary, reloadRequired: true } | { ok: false, code }
```

`storage` 可省略以使用浏览器 `localStorage`，也可注入实现 `getItem`、`setItem`、`removeItem` 的对象。显式传 `null` 表示不可用。缺少存储或浏览器拒绝访问时返回 `storage_unavailable`，不会将不可用的存储伪装成空白进度。`inspectProfile` 不读取任何存储。

导出读取已持久化的进度。调用方应先完成现有游戏的正常保存，再创建下载。导入成功后必须刷新页面，使主程序的 `save` 引用、教学完成状态和各模块的会话缓存重新读取导入内容；返回值用 `reloadRequired: true` 明确这一点。导入替换这些系统的已保存进度，不合并纪录。

`summary` 含 `games`、`wins`、`achievements`、`historyMatches`、`locale`、`tournamentRound`、`tournamentActive`、`lineupTeams`、`dailyRecords` 和 `tutorialCompleted`，便于 UI 在导入前展示内容。

## 文档结构

顶层严格包含四个字段：

| 字段 | 内容 |
| --- | --- |
| `format` | 固定为 `nba-after-hours.profile` |
| `version` | 整数 `1` |
| `exportedAt` | 标准 ISO 8601 UTC 时间，如 `2026-09-17T12:00:00.000Z` |
| `data` | 下列五个必需部分 |

| `data` 部分 | 对应内容 |
| --- | --- |
| `save` | `SaveData`：中英文、音量等设置；生涯；成就；最近 50 场；累计使用队伍；自由挑战最高分 |
| `tournament` | 完整 16 队、4 轮杯赛及选定阵容，或 `null` |
| `lineups` | `{ version: 1, teams: { 球队ID: [索引, 索引, 索引] } }`；最多 30 队，每队必须是三个互不重复的有效原名单索引 |
| `daily` | `{ version: 1, entries: [...] }`；最多 90 个日期、270 项任务纪录；包含成绩、奖牌、最佳统计、次数与去重标识 |
| `tutorial` | `{ version: 1, completed: boolean, completedAt?: ISO时间 }`，或 `null` |

训练模式选择的球员保存在该队阵容的第一个索引中，也随阵容备份。导出的备用副本不作为额外数据部分出现；导入时会同步生成主进度和杯赛的备用副本。

只访问以下七个键，从不调用 `localStorage.clear()` 或枚举存储：

```text
nba-after-hours.save.v1
nba-after-hours.save.v1.backup
nba-after-hours.tournament.v1
nba-after-hours.tournament.v1.backup
nba-after-hours.lineups.v1
nba-after-hours.daily-challenges.v1
nba-after-hours.tutorial.completed.v1
```

## 校验与故障行为

解析前检查 UTF-8 大小；解析后用有界遍历限制深度为 20、节点数为 50,000，拒绝非有限数字，并在任何层级拒绝 `__proto__`、`constructor`、`prototype`。随后检查格式、版本、必需字段与各部分结构。

复用 `normalizeSave`、`normalizeTournament`、`normalizeLineup`、`normalizeChallengeProgress` 验证具体内容。导入不静默丢弃无效记录：归一化后若字段、球队、阵容或数值发生不允许的变化，整份导入失败。每日奖牌与成绩从最佳统计重新核对，杯赛必须满足每轮参与者、胜者、晋级、比分与最终状态的一致性。旧的本地 v1 生涯存档可以缺少 `playedTeams`，此时从有效历史重建。

主进度或杯赛损坏时，导出可以使用经过验证的对应备用副本，并返回 `save_recovered_from_backup` 或 `tournament_recovered_from_backup` 警告。没有有效备用副本则拒绝导出，不将损坏的生涯静默替换为空白存档。导出过程不修改原存储。

导入先完成所有验证，再读取七个键的原始文本。之后只更新目标值不同的键，并验证写入结果。导入空杯赛会同时移除旧主副本和旧备用副本，避免之后恢复出已经清除的杯赛。

若任意写入、删除或写后核对失败，模块会按相反顺序恢复所有已尝试键，包括“先写入后抛错”的异常存储实现，并保留原始字节及原有的不存在状态。恢复后逐键核对；全部恢复返回 `storage_write_failed`，无法确认完整恢复返回 `rollback_failed`。浏览器的多键 `localStorage` 操作没有事务原子性；持续拒绝写入、浏览器进程突然关闭或其它标签同时写入时，无法保证绝对回滚。模块不会虚报恢复成功。

## 错误码

`PROFILE_ERROR_MESSAGES[code].zh/en` 提供直接可用的双语消息。返回值只包含稳定错误码，不抛出带原始存档或底层异常内容的错误。

| 码 | 含义 |
| --- | --- |
| `too_large` | 超过 1 MiB |
| `invalid_json` | JSON 无法解析或为空 |
| `unsafe_keys` | 存在危险对象键 |
| `unsupported_format` / `unsupported_version` | 其它文件格式或不支持版本 |
| `invalid_structure` | 顶层、字段、大小或嵌套结构无效 |
| `invalid_save` / `invalid_tournament` / `invalid_lineups` / `invalid_daily` / `invalid_tutorial` | 对应数据部分无效 |
| `storage_unavailable` / `storage_read_failed` | 存储不可用或无法读取，未写入 |
| `storage_write_failed` | 写入失败，已核实恢复原值 |
| `rollback_failed` | 持续存储故障，无法核实完整恢复 |

测试命令：`npx tsx --test tests/profile.test.ts`。用例包含完整往返、空记录覆盖、原型键攻击、UTF-8 超限、损坏杯赛、伪造奖牌、逐个写入位置失败、先写后抛、删除失败、静默写入失败、持续故障、存储拒绝访问和备份恢复。
