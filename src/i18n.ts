import type { Locale, Team } from './types';

const copy = {
  zh: {
    tutorialTitle: '新手训练营', tutorialStart: '开始教学训练', tutorialReplay: '重温教学训练', tutorialMenuHint: '5 个真实操作任务，从第一步到第一记三分。', tutorialCompleted: '教学已完成',
    tutorialProgress: '第 {n} / 5 课', tutorialMove: '迈出第一步', tutorialMoveHint: '按 WASD 或方向键移动。任意方向累计移动 5 米，找到控球的感觉。',
    tutorialSprint: '加快比赛节奏', tutorialSprintHint: '移动时按住 Shift，累计冲刺 4 米。留意左下角的体力条，松开后会恢复。',
    tutorialShoot: '完成第一次出手', tutorialShootHint: '停稳后按住空格蓄力，再松开投篮。底部投篮条的绿区是理想出手时机。',
    tutorialGreen: '找到绿色节奏', tutorialGreenHint: '靠近篮筐，按住空格约 0.7 秒，在绿区松开并命中一次。没进就再试，球会自动回到手中。',
    tutorialThree: '命中你的第一记三分', tutorialThreeHint: '向远离篮筐的方向移动到三分弧外。停稳，在绿区松开，命中一记三分。',
    tutorialSkip: '结束教学，继续自由练习', tutorialContinue: '继续自由练习', tutorialCollapse: '收起教学说明', tutorialExpand: '展开教学说明',
    tutorialAllDone: '5 / 5 · 全部完成', tutorialComplete: '你的比赛，正式开始', tutorialCompleteHint: '移动、冲刺、出手、绿色命中和三分——全部掌握。继续练习，或按 Esc 返回菜单参加比赛。',
    tutorialDistance: '{n} / {goal} 米', tutorialTryIt: '现在试一试', tutorialWatchShot: '漂亮的出手，等待篮球入网', tutorialPadMove: '手柄：左摇杆', tutorialPadSprint: '手柄：左摇杆 + RT', tutorialPadShoot: '手柄：按住 A，再松开', tutorialTouchMove: '触控：拖动左侧摇杆', tutorialTouchSprint: '触控：拖动摇杆，同时按住「冲刺」', tutorialTouchShoot: '触控：按住「投篮」，在绿区松开', reviewGame: '比赛复盘',
    replayControl: '精彩回放（进球后）', gamepadControls: '手柄操作', controllerNote: '标准手柄按键：A / X / B / Y。单人模式自动使用第一只手柄；双人模式下一只手柄控制玩家 2，两只手柄分别控制双方。', fullscreen: '全屏切换',
    opponentType: '对手控制', computerOpponent: '电脑对手', localOpponent: '本地双人', localMatch: '本地双人对战', playerOne: '玩家 1', playerTwo: '玩家 2', playerOneTeam: '主队 · 玩家 1', playerTwoTeam: '客队 · 玩家 2', localControlsHint: '玩家 1：WASD / 空格 J K / 左 Shift。玩家 2：方向键 / U I O / 右 Shift。可连接两个手柄。', localWinner: '{player} 获胜', localResultDescription: '精彩对决，留给下一场继续。', playerTwoControls: '玩家 2 操作',
    dailyChallenges: '每日挑战', dailyRefresh: '今日限定', freeChallenge: '自由得分挑战', dailyStart: '开始挑战', challengeScore: '挑战积分', target: '目标', nextMedal: '下枚奖牌', medalNone: '继续挑战', medalBronze: '铜牌', medalSilver: '银牌', medalGold: '金牌', personalBest: '刷新个人最佳', dailyComplete: '今日挑战完成', attempts: '次挑战', madeThrees: '记三分', dailyFixed: '固定球星 · 60 秒', dailyScoreHint: '以任务积分评定奖牌',
    gameName: '决胜时刻', gameSubtitle: 'NBA AFTER HOURS', eyebrow: 'THE GAME NEVER SLEEPS',
    coach: '场边指导', coachReleaseNow: '现在松开，完成出手', coachHoldRelease: '继续蓄力，进入绿区再松开', coachChaseLoose: '冲向落点，争抢球权', coachBeatClock: '时间不多，尽快出手', coachBlockShot: '贴近射手，起跳封盖', coachBoxOut: '靠近篮筐，争抢篮板', coachOpenTeammate: '队友出现空位，及时传球', coachCreateSpace: '移动、变向，创造出手空间', coachDriveLane: '推进到前场，寻找突破通道', coachTakeOpenShot: '出现空位，稳住节奏投篮', coachDefendBall: '保持身位，伺机抢断', coachCloseOut: '回防，站到对手与篮筐之间', shotThree: '三分出手',
    roster: '查看阵容', rosterTitle: '打造你的阵容', rosterChoose: '选择 3 名首发球员', rosterChooseSolo: '选择你的训练球员', rosterFull: '5 对 5 全阵容', rosterSelected: '已选择 {n} / {total}', rosterSave: '确认阵容', rosterNeedThree: '请选择 3 名球员上场', rosterChooseHint: '取消一名已选球员，再选择替补。选择顺序决定初始控球人。', selected: '首发', reserve: '替补', shooting: '投射', finishing: '终结', speed: '速度', archetype: '球员风格',
    achievements: '成就收藏', unlocked: '已解锁', locked: '尚未解锁', history: '最近比赛', historyEmpty: '在这里留下你的第一场比赛。', totalPoints: '累计得分', winRate: '胜率', totalAssists: '累计助攻', careerDescription: '每一场努力，都值得被记住。', recordWin: '胜', recordLoss: '负',
    bracket: '冠军赛程', tournament: '冠军征程', tournamentContinue: '继续征程', tournamentSaved: '你有一段未完成的征程', round16: '十六强', quarterfinals: '四分之一决赛', semifinals: '半决赛', finals: '总决赛', awaiting: '待定', nextOpponent: '下一位对手', tournamentComplete: '征程已结束', championTeam: '冠军球队', yourTeam: '你的球队', tournamentFormat: '16 支球队 · 单场淘汰 · 4 轮冠军路', newTournament: '开始新的征程', soloSession: '专属训练场', challengeDuration: '挑战时长', unlimited: '不限时', trainingPlayer: '训练球员', trainingRecord: '训练场记录', heat: '热手', heatHint: '连续得分积累热度，热手减轻体力消耗并提高出手容错。',
    heroTop: '你的主场。', heroBottom: '你的时刻。', heroDescription: '灯光亮起，比赛开始。掌控节奏、创造空间，用最后一记投篮决定胜负。',
    play: '上场比赛', startPractice: '进入训练场', startChallenge: '接受挑战', startChampionship: '开启冠军征程',
    exhibition: '快速比赛', exhibitionDescription: '选择球队，立即开赛', championship: '冠军征程', championshipDescription: '连续闯关，登顶冠军',
    practice: '自由训练', practiceDescription: '无压力练习投篮与运球', challenge: '技巧挑战', challengeDescription: '限时得分，刷新个人纪录',
    home: '主队 · 你来掌控', away: '客队 · 对手', chooseTeam: '选择球队', matchup: '今晚的对决',
    difficulty: '比赛难度', rookie: '新秀', pro: '职业', allstar: '全明星', quarterLength: '每节时间', minute: '分钟', seconds: '秒',
    format: '场上阵容', threeOnThree: '3 对 3', fiveOnFive: '5 对 5', offense: '进攻', defense: '防守', pace: '速度',
    settings: '设置', close: '关闭', language: '语言 / LANGUAGE', sound: '声音', volume: '主音量', music: '背景音乐', sfx: '比赛音效',
    display: '画面', camera: '镜头视角', broadcast: '转播视角', courtside: '场边视角', overhead: '战术视角', quality: '画面质量', high: '高画质', low: '流畅',
    reducedMotion: '减少镜头运动', showControls: '显示操作提示', enabled: '开启', disabled: '关闭',
    pause: '暂停比赛', paused: '暂停', timeout: 'TIME OUT', resume: '继续比赛', restart: '重新开赛', quit: '返回主菜单',
    yourPlayer: '当前控制', stamina: '体力', move: '移动', sprint: '冲刺', shoot: '按住投篮 / 松开出手', pass: '传球', switch: '切换球员',
    steal: '抢断', block: '封盖 / 抢板', crossover: '变向', screen: '呼叫掩护', controls: '操作指南', keyboard: '键盘操作',
    shotTiming: '出手时机', release: '松开出手', perfect: '完美出手', excellent: '出手漂亮', early: '出手过早', late: '出手过晚',
    wideOpen: '空位', open: '轻微干扰', contested: '受到干扰', smothered: '严防死守', shotQuality: '命中机会',
    possession: '控球', quarter: '第 {n} 节', overtime: '加时 {n}', shotClock: '进攻时间', halftime: '中场休息', inbound: '准备发球', intro: '比赛即将开始',
    final: 'FINAL SCORE', victory: '胜利属于你', defeat: '下一场，赢回来', draw: '势均力敌', practiceComplete: '训练完成', challengeComplete: '挑战完成',
    champion: '总冠军', championDescription: '一路闯关，你已登顶。主场为你沸腾。', victoryDescription: '把每一回合，变成你的高光。', defeatDescription: '调整节奏，再次上场。故事还没结束。',
    nextRound: '进入下一轮', rematch: '再来一场', returnMenu: '返回主菜单', round: '第 {n} / {total} 轮', boxscore: '比赛数据',
    player: '球员', points: '得分', rebounds: '篮板', assists: '助攻', steals: '抢断', blocks: '盖帽', fieldGoals: '投篮', threePointers: '三分', turnovers: '失误',
    pointsShort: '分', reboundsShort: '板', assistsShort: '助', fieldGoalRate: '投篮命中率', threePointRate: '三分命中率', teamStats: '球队表现', gameLeader: '本场焦点',
    career: '生涯战绩', games: '场比赛', wins: '胜场', championships: '冠军', bestScore: '最高得分', record: '战绩',
    firstGame: '新篇章，从这一场开始', savedLocally: '进度自动保存在此设备', tip: '上场提示', tipText: '按住空格蓄力，在绿色区间松开。空位与出手时机同样重要。',
    practiceTip: '专属训练场已准备就绪。反复练习出手节奏与突破，找到你的手感。',
    challengeTip: '60 秒内尽可能多得分。每次出手都是刷新纪录的机会。', championshipTip: '赢下每一轮对决，带领你的球队走向冠军。',
    courtReady: '球场已就绪', live: 'LIVE', builtForTheGame: '为热爱，上场。', unofficial: '独立篮球游戏 · 非官方 NBA 产品',
    selectMode: '选择比赛模式', helpTitle: '掌控每一回合', helpSubtitle: '先创造空间，再把握出手。', offenseControls: '进攻', defenseControls: '防守',
    movementControls: '移动与比赛', helpDefense: '贴近持球人再尝试抢断，起跳封盖要把握时机。防守结束后，靠近篮下争抢篮板。',
    helpOffense: '按住空格，再于绿色区域松开。近筐冲刺并投篮可触发上篮或扣篮。善用传球、变向与掩护创造空位。',
    helpPassing: '数字键 1–5 定向传球', best: '个人最佳', loading: '准备球场中', gamepad: '支持手柄', shot: '投篮',
    eventScreen: '队友正在上前掩护', eventScore: '命中！', eventThree: '三分命中！', eventDunk: '强势扣篮！', eventMiss: '未能命中', eventSteal: '抢断成功', eventBlock: '封盖！',
    eventRebound: '拿下篮板', eventPass: '精彩传球', eventCrossover: '变向突破', eventPerfect: '完美出手！', eventTip: '比赛开始',
    eventShotClock: '24 秒违例', eventOutOfBounds: '出界', eventBuzzer: '时间到', eventQuarter: '新的一节', eventGameOver: '全场比赛结束',
    possessionArrow: '当前球权', teamSelectionSame: '请选择两支不同的球队', homeTeam: '主队', awayTeam: '客队',
  },
  en: {
    tutorialTitle: 'TRAINING CAMP', tutorialStart: 'START THE TUTORIAL', tutorialReplay: 'REVISIT TRAINING CAMP', tutorialMenuHint: 'Five real skills. From your first step to your first three.', tutorialCompleted: 'TRAINING COMPLETE',
    tutorialProgress: 'LESSON {n} OF 5', tutorialMove: 'Take your first step.', tutorialMoveHint: 'Move with WASD or the arrow keys. Travel 5 meters in any direction and get a feel for the ball.',
    tutorialSprint: 'Change the pace.', tutorialSprintHint: 'Hold Shift while moving. Sprint for 4 meters. Watch your stamina at the bottom left; release to recover.',
    tutorialShoot: 'Let it fly.', tutorialShootHint: 'Stop, hold SPACE to charge, then release to shoot. The green section of the meter is your ideal release window.',
    tutorialGreen: 'Find your rhythm.', tutorialGreenHint: 'Move close to the basket. Hold SPACE for about 0.7 seconds, release in green, and make one shot. Missed? The ball comes back. Try again.',
    tutorialThree: 'Make your first three.', tutorialThreeHint: 'Move away from the basket, beyond the three-point arc. Stop, release in green, and make a three-pointer.',
    tutorialSkip: 'END TUTORIAL · FREE PRACTICE', tutorialContinue: 'KEEP PRACTICING', tutorialCollapse: 'Collapse tutorial instructions', tutorialExpand: 'Expand tutorial instructions',
    tutorialAllDone: '5 OF 5 · COMPLETE', tutorialComplete: 'Your game starts here.', tutorialCompleteHint: 'Movement, sprinting, shooting, a green make, and a three. All yours. Keep practicing, or press Esc and head to the main menu to play.',
    tutorialDistance: '{n} / {goal} meters', tutorialTryIt: 'YOUR TURN', tutorialWatchShot: 'Great release. Watch it fly.', tutorialPadMove: 'Controller: left stick', tutorialPadSprint: 'Controller: left stick + RT', tutorialPadShoot: 'Controller: hold A, then release', tutorialTouchMove: 'Touch: drag the left joystick', tutorialTouchSprint: 'Touch: drag the stick and hold SPRINT', tutorialTouchShoot: 'Touch: hold SHOOT, release in green', reviewGame: 'SHOT CHART',
    replayControl: 'Instant replay after a basket', gamepadControls: 'CONTROLLER', controllerNote: 'Standard A / X / B / Y layout. In local versus, one controller belongs to Player 2; two controllers are assigned to each player.', fullscreen: 'Toggle fullscreen',
    opponentType: 'OPPONENT', computerOpponent: 'CPU opponent', localOpponent: 'Local 2-player', localMatch: 'LOCAL VERSUS', playerOne: 'PLAYER 1', playerTwo: 'PLAYER 2', playerOneTeam: 'HOME · PLAYER 1', playerTwoTeam: 'AWAY · PLAYER 2', localControlsHint: 'P1: WASD / SPACE J K / LEFT SHIFT. P2: ARROWS / U I O / RIGHT SHIFT. Two controllers supported.', localWinner: '{player} WINS.', localResultDescription: 'A game worth running back.', playerTwoControls: 'PLAYER 2 CONTROLS',
    dailyChallenges: 'DAILY CHALLENGES', dailyRefresh: 'TODAY’S LINEUP', freeChallenge: 'FREESTYLE SCORE CHASE', dailyStart: 'PLAY CHALLENGE', challengeScore: 'CHALLENGE SCORE', target: 'TARGET', nextMedal: 'NEXT MEDAL', medalNone: 'KEEP CHASING', medalBronze: 'BRONZE', medalSilver: 'SILVER', medalGold: 'GOLD', personalBest: 'NEW PERSONAL BEST', dailyComplete: 'DAILY CHALLENGE COMPLETE', attempts: 'ATTEMPTS', madeThrees: 'THREES', dailyFixed: 'FEATURED STAR · 60 SEC', dailyScoreHint: 'Medals are awarded by challenge score',
    gameName: 'AFTER HOURS', gameSubtitle: 'NBA AFTER HOURS', eyebrow: 'THE GAME NEVER SLEEPS',
    coach: 'COURTSIDE COACH', coachReleaseNow: 'Release now. Make it count.', coachHoldRelease: 'Hold. Release in the green zone.', coachChaseLoose: 'Chase the loose ball.', coachBeatClock: 'Time is running out. Get a shot off.', coachBlockShot: 'Jump to contest the shot.', coachBoxOut: 'Get position for the rebound.', coachOpenTeammate: 'Find the open teammate.', coachCreateSpace: 'Move and create your space.', coachDriveLane: 'Advance and attack a lane.', coachTakeOpenShot: 'You are open. Find your release.', coachDefendBall: 'Stay close and time your steal.', coachCloseOut: 'Stay between your man and the basket.', shotThree: 'FOR THREE',
    roster: 'VIEW LINEUP', rosterTitle: 'BUILD YOUR LINEUP.', rosterChoose: 'Choose 3 starters', rosterChooseSolo: 'Choose your training player', rosterFull: 'Full 5-on-5 roster', rosterSelected: '{n} OF {total} SELECTED', rosterSave: 'LOCK IN LINEUP', rosterNeedThree: 'Select 3 players to take the court', rosterChooseHint: 'Deselect a starter to bring in a reserve. Your first pick starts with the ball.', selected: 'STARTER', reserve: 'RESERVE', shooting: 'SHOOTING', finishing: 'FINISHING', speed: 'SPEED', archetype: 'PLAY STYLE',
    achievements: 'TROPHY CABINET', unlocked: 'UNLOCKED', locked: 'LOCKED', history: 'RECENT GAMES', historyEmpty: 'Your first game belongs here.', totalPoints: 'CAREER POINTS', winRate: 'WIN RATE', totalAssists: 'CAREER ASSISTS', careerDescription: 'Every possession adds to your story.', recordWin: 'W', recordLoss: 'L',
    bracket: 'TOURNAMENT BRACKET', tournament: 'TITLE RUN', tournamentContinue: 'CONTINUE RUN', tournamentSaved: 'Your title run is waiting', round16: 'ROUND OF 16', quarterfinals: 'QUARTERFINALS', semifinals: 'SEMIFINALS', finals: 'THE FINALS', awaiting: 'TBD', nextOpponent: 'NEXT OPPONENT', tournamentComplete: 'RUN COMPLETE', championTeam: 'CHAMPIONS', yourTeam: 'YOUR TEAM', tournamentFormat: '16 TEAMS · SINGLE ELIMINATION · 4 ROUNDS TO GLORY', newTournament: 'START A NEW RUN', soloSession: 'YOUR PERSONAL COURT', challengeDuration: 'CHALLENGE TIME', unlimited: 'UNLIMITED', trainingPlayer: 'TRAINING PLAYER', trainingRecord: 'COURT RECORDS', heat: 'HEAT', heatHint: 'Build heat by scoring. A hot hand reduces fatigue and makes release timing more forgiving.',
    heroTop: 'YOUR COURT.', heroBottom: 'YOUR MOMENT.', heroDescription: 'The lights are on. The game is yours. Control the pace, create space, and make the shot that matters.',
    play: 'TAKE THE COURT', startPractice: 'ENTER PRACTICE', startChallenge: 'ACCEPT CHALLENGE', startChampionship: 'CHASE THE TITLE',
    exhibition: 'QUICK PLAY', exhibitionDescription: 'Pick your teams. Play your game.', championship: 'TITLE RUN', championshipDescription: 'Win your way to the championship.',
    practice: 'FREE PRACTICE', practiceDescription: 'Find your rhythm. Refine your game.', challenge: 'SKILL CHALLENGE', challengeDescription: 'Beat the clock. Set a new best.',
    home: 'HOME · YOU CONTROL', away: 'AWAY · YOUR OPPONENT', chooseTeam: 'Select team', matchup: 'TONIGHT’S MATCHUP',
    difficulty: 'DIFFICULTY', rookie: 'Rookie', pro: 'Pro', allstar: 'All-Star', quarterLength: 'QUARTER LENGTH', minute: 'min', seconds: 'sec',
    format: 'LINEUP', threeOnThree: '3 vs 3', fiveOnFive: '5 vs 5', offense: 'OFFENSE', defense: 'DEFENSE', pace: 'PACE',
    settings: 'Settings', close: 'Close', language: 'LANGUAGE / 语言', sound: 'AUDIO', volume: 'Master volume', music: 'Background music', sfx: 'Court sounds',
    display: 'DISPLAY', camera: 'Camera', broadcast: 'Broadcast', courtside: 'Courtside', overhead: 'Tactical', quality: 'Graphics', high: 'High', low: 'Performance',
    reducedMotion: 'Reduce camera motion', showControls: 'Show control hints', enabled: 'On', disabled: 'Off',
    pause: 'Pause game', paused: 'PAUSED', timeout: 'TIME OUT', resume: 'RESUME GAME', restart: 'RESTART GAME', quit: 'MAIN MENU',
    yourPlayer: 'IN CONTROL', stamina: 'STAMINA', move: 'Move', sprint: 'Sprint', shoot: 'Hold to shoot / release', pass: 'Pass', switch: 'Switch player',
    steal: 'Steal', block: 'Block / rebound', crossover: 'Crossover', screen: 'Call screen', controls: 'How to play', keyboard: 'KEYBOARD',
    shotTiming: 'SHOT TIMING', release: 'RELEASE', perfect: 'PERFECT RELEASE', excellent: 'GOOD RELEASE', early: 'EARLY RELEASE', late: 'LATE RELEASE',
    wideOpen: 'WIDE OPEN', open: 'LIGHT CONTEST', contested: 'CONTESTED', smothered: 'HEAVY CONTEST', shotQuality: 'SHOT CHANCE',
    possession: 'POSSESSION', quarter: 'Q{n}', overtime: 'OT{n}', shotClock: 'SHOT CLOCK', halftime: 'HALFTIME', inbound: 'INBOUND', intro: 'TIP-OFF',
    final: 'FINAL SCORE', victory: 'THAT’S YOUR GAME.', defeat: 'RUN IT BACK.', draw: 'EVENLY MATCHED.', practiceComplete: 'PRACTICE COMPLETE', challengeComplete: 'CHALLENGE COMPLETE',
    champion: 'CHAMPIONS.', championDescription: 'Every round. Every challenge. You earned this moment.', victoryDescription: 'You made every possession count.', defeatDescription: 'Reset the rhythm. The next game is yours to write.',
    nextRound: 'NEXT ROUND', rematch: 'RUN IT BACK', returnMenu: 'MAIN MENU', round: 'ROUND {n} OF {total}', boxscore: 'BOX SCORE',
    player: 'PLAYER', points: 'PTS', rebounds: 'REB', assists: 'AST', steals: 'STL', blocks: 'BLK', fieldGoals: 'FG', threePointers: '3PT', turnovers: 'TO',
    pointsShort: 'PTS', reboundsShort: 'REB', assistsShort: 'AST', fieldGoalRate: 'FIELD GOAL %', threePointRate: '3-POINT %', teamStats: 'TEAM STATS', gameLeader: 'PLAYER OF THE GAME',
    career: 'YOUR LEGACY', games: 'GAMES', wins: 'WINS', championships: 'TITLES', bestScore: 'BEST SCORE', record: 'RECORD',
    firstGame: 'Your story starts with this game.', savedLocally: 'Progress saved on this device', tip: 'COURTSIDE TIP', tipText: 'Hold SPACE, then release in the green zone. Space and timing make the difference.',
    practiceTip: 'Your personal court is ready. Work on your release and drives until the game feels natural.',
    challengeTip: 'Score as much as you can in sixty seconds. Every shot is a chance to set a new personal best.', championshipTip: 'Win each round and take your team all the way to the title.',
    courtReady: 'COURT IS READY', live: 'LIVE', builtForTheGame: 'BUILT FOR THE LOVE OF THE GAME.', unofficial: 'Independent basketball game · Not an official NBA product',
    selectMode: 'Choose game mode', helpTitle: 'OWN EVERY POSSESSION.', helpSubtitle: 'Create your space. Find your release.', offenseControls: 'ON OFFENSE', defenseControls: 'ON DEFENSE',
    movementControls: 'MOVEMENT & GAME', helpDefense: 'Get close before reaching for a steal. Time your jump to block shots, then get to the rim for the rebound.',
    helpOffense: 'Hold SPACE and release in the green zone. Sprint toward the basket and shoot to finish with a layup or dunk. Pass, cross over, and call screens to create space.',
    helpPassing: 'Number keys 1–5 to pass to a teammate', best: 'PERSONAL BEST', loading: 'PREPARING THE COURT', gamepad: 'CONTROLLER READY', shot: 'SHOT',
    eventScreen: 'SCREEN CALLED', eventScore: 'BUCKET!', eventThree: 'THREE POINTER!', eventDunk: 'THROW IT DOWN!', eventMiss: 'NO GOOD', eventSteal: 'STEAL!', eventBlock: 'BLOCKED!',
    eventRebound: 'REBOUND', eventPass: 'GREAT PASS', eventCrossover: 'CROSSOVER', eventPerfect: 'PERFECT RELEASE!', eventTip: 'TIP-OFF',
    eventShotClock: 'SHOT CLOCK VIOLATION', eventOutOfBounds: 'OUT OF BOUNDS', eventBuzzer: 'BUZZER', eventQuarter: 'NEW QUARTER', eventGameOver: 'FINAL BUZZER',
    possessionArrow: 'Current possession', teamSelectionSame: 'Choose two different teams', homeTeam: 'Home team', awayTeam: 'Away team',
  },
};
export type TranslationKey = keyof typeof copy.en;
export function t(locale: Locale, key: TranslationKey, vars?: Record<string, string | number>): string {
  let value: string = copy[locale]?.[key] ?? copy.en[key] ?? key;
  if (vars) for (const [name, replacement] of Object.entries(vars)) value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}
