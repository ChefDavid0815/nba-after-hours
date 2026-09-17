import type { Athlete, Locale, Team } from './types';

/** Curated, cross-era fantasy rosters. Ratings are game tuning, not official NBA ratings. */
const athlete = (name: string, number: number, role: string, shooting: number, finishing: number, speed: number, defense: number, height: number, skin = '#875538', hair: Athlete['hair'] = 'short'): Athlete => ({
  name, shortName: name.split(' ').slice(-1)[0], number, role, shooting, finishing, speed, defense, height, skin, hair,
});
const a = athlete;
const team = (id: string, city: string, name: string, abbr: string, conference: Team['conference'], primary: string, secondary: string, accent: string, arena: string, tagline: string, players: Athlete[]): Team => ({ id, city, name, abbr, conference, primary, secondary, accent, arena, tagline, players });

export const TEAMS: Team[] = [
  team('atl', 'Atlanta', 'Hawks', 'ATL', 'East', '#c8102e', '#111820', '#fdb927', 'Atlanta Arena', 'Above the rim', [
    a('Trae Young', 11, 'PG', 94, 79, 92, 62, 1.85, '#bf8865', 'curly'), a('Joe Johnson', 2, 'SG', 89, 85, 77, 79, 2.01), a('Dominique Wilkins', 21, 'SF', 80, 99, 92, 80, 2.03), a('Bob Pettit', 9, 'PF', 86, 91, 76, 88, 2.06, '#dfb693'), a('Dikembe Mutombo', 55, 'C', 42, 83, 65, 99, 2.18, '#603d2d'),
  ]),
  team('bos', 'Boston', 'Celtics', 'BOS', 'East', '#007a33', '#f5f1e5', '#ba9653', 'Boston Garden', 'Built on banners', [
    a('Bob Cousy', 14, 'PG', 83, 82, 89, 80, 1.85, '#e2bc9b'), a('Paul Pierce', 34, 'SG', 91, 88, 78, 84, 2.01, '#986744'), a('Larry Bird', 33, 'SF', 98, 88, 75, 91, 2.06, '#ebc9a5'), a('Kevin Garnett', 5, 'PF', 81, 90, 83, 98, 2.11, '#75462e', 'bald'), a('Bill Russell', 6, 'C', 51, 89, 87, 99, 2.08, '#865d41'),
  ]),
  team('bkn', 'Brooklyn', 'Nets', 'BKN', 'East', '#18191b', '#ededed', '#858b93', 'Brooklyn Arena', 'The borough brings it', [
    a('Jason Kidd', 5, 'PG', 82, 83, 91, 93, 1.93, '#c99974', 'bald'), a('Vince Carter', 15, 'SG', 89, 98, 94, 80, 1.98, '#936344', 'bald'), a('Julius Erving', 32, 'SF', 78, 99, 93, 88, 2.01, '#784f36', 'curly'), a('Kevin Durant', 7, 'PF', 97, 95, 88, 86, 2.08, '#815236'), a('Brook Lopez', 11, 'C', 84, 86, 61, 88, 2.13, '#d0a580'),
  ]),
  team('cha', 'Charlotte', 'Hornets', 'CHA', 'East', '#00788c', '#1d1160', '#a1d9dd', 'Charlotte Arena', 'Buzz city basketball', [
    a('Kemba Walker', 15, 'PG', 91, 85, 94, 72, 1.83, '#81563c'), a('Dell Curry', 30, 'SG', 94, 72, 76, 71, 1.93, '#b6815e'), a('Glen Rice', 41, 'SF', 95, 83, 79, 77, 2.03, '#8e5b3b'), a('Larry Johnson', 2, 'PF', 80, 95, 87, 83, 1.98, '#704632'), a('Alonzo Mourning', 33, 'C', 52, 91, 79, 98, 2.08, '#805138'),
  ]),
  team('chi', 'Chicago', 'Bulls', 'CHI', 'East', '#ce1141', '#101216', '#ece8df', 'United Center', 'The last dance lives on', [
    a('Derrick Rose', 1, 'PG', 84, 96, 99, 76, 1.88, '#ad7653'), a('Michael Jordan', 23, 'SG', 94, 99, 98, 97, 1.98, '#9a6746', 'bald'), a('Scottie Pippen', 33, 'SF', 83, 91, 93, 98, 2.03, '#986545'), a('Dennis Rodman', 91, 'PF', 43, 79, 85, 98, 2.01, '#98613e'), a('Joakim Noah', 13, 'C', 43, 82, 76, 92, 2.11, '#b68763', 'curly'),
  ]),
  team('cle', 'Cleveland', 'Cavaliers', 'CLE', 'East', '#860038', '#fdbb30', '#152547', 'Cleveland Arena', 'Defend the land', [
    a('Mark Price', 25, 'PG', 96, 79, 85, 74, 1.83, '#e4ba96'), a('Kyrie Irving', 2, 'SG', 93, 96, 93, 71, 1.88, '#97603f'), a('LeBron James', 23, 'SF', 87, 99, 96, 95, 2.06, '#885637'), a('Kevin Love', 0, 'PF', 89, 82, 65, 74, 2.03, '#dfb48f'), a('Brad Daugherty', 43, 'C', 69, 89, 70, 83, 2.16, '#86583c'),
  ]),
  team('dal', 'Dallas', 'Mavericks', 'DAL', 'West', '#00538c', '#c4ced4', '#002b5e', 'Dallas Arena', 'One leg. Endless range.', [
    a('Luka Doncic', 77, 'PG', 94, 94, 80, 72, 2.01, '#dbb190'), a('Jason Terry', 31, 'SG', 92, 79, 85, 74, 1.88, '#835339', 'bald'), a('Michael Finley', 4, 'SF', 89, 89, 88, 81, 2.01, '#845238'), a('Dirk Nowitzki', 41, 'PF', 98, 91, 70, 78, 2.13, '#e2bd94'), a('Tyson Chandler', 6, 'C', 39, 88, 80, 95, 2.16, '#976d4d'),
  ]),
  team('den', 'Denver', 'Nuggets', 'DEN', 'West', '#0e2240', '#fec524', '#8b2131', 'Mile High Arena', 'Basketball at altitude', [
    a('Jamal Murray', 27, 'PG', 92, 88, 85, 76, 1.93, '#b88a65'), a('David Thompson', 33, 'SG', 84, 98, 97, 81, 1.93, '#825238'), a('Alex English', 2, 'SF', 89, 94, 85, 77, 2.01, '#9d6b49'), a('Carmelo Anthony', 15, 'PF', 92, 93, 82, 72, 2.03, '#b57e57'), a('Nikola Jokic', 15, 'C', 90, 97, 66, 81, 2.11, '#e2b995'),
  ]),
  team('det', 'Detroit', 'Pistons', 'DET', 'East', '#c8102e', '#1d42ba', '#bec0c2', 'Motor City Arena', 'Defense has a home', [
    a('Isiah Thomas', 11, 'PG', 85, 91, 96, 90, 1.85, '#8e5b3c'), a('Joe Dumars', 4, 'SG', 91, 82, 85, 96, 1.91, '#86583c'), a('Grant Hill', 33, 'SF', 82, 94, 92, 88, 2.03, '#b9845e'), a('Rasheed Wallace', 30, 'PF', 82, 86, 75, 92, 2.11, '#87583c'), a('Ben Wallace', 3, 'C', 32, 82, 81, 99, 2.06, '#714b34', 'curly'),
  ]),
  team('gsw', 'Golden State', 'Warriors', 'GSW', 'West', '#1d428a', '#ffc72c', '#f0e8d7', 'Bay Arena', 'Range without limits', [
    a('Stephen Curry', 30, 'PG', 99, 89, 93, 79, 1.88, '#c28e68'), a('Klay Thompson', 11, 'SG', 97, 80, 80, 91, 1.98, '#c49a76'), a('Rick Barry', 24, 'SF', 93, 90, 81, 84, 2.01, '#dfb792'), a('Draymond Green', 23, 'PF', 70, 77, 78, 98, 1.98, '#83563c'), a('Wilt Chamberlain', 13, 'C', 62, 99, 90, 96, 2.16, '#895b3e'),
  ]),
  team('hou', 'Houston', 'Rockets', 'HOU', 'West', '#ce1141', '#151719', '#c4ced4', 'Houston Arena', 'Take flight in H-Town', [
    a('Steve Francis', 3, 'PG', 83, 93, 96, 78, 1.91, '#926341'), a('James Harden', 13, 'SG', 96, 94, 84, 74, 1.96, '#916143'), a('Tracy McGrady', 1, 'SF', 94, 97, 93, 85, 2.03, '#93623f'), a('Hakeem Olajuwon', 34, 'PF', 79, 96, 86, 99, 2.13, '#805339'), a('Yao Ming', 11, 'C', 79, 93, 56, 90, 2.29, '#d5ad87'),
  ]),
  team('ind', 'Indiana', 'Pacers', 'IND', 'East', '#002d62', '#fdbb30', '#e6e7e8', 'Indiana Fieldhouse', 'Every possession matters', [
    a('Tyrese Haliburton', 0, 'PG', 93, 81, 89, 76, 1.96, '#bd8c66'), a('Reggie Miller', 31, 'SG', 98, 80, 85, 81, 2.01, '#b28562'), a('Paul George', 24, 'SF', 92, 91, 89, 94, 2.03, '#996947'), a('Jermaine O’Neal', 7, 'PF', 70, 90, 76, 91, 2.11, '#81563c'), a('Rik Smits', 45, 'C', 80, 87, 54, 83, 2.24, '#e1b791'),
  ]),
  team('lac', 'Los Angeles', 'Clippers', 'LAC', 'West', '#c8102e', '#1d428a', '#f3f0e8', 'Los Angeles Harbor Arena', 'Lob city, all night', [
    a('Chris Paul', 3, 'PG', 92, 86, 90, 95, 1.83, '#a1714f'), a('Randy Smith', 9, 'SG', 80, 88, 97, 84, 1.91, '#9e6c49'), a('Kawhi Leonard', 2, 'SF', 94, 94, 87, 99, 2.01, '#966540'), a('Blake Griffin', 32, 'PF', 77, 99, 91, 81, 2.06, '#cd9f7b', 'curly'), a('DeAndre Jordan', 6, 'C', 30, 94, 81, 94, 2.11, '#714b34'),
  ]),
  team('lal', 'Los Angeles', 'Lakers', 'LAL', 'West', '#552583', '#fdb927', '#f8f0df', 'Los Angeles Forum', 'Showtime after hours', [
    a('Magic Johnson', 32, 'PG', 81, 95, 88, 88, 2.06, '#a47450'), a('Kobe Bryant', 24, 'SG', 95, 98, 95, 95, 1.98, '#ac7851', 'bald'), a('James Worthy', 42, 'SF', 76, 97, 90, 87, 2.06, '#8a593c', 'bald'), a('Kareem Abdul-Jabbar', 33, 'PF', 80, 99, 76, 97, 2.18, '#a37551', 'bald'), a('Shaquille O’Neal', 34, 'C', 26, 99, 77, 92, 2.16, '#8b603f', 'bald'),
  ]),
  team('mem', 'Memphis', 'Grizzlies', 'MEM', 'West', '#5d76a9', '#12173f', '#f5b112', 'Memphis Arena', 'Grit. Grind. Repeat.', [
    a('Ja Morant', 12, 'PG', 79, 98, 99, 70, 1.88, '#986943', 'curly'), a('Mike Conley', 11, 'SG', 89, 83, 88, 89, 1.85, '#84583d'), a('Shane Battier', 31, 'SF', 88, 73, 74, 94, 2.03, '#bb8f6a', 'bald'), a('Zach Randolph', 50, 'PF', 76, 93, 55, 79, 2.06, '#895e42', 'bald'), a('Marc Gasol', 33, 'C', 81, 88, 62, 96, 2.16, '#d9b08a'),
  ]),
  team('mia', 'Miami', 'Heat', 'MIA', 'East', '#98002e', '#11151a', '#f9a01b', 'Miami Arena', 'White hot basketball', [
    a('Tim Hardaway', 10, 'PG', 91, 87, 94, 82, 1.83, '#8e6042'), a('Dwyane Wade', 3, 'SG', 82, 99, 97, 94, 1.93, '#94613e'), a('Jimmy Butler', 22, 'SF', 79, 94, 87, 96, 2.01, '#94613f'), a('Chris Bosh', 1, 'PF', 84, 91, 81, 87, 2.11, '#a47653'), a('Alonzo Mourning', 33, 'C', 52, 92, 78, 99, 2.08, '#805138'),
  ]),
  team('mil', 'Milwaukee', 'Bucks', 'MIL', 'East', '#00471b', '#eee1c6', '#0077c0', 'Milwaukee Arena', 'Fear the finish', [
    a('Oscar Robertson', 1, 'PG', 86, 94, 88, 87, 1.96, '#94643f'), a('Sidney Moncrief', 4, 'SG', 80, 90, 90, 98, 1.91, '#8b5b3a'), a('Ray Allen', 34, 'SF', 99, 86, 86, 80, 1.96, '#ab7952', 'bald'), a('Giannis Antetokounmpo', 34, 'PF', 67, 99, 97, 96, 2.11, '#966542'), a('Kareem Abdul-Jabbar', 33, 'C', 79, 99, 80, 97, 2.18, '#a37551', 'curly'),
  ]),
  team('min', 'Minnesota', 'Timberwolves', 'MIN', 'West', '#0c2340', '#236192', '#78be20', 'Minnesota Arena', 'Run with the pack', [
    a('Ricky Rubio', 9, 'PG', 69, 77, 87, 90, 1.91, '#d9ac84'), a('Anthony Edwards', 1, 'SG', 90, 97, 96, 88, 1.93, '#90613f'), a('Wally Szczerbiak', 10, 'SF', 92, 83, 74, 70, 2.01, '#dfb591'), a('Kevin Garnett', 21, 'PF', 83, 93, 86, 98, 2.11, '#75462e', 'bald'), a('Karl-Anthony Towns', 32, 'C', 94, 92, 73, 78, 2.13, '#b4815b'),
  ]),
  team('nop', 'New Orleans', 'Pelicans', 'NOP', 'West', '#0c2340', '#c8102e', '#b4975a', 'New Orleans Arena', 'A different kind of jazz', [
    a('Chris Paul', 3, 'PG', 91, 87, 94, 96, 1.83, '#a1714f'), a('Jrue Holiday', 11, 'SG', 87, 86, 87, 97, 1.93, '#956543'), a('Brandon Ingram', 14, 'SF', 89, 89, 84, 75, 2.03, '#a3704d'), a('Zion Williamson', 1, 'PF', 59, 99, 93, 74, 1.98, '#91613f'), a('Anthony Davis', 23, 'C', 78, 97, 88, 98, 2.08, '#936341'),
  ]),
  team('nyk', 'New York', 'Knicks', 'NYK', 'East', '#006bb6', '#f58426', '#bec0c2', 'Madison Square Garden', 'The city game', [
    a('Walt Frazier', 10, 'PG', 84, 88, 89, 98, 1.93, '#a37351'), a('Earl Monroe', 15, 'SG', 86, 92, 88, 81, 1.91, '#86593b'), a('Carmelo Anthony', 7, 'SF', 94, 94, 79, 73, 2.03, '#b57e57'), a('Willis Reed', 19, 'PF', 74, 93, 76, 94, 2.06, '#9d6c49'), a('Patrick Ewing', 33, 'C', 77, 94, 74, 98, 2.13, '#84563a'),
  ]),
  team('okc', 'Oklahoma City', 'Thunder', 'OKC', 'West', '#007ac1', '#ef3b24', '#fdbb30', 'Oklahoma City Arena', 'Bring the thunder', [
    a('Russell Westbrook', 0, 'PG', 77, 97, 99, 83, 1.91, '#aa7752'), a('Shai Gilgeous-Alexander', 2, 'SG', 90, 97, 91, 91, 1.98, '#956342'), a('Kevin Durant', 35, 'SF', 98, 96, 90, 86, 2.08, '#815236'), a('Serge Ibaka', 9, 'PF', 77, 86, 83, 97, 2.08, '#6e472f'), a('Steven Adams', 12, 'C', 34, 86, 71, 91, 2.11, '#c3956d'),
  ]),
  team('orl', 'Orlando', 'Magic', 'ORL', 'East', '#0077c0', '#171b20', '#c4ced4', 'Orlando Arena', 'Believe in the impossible', [
    a('Penny Hardaway', 1, 'PG', 85, 95, 93, 88, 2.01, '#a47250'), a('Tracy McGrady', 1, 'SG', 95, 98, 95, 86, 2.03, '#93623f'), a('Nick Anderson', 25, 'SF', 88, 85, 84, 82, 1.98, '#916242'), a('Rashard Lewis', 9, 'PF', 94, 83, 77, 74, 2.08, '#ac7752'), a('Dwight Howard', 12, 'C', 28, 97, 87, 99, 2.08, '#926242'),
  ]),
  team('phi', 'Philadelphia', '76ers', 'PHI', 'East', '#006bb6', '#ed174c', '#f2f0e6', 'Philadelphia Arena', 'Legends of the hardwood', [
    a('Allen Iverson', 3, 'PG', 89, 97, 99, 82, 1.83, '#a87652'), a('Hal Greer', 15, 'SG', 90, 86, 88, 85, 1.88, '#a47550'), a('Julius Erving', 6, 'SF', 79, 99, 93, 90, 2.01, '#784f36', 'curly'), a('Charles Barkley', 34, 'PF', 75, 98, 86, 84, 1.98, '#ab7851', 'bald'), a('Moses Malone', 2, 'C', 64, 96, 72, 92, 2.08, '#966342'),
  ]),
  team('phx', 'Phoenix', 'Suns', 'PHX', 'West', '#1d1160', '#e56020', '#f9a01b', 'Phoenix Arena', 'Seven seconds of sunshine', [
    a('Steve Nash', 13, 'PG', 98, 83, 88, 64, 1.91, '#dfb792'), a('Devin Booker', 1, 'SG', 95, 90, 87, 77, 1.96, '#c99b73'), a('Shawn Marion', 31, 'SF', 79, 93, 92, 95, 2.01, '#82563a'), a('Charles Barkley', 34, 'PF', 77, 99, 87, 85, 1.98, '#ab7851', 'bald'), a('Amar’e Stoudemire', 32, 'C', 70, 99, 88, 78, 2.08, '#976441'),
  ]),
  team('por', 'Portland', 'Trail Blazers', 'POR', 'West', '#e03a3e', '#11151a', '#e8e4df', 'Portland Arena', 'Rip city after dark', [
    a('Damian Lillard', 0, 'PG', 98, 90, 91, 68, 1.88, '#a37452'), a('Clyde Drexler', 22, 'SG', 84, 98, 96, 91, 2.01, '#a5724d'), a('Brandon Roy', 7, 'SF', 91, 93, 86, 83, 1.98, '#ad7c55'), a('LaMarcus Aldridge', 12, 'PF', 85, 91, 70, 85, 2.11, '#9b6d4a'), a('Bill Walton', 32, 'C', 72, 91, 78, 98, 2.11, '#e3bb95', 'curly'),
  ]),
  team('sac', 'Sacramento', 'Kings', 'SAC', 'West', '#5a2d81', '#63727a', '#e2e0d9', 'Sacramento Arena', 'Light up the night', [
    a('Mike Bibby', 10, 'PG', 92, 80, 83, 73, 1.88, '#c79a71', 'bald'), a('Mitch Richmond', 2, 'SG', 95, 91, 85, 82, 1.96, '#936340'), a('Peja Stojakovic', 16, 'SF', 98, 78, 71, 74, 2.08, '#d8ad86'), a('Chris Webber', 4, 'PF', 78, 95, 83, 86, 2.08, '#a0714d'), a('DeMarcus Cousins', 15, 'C', 82, 96, 65, 81, 2.08, '#a87751'),
  ]),
  team('sas', 'San Antonio', 'Spurs', 'SAS', 'West', '#202329', '#c4ced4', '#ffffff', 'San Antonio Arena', 'The beautiful game', [
    a('Tony Parker', 9, 'PG', 81, 94, 97, 74, 1.88, '#ba8b66'), a('Manu Ginobili', 20, 'SG', 91, 94, 88, 88, 1.98, '#d2a67d', 'bald'), a('George Gervin', 44, 'SF', 91, 98, 88, 77, 2.01, '#9d6c49'), a('Tim Duncan', 21, 'PF', 75, 97, 73, 99, 2.11, '#ae7f59'), a('David Robinson', 50, 'C', 76, 97, 89, 99, 2.16, '#8b5f40'),
  ]),
  team('tor', 'Toronto', 'Raptors', 'TOR', 'East', '#ce1141', '#16191c', '#b4975a', 'Toronto Arena', 'We the north', [
    a('Kyle Lowry', 7, 'PG', 90, 84, 84, 91, 1.83, '#a16f4d'), a('Vince Carter', 15, 'SG', 92, 99, 96, 80, 1.98, '#936344', 'bald'), a('DeMar DeRozan', 10, 'SF', 84, 96, 90, 73, 1.98, '#956240'), a('Pascal Siakam', 43, 'PF', 79, 94, 89, 88, 2.03, '#6e472f'), a('Chris Bosh', 4, 'C', 80, 94, 85, 87, 2.11, '#a47653'),
  ]),
  team('uta', 'Utah', 'Jazz', 'UTA', 'West', '#002b5c', '#f9a01b', '#00471b', 'Salt Lake Arena', 'A perfect pick and roll', [
    a('John Stockton', 12, 'PG', 94, 79, 85, 96, 1.85, '#dcb28c'), a('Donovan Mitchell', 45, 'SG', 92, 94, 95, 80, 1.85, '#9b6b46'), a('Andrei Kirilenko', 47, 'SF', 75, 85, 85, 98, 2.06, '#e1b895'), a('Karl Malone', 32, 'PF', 81, 99, 83, 93, 2.06, '#a2714f', 'bald'), a('Rudy Gobert', 27, 'C', 25, 88, 73, 99, 2.16, '#b58a65'),
  ]),
  team('was', 'Washington', 'Wizards', 'WAS', 'East', '#002b5c', '#e31837', '#c4ced4', 'Washington Arena', 'Capital city classics', [
    a('John Wall', 2, 'PG', 77, 94, 99, 88, 1.93, '#a06d49'), a('Gilbert Arenas', 0, 'SG', 94, 90, 91, 71, 1.93, '#a5724d'), a('Bradley Beal', 3, 'SF', 93, 89, 85, 74, 1.93, '#b98760'), a('Elvin Hayes', 11, 'PF', 78, 95, 78, 94, 2.06, '#9b6d4a'), a('Wes Unseld', 41, 'C', 57, 88, 65, 95, 2.01, '#85583c', 'curly'),
  ]),
];

