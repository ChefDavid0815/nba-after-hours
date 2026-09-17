import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, PLAYER_NAMES_ZH, TEAM_NAMES_ZH, TEAMS, getTeam, playerName, teamName } from '../src/data';

test('all 30 franchises have complete, valid classic lineups', () => {
  assert.equal(TEAMS.length, 30);
  assert.equal(new Set(TEAMS.map(t => t.id)).size, 30);
  assert.equal(TEAMS.filter(t => t.conference === 'East').length, 15);
  assert.equal(TEAMS.filter(t => t.conference === 'West').length, 15);
  for (const team of TEAMS) {
    assert.equal(team.players.length, 5, team.id);
    assert.equal(new Set(team.players.map(p => p.name)).size, 5, team.id);
    for (const color of [team.primary, team.secondary, team.accent]) assert.match(color, /^#[0-9a-f]{6}$/i);
    for (const player of team.players) {
      for (const rating of [player.shooting, player.finishing, player.speed, player.defense]) assert.ok(rating >= 0 && rating <= 100);
      assert.ok(player.height >= 1.6 && player.height <= 2.4);
      assert.ok(player.number >= 0 && player.number <= 99);
      assert.match(player.skin, /^#[0-9a-f]{6}$/i);
    }
  }
});

test('every team, athlete and achievement has Chinese and English display text', () => {
  for (const team of TEAMS) {
    assert.ok(TEAM_NAMES_ZH[team.id]);
    assert.equal(teamName(team, 'zh'), TEAM_NAMES_ZH[team.id]);
    assert.equal(teamName(team, 'en'), `${team.city} ${team.name}`);
    for (const player of team.players) {
      assert.ok(PLAYER_NAMES_ZH[player.name], `missing Chinese name: ${player.name}`);
      assert.equal(playerName(player, 'en'), player.name);
      assert.match(playerName(player, 'zh'), /[\u4e00-\u9fff]/);
    }
  }
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, ACHIEVEMENTS.length);
  for (const achievement of ACHIEVEMENTS) {
    assert.ok(achievement.name.zh && achievement.name.en && achievement.description.zh && achievement.description.en);
  }
});

test('team lookups tolerate invalid persisted choices and uppercase abbreviations', () => {
  assert.equal(getTeam('invalid').id, 'lal');
  assert.equal(getTeam('GSW').id, 'gsw');
  assert.equal(getTeam('hou').players.find(p => p.name === 'Yao Ming')?.height, 2.29);
});
