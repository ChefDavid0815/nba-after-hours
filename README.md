# NBA AFTER HOURS / 决胜时刻

A local-first 3D arcade basketball game. / 本地运行的 3D 街机篮球游戏。

## 开始游戏 / Play

Windows 桌面版：双击 **release\NBA After Hours.exe**。不需要安装 Node.js，不需要联网。桌面版存档位于程序旁的 `userdata` 文件夹。

浏览器版：双击 **Start Game.cmd**，浏览器会打开游戏。运行期间保留启动窗口。

For the standalone Windows game, run **release\NBA After Hours.exe**. No Node.js installation or internet connection is needed. Portable saves live in the adjacent `userdata` folder.

For the browser edition, double-click **Start Game.cmd** and keep the launcher window open.

The browser launcher requires Node.js 22 or newer and a browser with WebGL 2 / hardware acceleration.

## 游戏内容 / Game modes

- **快速比赛 / Exhibition:** 3v3 or 5v5, three AI difficulties, four quarters, overtime, or local two-player competition.
- **冠军之路 / Championship:** a 16-team, four-round tournament with a real bracket and saved continuation between rounds.
- **自由训练 / Practice:** choose a classic player and shoot without a timer. The optional training camp teaches movement, sprinting, shooting, perfect releases, and three-pointers through actual play.
- **技巧挑战 / Challenges:** free 60-second scoring sessions plus three seeded daily challenges with bronze, silver, and gold goals.
- **比赛复盘 / Match review:** actual shot locations, makes/misses/blocks, player filters, quarter scores, biggest leads, and scoring runs.
- **精彩回放 / Replay:** press R after a basket for a slow-motion replay. The live game clock pauses during playback.
- **中途续玩 / Resume:** exhibition and championship matches save periodically and when paused. Continue the latest unfinished match from the menu, preserving the clock, possession, stats, and shot chart.
- **备份与恢复 / Backup:** export and import long-term progress from Settings. JSON backups exclude the in-progress match snapshot and instant replay buffer.

30 支球队可选，每队有 5 位跨时代经典球员；3v3 支持自选阵容。设置、战绩、成就、杯赛和每日挑战纪录保存在本机。

Choose from 30 franchises with five classic players per team. Customize your trio for 3v3. Progress and settings stay on your computer.

开发模式 / Development:

```powershell
cd 'E:\NBA Game'
npm install
npm run dev
```

构建和测试 / Build and test:

```powershell
npm test
npm run build
node server.mjs
```

## 操作 / Controls

| Action / 动作 | Keyboard / 键盘 | Controller / 手柄 |
| --- | --- | --- |
| Move / 移动 | WASD / Arrow keys | Left stick |
| Sprint / 冲刺 | Shift | RT / R2 |
| Shoot, release in green / 按住投篮、绿色区间松开 | Space | A / Cross |
| Pass / 传球 | J | X / Square |
| Crossover / 突破 | K | B / Circle |
| Call screen / 呼叫挡拆 | L | Y / Triangle |
| Block (defense) / 盖帽 | Space | A / Cross |
| Steal (defense) / 抢断 | K | B / Circle |
| Switch defender / 切换防守球员 | J / Tab | X / Square / LB |
| Direct pass / 指定传球 | 1–5 | — |
| Pause / 暂停 | Esc / P | Start |
| Instant replay / 精彩回放 | R | View / Select |
| Camera / 镜头 | C | — |
| Mute / 静音 | M | — |
| Full screen / 全屏 | F | — |

双人对战 P2 / Player two: **方向键 / Arrows** 移动，**U** 投篮/盖帽，**I** 传球/切人，**O** 突破/抢断，**右 Shift** 冲刺，**H** 掩护，**Y** 切换球员。数字小键盘 1/2/3/5/0 也可使用。只有一个手柄时分配给 P2；两个手柄时分别控制 P1/P2。

In local multiplayer, one connected controller belongs to P2 and the keyboard remains available to P1. With two controllers, each player receives one. Touch devices display a joystick and localized action buttons.

按住投篮约 **0.70 秒**，在绿色区间松开。空位、体力、球员能力和防守干扰都会影响命中；完美出手也需要合理选择机会。进攻按 L 呼叫掩护，绕过掩护者后观察顺下或外弹队友。

Hold shoot for about **0.70 seconds** and release in the green window. Spacing, stamina, player ratings, and defense affect the shot. Call a screen with L, turn the corner, and watch the screener roll or pop.

The **中文 / EN** control switches language at any time. Settings, records, and achievements are stored locally in the browser.

点击 **中文 / EN** 随时切换语言。设置、纪录和成就保存在本机浏览器。

## About the roster / 阵容说明

30 NBA franchises with curated cross-era fantasy lineups. Player ratings are designed for this game and are not official NBA ratings. The lineups do not represent current-season rosters.

30 支 NBA 球队，搭配跨时代经典阵容。球员能力值用于游戏平衡，不是官方评级；阵容不代表当季现役名单。

This is an unofficial fan-made game, unaffiliated with the NBA or its teams. Team and player names belong to their respective owners.

## Technical design

- TypeScript, Vite, and Three.js; no account, backend service, or API key.
- Seeded, browser-independent basketball simulation with automated rule tests.
- Procedural arena, players, basketball, uniforms, and Web Audio sound effects.
- Keyboard, standard controller, and touch input.
- Game assets are produced locally; gameplay does not require external CDNs.

Build progress and validation are recorded in `docs/BUILD_LOG.md`.

## 验证与打包 / Verification and packaging

```powershell
npm test
npm run test:e2e      # Requires the dev server on port 5173 and a Chromium installation
node scripts/playtest.mjs  # Runs real keyboard decisions against the built server on port 28024
node scripts/electron-smoke.mjs
npm run package:win
```

The browser tests use the locally installed agent-browser Chromium, or the executable supplied by `NBA_CHROME`. To install a compatible browser, run `npx agent-browser install`. A fresh Electron installation may require `node node_modules/electron/install.js` before desktop packaging.

This is an arcade basketball game: it models shot clocks, two-/three-point shooting, overtime, possessions, passes, rebounds, steals, and blocks. It does not attempt to reproduce every NBA officiating rule.