export const TEAM_NAMES_ZH: Record<string, string> = {
  atl:'亚特兰大老鹰', bos:'波士顿凯尔特人', bkn:'布鲁克林篮网', cha:'夏洛特黄蜂', chi:'芝加哥公牛', cle:'克利夫兰骑士', dal:'达拉斯独行侠', den:'丹佛掘金', det:'底特律活塞', gsw:'金州勇士', hou:'休斯敦火箭', ind:'印第安纳步行者', lac:'洛杉矶快船', lal:'洛杉矶湖人', mem:'孟菲斯灰熊', mia:'迈阿密热火', mil:'密尔沃基雄鹿', min:'明尼苏达森林狼', nop:'新奥尔良鹈鹕', nyk:'纽约尼克斯', okc:'俄克拉荷马城雷霆', orl:'奥兰多魔术', phi:'费城76人', phx:'菲尼克斯太阳', por:'波特兰开拓者', sac:'萨克拉门托国王', sas:'圣安东尼奥马刺', tor:'多伦多猛龙', uta:'犹他爵士', was:'华盛顿奇才',
};

export function getTeam(id: string): Team {
  return TEAMS.find(t => t.id === id.toLowerCase()) ?? TEAMS.find(t => t.id === 'lal')!;
}
export function teamName(teamOrId: Team | string, locale: Locale = 'en'): string {
  const t = typeof teamOrId === 'string' ? getTeam(teamOrId) : teamOrId;
  return locale === 'zh' ? TEAM_NAMES_ZH[t.id] ?? `${t.city} ${t.name}` : `${t.city} ${t.name}`;
}

