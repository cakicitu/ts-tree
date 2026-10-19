import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLeague, buildSchedule, createTournament, setScore, summarize, ValidationError } from '../shared/tournament.js';

const names = count => Array.from({ length: count }, (_, i) => `Spieler ${i + 1}`);

for (let count = 3; count <= 16; count++) {
  test(`Jeder gegen jeden mit ${count} Spielern: jede Paarung genau einmal, niemand doppelt pro Spieltag`, () => {
    const { players } = createTournament(names(count), 'league');
    const rounds = buildSchedule(players);
    assert.equal(rounds.length, count % 2 ? count : count - 1);
    const pairs = rounds.flatMap(round => round.matches.map(match => match.id));
    assert.equal(pairs.length, count * (count - 1) / 2);
    assert.equal(new Set(pairs).size, pairs.length);
    for (const round of rounds) {
      const ids = round.matches.flatMap(match => [match.home.id, match.away.id]);
      if (round.resting) ids.push(round.resting.id);
      assert.equal(new Set(ids).size, count);
      assert.equal(ids.length, count);
      assert.equal(Boolean(round.resting), count % 2 === 1);
      for (const match of round.matches) assert.ok(players.indexOf(match.home) < players.indexOf(match.away));
    }
  });
}

test('Tabelle: 3/1/0 Punkte, Sortierung nach Punkten, Differenz und Treffern, Meister erst am Ende', () => {
  let state = createTournament(['Anna', 'Ben', 'Clara', 'David'], 'league');
  assert.equal(state.format, 'league');
  state = setScore(state, 'p1-p2', [6, 2]);
  state = setScore(state, 'p3-p4', [3, 3]);
  let league = buildLeague(state);
  assert.deepEqual(league.standings.map(row => [row.player.name, row.points, row.diff, row.rank]),
    [['Anna', 3, 4, 1], ['Clara', 1, 0, 2], ['David', 1, 0, 2], ['Ben', 0, -4, 4]]);
  assert.equal(league.champion, null);
  assert.equal(league.completed, 2);
  for (const match of league.rounds.flatMap(round => round.matches)) {
    if (!match.score) state = setScore(state, match.id, match.home.name === 'Anna' ? [1, 0] : [0, 0]);
  }
  league = buildLeague(state);
  assert.equal(league.finished, true);
  assert.equal(league.champion.name, 'Anna');
  const summary = summarize(state);
  assert.equal(summary.total, 6);
  assert.equal(summary.completed, 6);
  state = setScore(state, 'p1-p2', null);
  assert.equal(buildLeague(state).finished, false);
});

test('Gleichstand an der Spitze ergibt keinen Meister', () => {
  let state = createTournament(['A', 'B', 'C'], 'league');
  for (const id of ['p1-p2', 'p1-p3', 'p2-p3']) state = setScore(state, id, [1, 1]);
  const league = buildLeague(state);
  assert.equal(league.finished, true);
  assert.equal(league.champion, null);
  assert.ok(league.standings.every(row => row.rank === 1));
});

test('Ungültige Ergebnisse, Spiele und Spielmodi werden abgelehnt', () => {
  const state = createTournament(names(4), 'league');
  for (const score of [[1], [1, 2, 3], [-1, 0], [1.5, 0], ['1', 0], [1000, 0], 'x']) {
    assert.throws(() => setScore(state, 'p1-p2', score), ValidationError);
  }
  assert.throws(() => setScore(state, 'p1-p9', [1, 0]), ValidationError);
  assert.throws(() => setScore(state, 'p2-p1', [1, 0]), ValidationError);
  assert.throws(() => createTournament(names(2), 'league'), ValidationError);
  assert.throws(() => createTournament(names(3), 'ko'), ValidationError);
  assert.throws(() => createTournament(names(4), 'swiss'), ValidationError);
  assert.equal(summarize({ players: createTournament(names(4)).players, results: {} }).format, 'ko', 'alte Turniere ohne format sind K.o.');
});
