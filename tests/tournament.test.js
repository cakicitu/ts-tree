import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBracket, createTournament, selectWinner, ValidationError } from '../shared/tournament.js';

const names = count => Array.from({ length: count }, (_, i) => `Spieler ${i + 1}`);
function finish(state) {
  for (let round = 0; round < buildBracket(state).rounds.length; round++) {
    for (const match of buildBracket(state).rounds[round]) {
      if (!match.auto) state = selectWinner(state, match.id, match.slots[0].player.id);
    }
  }
  return state;
}

for (let count = 4; count <= 16; count++) {
  test(`${count} Spieler: jeder Spieler genau einmal, Freilose und vollständiger Turnierablauf`, () => {
    let state = createTournament(names(count));
    let bracket = buildBracket(state);
    const participants = bracket.rounds[0].flatMap(match => match.slots.map(slot => slot.player?.id).filter(Boolean));
    assert.equal(new Set(participants).size, count);
    assert.equal(participants.length, count);
    assert.equal(bracket.rounds[0].filter(match => match.auto).length, bracket.size - count);
    assert.ok(bracket.rounds[0].every(match => match.slots.some(slot => slot.player)));
    for (const round of bracket.rounds.slice(1)) {
      for (const match of round) {
        assert.equal(match.auto, false, 'Unfertige Vorrunde darf kein Freilos sein');
        assert.equal(match.winner, null);
      }
    }
    state = finish(state);
    bracket = buildBracket(state);
    assert.equal(Object.keys(state.results).length, count - 1);
    assert.equal(bracket.champion.id, 'p1');
    assert.ok(bracket.rounds.flat().every(match => match.resolved));
  });
}

test('Siegerwechsel löscht nur abhängige Ergebnisse bis ins Finale', () => {
  const state = finish(createTournament(names(16)));
  const match = buildBracket(state).rounds[0][0];
  const updated = selectWinner(state, match.id, match.slots[1].player.id);
  assert.equal(updated.results['0-0'], match.slots[1].player.id);
  for (const id of ['1-0', '2-0', '3-0']) assert.equal(updated.results[id], undefined);
  for (const id of ['0-1', '1-1', '2-1']) assert.equal(updated.results[id], state.results[id]);
  assert.equal(buildBracket(updated).champion, null);
  assert.equal(Object.keys(state.results).length, 15, 'Ausgangszustand bleibt unverändert');
});

test('Zurücksetzen, wiederholter Klick, ungültiger Spieler und vorzeitiges Ergebnis', () => {
  const state = finish(createTournament(names(8)));
  assert.equal(selectWinner(state, '0-0', state.results['0-0']), state);
  const reset = selectWinner(state, '0-0', null);
  assert.equal(reset.results['0-0'], undefined);
  assert.equal(reset.results['1-0'], undefined);
  assert.equal(reset.results['2-0'], undefined);
  assert.throws(() => selectWinner(reset, '2-0', 'p1'), ValidationError);
  assert.throws(() => selectWinner(reset, '0-0', 'p999'), ValidationError);
  assert.throws(() => selectWinner(reset, 'bad', 'p1'), ValidationError);
  assert.throws(() => selectWinner(createTournament(names(9)), '0-0', 'p1'), ValidationError);
});

test('Namen und Spieleranzahl validieren; gleiche Namen haben getrennte IDs', () => {
  for (const invalid of [null, {}, names(3), names(17), [...names(3), ' '], [...names(3), 'x'.repeat(41)], [...names(3), 12]]) {
    assert.throws(() => createTournament(invalid), ValidationError);
  }
  const state = createTournament(Array(8).fill('  Jörg 🎾  '));
  assert.equal(state.players[0].name, 'Jörg 🎾');
  assert.equal(new Set(state.players.map(player => player.id)).size, 8);
});