export interface Achievement {
  id: string;
  icon: string;
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  target: number;
}
export const ACHIEVEMENTS: Achievement[] = [
  {id:'first_win',icon:'★',name:{zh:'开门红',en:'First of Many'},description:{zh:'赢得第一场比赛。',en:'Win your first game.'},target:1},
  {id:'ten_wins',icon:'◆',name:{zh:'十胜俱乐部',en:'Double Figures'},description:{zh:'生涯累计取得10场胜利。',en:'Win 10 career games.'},target:10},
  {id:'century_points',icon:'●',name:{zh:'百分里程碑',en:'Century Club'},description:{zh:'生涯累计得到100分。',en:'Score 100 career points.'},target:100},
  {id:'thirty_points',icon:'🔥',name:{zh:'火力全开',en:'On Fire'},description:{zh:'单场全队得到30分。',en:'Score 30 team points in one game.'},target:30},
  {id:'sharpshooter',icon:'◎',name:{zh:'神射手',en:'From Downtown'},description:{zh:'生涯累计命中25个三分球。',en:'Make 25 career three-pointers.'},target:25},
  {id:'playmaker',icon:'↗',name:{zh:'球场指挥官',en:'Floor General'},description:{zh:'生涯累计送出25次助攻。',en:'Record 25 career assists.'},target:25},
  {id:'pickpocket',icon:'✦',name:{zh:'抢断大师',en:'Quick Hands'},description:{zh:'生涯累计完成10次抢断。',en:'Record 10 career steals.'},target:10},
  {id:'allstar_win',icon:'✪',name:{zh:'全明星之夜',en:'All-Star Night'},description:{zh:'在全明星难度下赢得比赛。',en:'Win a game on All-Star difficulty.'},target:1},
  {id:'world_tour',icon:'◉',name:{zh:'联盟巡礼',en:'Around the League'},description:{zh:'使用10支不同球队完成比赛。',en:'Complete games with 10 different teams.'},target:10},
  {id:'clean_game',icon:'◇',name:{zh:'完美执行',en:'Clean Sheet'},description:{zh:'全队零失误赢得一场比赛。',en:'Win a game without a team turnover.'},target:1},
  {id:'champion',icon:'🏆',name:{zh:'捧杯时刻',en:'Raise the Banner'},description:{zh:'赢得一次冠军之路锦标赛。',en:'Win a Championship Run.'},target:1},
];

