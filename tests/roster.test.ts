import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAMS, getTeam } from '../src/data';
import { LINEUP_KEY, PLAYER_STYLES, THREE_ON_THREE_LINEUPS, getLineup, lineupRating, loadLineup, normalizeLineup, playerStyle, saveLineup } from '../src/roster';

test('all thirty teams have a complete signature trio drawn from their five-person roster', () => {
  assert.equal(Object.keys(THREE_ON_THREE_LINEUPS).length, 30);
  for (const team of TEAMS) {
    const indices = THREE_ON_THREE_LINEUPS[team.id];
    assert.equal(indices.length, 3); assert.equal(new Set(indices).size, 3);
    assert.ok(indices.every(index => index >= 0 && index < 5));
    const trio = getLineup(team);
    assert.deepEqual(trio.players.map(player => player.name), indices.map(index => team.players[index].name));
    assert.equal(team.players.length, 5);
  }
});

test('signature lineups include iconic interior stars omitted by simply taking the first three', () => {
  const has = (team: string, player: string) => assert.ok(getLineup(getTeam(team)).players.some(athlete => athlete.name === player));
  has('hou', 'Yao Ming'); has('den', 'Nikola Jokic'); has('sas', 'Tim Duncan');
  has('lal', 'Shaquille O’Neal'); has('dal', 'Dirk Nowitzki'); has('bos', 'Bill Russell'); has('gsw', 'Wilt Chamberlain');
  assert.equal(getLineup(getTeam('chi')).players[0].name, 'Michael Jordan');
});

test('custom selections preserve order, reject duplicates and recover invalid choices', () => {
  const team = getTeam('lal');
  assert.deepEqual(normalizeLineup(team, [4, 3, 2]), [4, 3, 2]);
  assert.deepEqual(normalizeLineup(team, [4, 4, -1, NaN, 88, 1.5]), [4, 0, 1]);
  assert.deepEqual(normalizeLineup(team, []), [0, 1, 4]);
  assert.deepEqual(normalizeLineup(team, [1, 0, 3, 4, 2]), [1, 0, 3]);
  assert.equal(getLineup({ ...team, players: [] }).players.length, 3);
  assert.equal(getLineup(getLineup(team)).players.length, 3);
});

test('roster copies do not mutate shared player or team data', () => {
  const team = getTeam('lal'); const originalName = team.players[0].name;
  const lineup = getLineup(team);
  lineup.name = 'Modified'; lineup.players[0].name = 'Modified'; lineup.players.reverse();
  assert.equal(team.name, 'Lakers'); assert.equal(team.players[0].name, originalName); assert.equal(team.players.length, 5);
});

test('lineup ratings reflect the selected players and remain bounded', () => {
  for (const team of TEAMS) {
    const lineup = getLineup(team); const rating = lineupRating(lineup);
    assert.equal(rating.shooting, Math.round(lineup.players.reduce((total, player) => total + player.shooting, 0) / 3));
    assert.ok(Object.values(rating).every(value => Number.isFinite(value) && value >= 0 && value <= 100));
  }
  assert.ok(Number.isFinite(lineupRating({ ...getTeam('lal'), players: [] }).overall));
});

test('all player personalities are bilingual, immutable and have safe gameplay tendencies', () => {
  for (const team of TEAMS) for (const player of team.players) {
    const style = playerStyle(player);
    assert.ok(style.name.zh && style.name.en && style.description.zh && style.description.en);
    assert.ok(Object.isFrozen(style) && Object.isFrozen(style.name));
    for (const value of [style.driveBias, style.passBias, style.threeBias, style.paintPresence]) assert.ok(value >= 0 && value <= 1);
    assert.ok(style.preferredDistance >= 0 && style.preferredDistance <= 8);
    assert.ok(style.releaseMultiplier > 0 && style.releaseMultiplier < 2);
  }
  assert.equal(playerStyle(getTeam('gsw').players[0]), PLAYER_STYLES.sharpshooter);
  assert.equal(playerStyle(getTeam('phx').players[0]), PLAYER_STYLES.playmaker);
  assert.equal(playerStyle(getTeam('lal').players[4]), PLAYER_STYLES.post_scorer);
  assert.equal(playerStyle(getTeam('den').players[4]).id, 'post_scorer');
  assert.ok(playerStyle(getTeam('den').players[4]).passBias > playerStyle(getTeam('lal').players[4]).passBias);
  assert.ok(playerStyle(getTeam('bos').players[2]).threeBias > playerStyle(getTeam('chi').players[3]).threeBias);
  assert.equal(playerStyle(getTeam('mem').players[0]), PLAYER_STYLES.slasher);
});

test('per-team preferences persist safely without sharing arrays or contaminating other teams', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    assert.deepEqual(loadLineup(getTeam('lal')), [0, 1, 4]);
    assert.deepEqual(saveLineup('lal', [4, 3, 1]), [4, 3, 1]);
    assert.deepEqual(loadLineup(getTeam('lal')), [4, 3, 1]);
    assert.deepEqual(loadLineup(getTeam('gsw')), [0, 1, 4]);
    const choices = loadLineup(getTeam('lal')); choices[0] = 0;
    assert.deepEqual(loadLineup(getTeam('lal')), [4, 3, 1]);
    data.set(LINEUP_KEY, JSON.stringify({ version: 1, teams: { lal: [4, 4, 999], gsw: [2, 1, 0], malicious: [1, 2, 3] } }));
    assert.deepEqual(loadLineup(getTeam('lal')), [4, 0, 1]);
    assert.deepEqual(loadLineup(getTeam('gsw')), [2, 1, 0]);
    assert.deepEqual(saveLineup('malicious', [0, 1, 2]), [0, 1, 4]);
    data.set(LINEUP_KEY, '{broken'); assert.deepEqual(loadLineup(getTeam('gsw')), [2, 1, 0]);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    assert.doesNotThrow(() => saveLineup('hou', [4, 2, 1]));
    assert.deepEqual(loadLineup(getTeam('hou')), [4, 2, 1]);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