const chineseTeams: Record<string, string> = {
  ATL: '亚特兰大老鹰', BOS: '波士顿凯尔特人', BKN: '布鲁克林篮网', BRK: '布鲁克林篮网', CHA: '夏洛特黄蜂', CHI: '芝加哥公牛', CLE: '克利夫兰骑士',
  DAL: '达拉斯独行侠', DEN: '丹佛掘金', DET: '底特律活塞', GSW: '金州勇士', GS: '金州勇士', HOU: '休斯敦火箭', IND: '印第安纳步行者',
  LAC: '洛杉矶快船', LAL: '洛杉矶湖人', MEM: '孟菲斯灰熊', MIA: '迈阿密热火', MIL: '密尔沃基雄鹿', MIN: '明尼苏达森林狼', NOP: '新奥尔良鹈鹕', NO: '新奥尔良鹈鹕',
  NYK: '纽约尼克斯', NY: '纽约尼克斯', OKC: '俄克拉荷马雷霆', ORL: '奥兰多魔术', PHI: '费城 76 人', PHX: '菲尼克斯太阳', PHO: '菲尼克斯太阳',
  POR: '波特兰开拓者', SAC: '萨克拉门托国王', SAS: '圣安东尼奥马刺', SA: '圣安东尼奥马刺', TOR: '多伦多猛龙', UTA: '犹他爵士', UTAH: '犹他爵士', WAS: '华盛顿奇才', WSH: '华盛顿奇才',
};
export function teamName(team: Team, locale: Locale): string {
  return locale === 'zh' ? chineseTeams[team.abbr.toUpperCase()] ?? `${team.city} ${team.name}` : `${team.city} ${team.name}`;
}
export function translateEvent(locale: Locale, text: string, type?: string): string {
  const normalized = text.toLowerCase().replace(/[!！.]/g, '').trim();
  const exact: Record<string, TranslationKey> = {
    'screen called': 'eventScreen', 'perfect release': 'eventPerfect', 'perfect': 'eventPerfect', 'green': 'eventPerfect', 'green release': 'eventPerfect',
    'early': 'early', 'early release': 'early', 'late': 'late', 'late release': 'late', 'good release': 'excellent',
    'shot clock violation': 'eventShotClock', '24 second violation': 'eventShotClock', 'out of bounds': 'eventOutOfBounds',
    'three pointer': 'eventThree', 'three-pointer': 'eventThree', 'three': 'eventThree', '3-pointer': 'eventThree',
    'halftime': 'halftime', 'tip-off': 'eventTip', 'tip off': 'eventTip', 'game over': 'eventGameOver', 'final buzzer': 'eventGameOver',
  };
  if (exact[normalized]) return t(locale, exact[normalized]);
  if (type === 'shot' && /three|3.?point/i.test(text)) return t(locale,'shotThree');
  if (locale === 'en') return text;
  if (/shot.?clock|24.?sec/i.test(text)) return t(locale, 'eventShotClock');
  if (/three|3.?point/i.test(text)) return t(locale, 'eventThree');
  const eventTypes: Record<string, TranslationKey> = {score:'eventScore', dunk:'eventDunk', miss:'eventMiss', steal:'eventSteal', block:'eventBlock', rebound:'eventRebound', pass:'eventPass', crossover:'eventCrossover', perfect:'eventPerfect', tip:'eventTip', buzzer:'eventBuzzer', quarter:'eventQuarter', gameover:'eventGameOver', shot:'shot', whistle:'eventOutOfBounds'};
  if (type && eventTypes[type]) return t(locale, eventTypes[type]);
  for (const [fragment, key] of Object.entries({dunk:'eventDunk', score:'eventScore', bucket:'eventScore', miss:'eventMiss', steal:'eventSteal', block:'eventBlock', rebound:'eventRebound', crossover:'eventCrossover', perfect:'eventPerfect', quarter:'eventQuarter'})) if (normalized.includes(fragment)) return t(locale, key as TranslationKey);
  return text;
}