/** The historical inspiration is documented at https://www.nba.com/archive-75. */
export const ROSTER_NOTE: Record<Locale, string> = {
  zh: '跨时代经典梦幻阵容 · 含球队前身历史 · 能力值为本游戏原创设定',
  en: 'Cross-era franchise legends, including ABA heritage · Original gameplay ratings',
};

export const PLAYER_NAMES_ZH: Record<string, string> = {
  'Trae Young':'特雷·杨', 'Joe Johnson':'乔·约翰逊', 'Dominique Wilkins':'多米尼克·威尔金斯', 'Bob Pettit':'鲍勃·佩蒂特', 'Dikembe Mutombo':'迪肯贝·穆托姆博',
  'Bob Cousy':'鲍勃·库西', 'Paul Pierce':'保罗·皮尔斯', 'Larry Bird':'拉里·伯德', 'Kevin Garnett':'凯文·加内特', 'Bill Russell':'比尔·拉塞尔',
  'Jason Kidd':'贾森·基德', 'Vince Carter':'文斯·卡特', 'Julius Erving':'朱利叶斯·欧文', 'Kevin Durant':'凯文·杜兰特', 'Brook Lopez':'布鲁克·洛佩斯',
  'Kemba Walker':'肯巴·沃克', 'Dell Curry':'戴尔·库里', 'Glen Rice':'格伦·莱斯', 'Larry Johnson':'拉里·约翰逊', 'Alonzo Mourning':'阿朗佐·莫宁',
  'Derrick Rose':'德里克·罗斯', 'Michael Jordan':'迈克尔·乔丹', 'Scottie Pippen':'斯科蒂·皮蓬', 'Dennis Rodman':'丹尼斯·罗德曼', 'Joakim Noah':'乔金·诺阿',
  'Mark Price':'马克·普莱斯', 'Kyrie Irving':'凯里·欧文', 'LeBron James':'勒布朗·詹姆斯', 'Kevin Love':'凯文·乐福', 'Brad Daugherty':'布拉德·多尔蒂',
  'Luka Doncic':'卢卡·东契奇', 'Jason Terry':'贾森·特里', 'Michael Finley':'迈克尔·芬利', 'Dirk Nowitzki':'德克·诺维茨基', 'Tyson Chandler':'泰森·钱德勒',
  'Jamal Murray':'贾马尔·穆雷', 'David Thompson':'大卫·汤普森', 'Alex English':'阿历克斯·英格利什', 'Carmelo Anthony':'卡梅隆·安东尼', 'Nikola Jokic':'尼古拉·约基奇',
  'Isiah Thomas':'伊赛亚·托马斯', 'Joe Dumars':'乔·杜马斯', 'Grant Hill':'格兰特·希尔', 'Rasheed Wallace':'拉希德·华莱士', 'Ben Wallace':'本·华莱士',
  'Stephen Curry':'斯蒂芬·库里', 'Klay Thompson':'克莱·汤普森', 'Rick Barry':'里克·巴里', 'Draymond Green':'德雷蒙德·格林', 'Wilt Chamberlain':'威尔特·张伯伦',
  'Steve Francis':'史蒂夫·弗朗西斯', 'James Harden':'詹姆斯·哈登', 'Tracy McGrady':'特雷西·麦克格雷迪', 'Hakeem Olajuwon':'哈基姆·奥拉朱旺', 'Yao Ming':'姚明',
  'Tyrese Haliburton':'泰瑞斯·哈利伯顿', 'Reggie Miller':'雷吉·米勒', 'Paul George':'保罗·乔治', 'Jermaine O’Neal':'杰梅因·奥尼尔', 'Rik Smits':'里克·施密茨',
  'Chris Paul':'克里斯·保罗', 'Randy Smith':'兰迪·史密斯', 'Kawhi Leonard':'科怀·伦纳德', 'Blake Griffin':'布雷克·格里芬', 'DeAndre Jordan':'德安德烈·乔丹',
  'Magic Johnson':'魔术师约翰逊', 'Kobe Bryant':'科比·布莱恩特', 'James Worthy':'詹姆斯·沃西', 'Kareem Abdul-Jabbar':'卡里姆·阿卜杜尔-贾巴尔', 'Shaquille O’Neal':'沙奎尔·奥尼尔',
  'Ja Morant':'贾·莫兰特', 'Mike Conley':'迈克·康利', 'Shane Battier':'肖恩·巴蒂尔', 'Zach Randolph':'扎克·兰多夫', 'Marc Gasol':'马克·加索尔',
  'Tim Hardaway':'蒂姆·哈达威', 'Dwyane Wade':'德维恩·韦德', 'Jimmy Butler':'吉米·巴特勒', 'Chris Bosh':'克里斯·波什',
  'Oscar Robertson':'奥斯卡·罗伯特森', 'Sidney Moncrief':'西德尼·蒙克利夫', 'Ray Allen':'雷·阿伦', 'Giannis Antetokounmpo':'扬尼斯·阿德托昆博',
  'Ricky Rubio':'里基·卢比奥', 'Anthony Edwards':'安东尼·爱德华兹', 'Wally Szczerbiak':'沃利·斯泽比亚克', 'Karl-Anthony Towns':'卡尔-安东尼·唐斯',
  'Jrue Holiday':'朱·霍勒迪', 'Brandon Ingram':'布兰登·英格拉姆', 'Zion Williamson':'锡安·威廉森', 'Anthony Davis':'安东尼·戴维斯',
  'Walt Frazier':'沃尔特·弗雷泽', 'Earl Monroe':'厄尔·门罗', 'Willis Reed':'威利斯·里德', 'Patrick Ewing':'帕特里克·尤因',
  'Russell Westbrook':'拉塞尔·威斯布鲁克', 'Shai Gilgeous-Alexander':'谢伊·吉尔杰斯-亚历山大', 'Serge Ibaka':'塞尔吉·伊巴卡', 'Steven Adams':'史蒂文·亚当斯',
  'Penny Hardaway':'便士哈达威', 'Nick Anderson':'尼克·安德森', 'Rashard Lewis':'拉沙德·刘易斯', 'Dwight Howard':'德怀特·霍华德',
  'Allen Iverson':'阿伦·艾弗森', 'Hal Greer':'哈尔·格里尔', 'Charles Barkley':'查尔斯·巴克利', 'Moses Malone':'摩西·马龙',
  'Steve Nash':'史蒂夫·纳什', 'Devin Booker':'德文·布克', 'Shawn Marion':'肖恩·马里昂', 'Amar’e Stoudemire':'阿玛雷·斯塔德迈尔',
  'Damian Lillard':'达米安·利拉德', 'Clyde Drexler':'克莱德·德雷克斯勒', 'Brandon Roy':'布兰登·罗伊', 'LaMarcus Aldridge':'拉马库斯·阿尔德里奇', 'Bill Walton':'比尔·沃顿',
  'Mike Bibby':'迈克·毕比', 'Mitch Richmond':'米奇·里奇蒙德', 'Peja Stojakovic':'佩贾·斯托贾科维奇', 'Chris Webber':'克里斯·韦伯', 'DeMarcus Cousins':'德马库斯·考辛斯',
  'Tony Parker':'托尼·帕克', 'Manu Ginobili':'马努·吉诺比利', 'George Gervin':'乔治·格文', 'Tim Duncan':'蒂姆·邓肯', 'David Robinson':'大卫·罗宾逊',
  'Kyle Lowry':'凯尔·洛瑞', 'DeMar DeRozan':'德马尔·德罗赞', 'Pascal Siakam':'帕斯卡尔·西亚卡姆',
  'John Stockton':'约翰·斯托克顿', 'Donovan Mitchell':'多诺万·米切尔', 'Andrei Kirilenko':'安德烈·基里连科', 'Karl Malone':'卡尔·马龙', 'Rudy Gobert':'鲁迪·戈贝尔',
  'John Wall':'约翰·沃尔', 'Gilbert Arenas':'吉尔伯特·阿里纳斯', 'Bradley Beal':'布拉德利·比尔', 'Elvin Hayes':'埃尔文·海耶斯', 'Wes Unseld':'韦斯·昂塞尔德',
};

export function playerName(playerOrName: Athlete | string, locale: Locale = 'en'): string {
  const name = typeof playerOrName === 'string' ? playerOrName : playerOrName.name;
  return locale === 'zh' ? PLAYER_NAMES_ZH[name] ?? name : name;
}
