export class ValidationError extends Error {}
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 16;
// 'ko' is a knockout bracket, 'league' is round robin (everyone plays everyone once).
export const FORMATS = ['ko', 'league'];
export const MIN_PLAYERS_BY_FORMAT = { ko: MIN_PLAYERS, league: 3 };
export const MAX_SCORE = 999;
export const POINTS = { win: 3, draw: 1, loss: 0 };
// Tournaments created before formats existed have no `format` field and are knockouts.
export const formatOf = tournament => tournament?.format === 'league' ? 'league' : 'ko';

export const MAX_TITLE = 60;

function normalizeTitle(title) {
  if (typeof title !== 'string' || title.trim().length > MAX_TITLE) throw new ValidationError(`Der Turniername darf höchstens ${MAX_TITLE} Zeichen lang sein.`);
  return title.trim();
}

// An empty name removes the title, so the date is shown instead.
export function renameTournament(tournament, title) {
  const { title: _previous, ...rest } = tournament;
  const name = normalizeTitle(title);
  return name ? { ...rest, title: name } : rest;
}

export function createTournament(names, format = 'ko', title = '') {
  if (!FORMATS.includes(format)) throw new ValidationError('Unbekannter Spielmodus.');
  title = normalizeTitle(title);
  const min = MIN_PLAYERS_BY_FORMAT[format];
  if (!Array.isArray(names) || names.length < min || names.length > MAX_PLAYERS) {
    throw new ValidationError(min === 3 ? `Bitte wähle 3 bis ${MAX_PLAYERS} Spieler.` : `Bitte wähle ${MIN_PLAYERS} bis ${MAX_PLAYERS} Spieler.`);
  }
  const players = names.map((name, index) => {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) {
      throw new ValidationError('Jeder Spieler braucht einen Namen mit 1 bis 40 Zeichen.');
    }
    return { id: `p${index + 1}`, name: name.trim() };
  });
  return { ...(title ? { title } : {}), format, players, results: {}, createdAt: new Date().toISOString() };
}

export function seedOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    const nextSize = order.length * 2;
    order = order.flatMap(seed => [seed, nextSize + 1 - seed]);
  }
  return order;
}

export function buildBracket(tournament) {
  const size = 2 ** Math.ceil(Math.log2(tournament.players.length));
  let slots = seedOrder(size).map(seed => ({ player: tournament.players[seed - 1] ?? null, resolved: true }));
  const rounds = [];
  while (slots.length > 1) {
    const roundIndex = rounds.length;
    const matches = [];
    for (let i = 0; i < slots.length; i += 2) {
      const id = `${roundIndex}-${i / 2}`;
      const pair = slots.slice(i, i + 2);
      const ready = pair.every(slot => slot.resolved);
      const participants = pair.map(slot => slot.player).filter(Boolean);
      const auto = ready && participants.length < 2;
      const selected = tournament.results[id];
      const winner = auto ? participants[0] ?? null
        : ready ? participants.find(player => player.id === selected) ?? null : null;
      matches.push({ id, roundIndex, index: i / 2, slots: pair, ready, auto, winner, resolved: auto || Boolean(winner) });
    }
    rounds.push(matches);
    slots = matches.map(match => ({ player: match.winner, resolved: match.resolved }));
  }
  return { rounds, size, champion: rounds.at(-1)[0].winner };
}

export function selectWinner(tournament, matchId, playerId) {
  const bracket = buildBracket(tournament);
  const match = bracket.rounds.flat().find(item => item.id === matchId);
  if (!match || !match.ready || match.auto) throw new ValidationError('Dieses Spiel ist noch nicht bereit.');
  if (playerId !== null && !match.slots.some(slot => slot.player?.id === playerId)) {
    throw new ValidationError('Dieser Spieler gehört nicht zu diesem Spiel.');
  }
  if ((tournament.results[matchId] ?? null) === playerId) return tournament;
  const results = { ...tournament.results };
  if (playerId === null) delete results[matchId];
  else results[matchId] = playerId;
  let index = match.index;
  for (let round = match.roundIndex + 1; round < bracket.rounds.length; round++) {
    index = Math.floor(index / 2);
    delete results[`${round}-${index}`];
  }
  return { ...tournament, results };
}

// Round-robin schedule by the circle method: one player stays put, the others rotate.
// With an odd number of players a placeholder makes one player sit out each round.
export function buildSchedule(players) {
  const ring = players.length % 2 ? [...players, null] : [...players];
  const rounds = [];
  for (let round = 0; round < ring.length - 1; round++) {
    const matches = [];
    let resting = null;
    for (let i = 0; i < ring.length / 2; i++) {
      const [x, y] = [ring[i], ring[ring.length - 1 - i]];
      if (!x || !y) { resting = x || y; continue; }
      // Always listed (and scored) in player order, so a result means the same everywhere.
      const [home, away] = [x, y].sort((a, b) => players.indexOf(a) - players.indexOf(b));
      matches.push({ id: `${home.id}-${away.id}`, round, home, away });
    }
    rounds.push({ index: round, matches, resting });
    ring.splice(1, 0, ring.pop());
  }
  return rounds;
}

export function buildLeague(tournament) {
  const rounds = buildSchedule(tournament.players).map(round => ({
    ...round,
    matches: round.matches.map(match => ({ ...match, score: tournament.results[match.id] ?? null })),
  }));
  const rows = new Map(tournament.players.map((player, index) => [player.id,
    { player, seed: index, played: 0, won: 0, drawn: 0, lost: 0, scored: 0, conceded: 0, points: 0 }]));
  for (const match of rounds.flatMap(round => round.matches)) {
    if (!match.score) continue;
    const sides = [[match.home, match.score[0], match.score[1]], [match.away, match.score[1], match.score[0]]];
    for (const [player, own, other] of sides) {
      const row = rows.get(player.id);
      row.played++; row.scored += own; row.conceded += other;
      if (own > other) { row.won++; row.points += POINTS.win; }
      else if (own === other) { row.drawn++; row.points += POINTS.draw; }
      else { row.lost++; row.points += POINTS.loss; }
    }
  }
  const standings = [...rows.values()]
    .map(row => ({ ...row, diff: row.scored - row.conceded }))
    .sort((a, b) => b.points - a.points || b.diff - a.diff || b.scored - a.scored || a.seed - b.seed);
  standings.forEach((row, index) => {
    const previous = standings[index - 1];
    const tied = previous && previous.points === row.points && previous.diff === row.diff && previous.scored === row.scored;
    row.rank = tied ? previous.rank : index + 1;
  });
  const total = rounds.reduce((sum, round) => sum + round.matches.length, 0);
  const completed = Object.keys(tournament.results).length;
  const finished = completed === total;
  return { rounds, standings, total, completed, champion: finished && standings[0].rank !== standings[1]?.rank ? standings[0].player : null, finished };
}

export function setScore(tournament, matchId, score) {
  const match = buildSchedule(tournament.players).flatMap(round => round.matches).find(item => item.id === matchId);
  if (!match) throw new ValidationError('Dieses Spiel gibt es nicht.');
  const results = { ...tournament.results };
  if (score === null) delete results[matchId];
  else {
    if (!Array.isArray(score) || score.length !== 2 || !score.every(value => Number.isInteger(value) && value >= 0 && value <= MAX_SCORE)) {
      throw new ValidationError(`Ein Ergebnis besteht aus zwei ganzen Zahlen von 0 bis ${MAX_SCORE}.`);
    }
    results[matchId] = score;
  }
  return { ...tournament, results };
}

// Everything the overview needs, whichever format the tournament has.
export function summarize(tournament) {
  if (formatOf(tournament) === 'league') {
    const league = buildLeague(tournament);
    return { format: 'league', league, bracket: null, rounds: league.rounds.length, total: league.total,
      completed: league.completed, champion: league.champion, finished: league.finished };
  }
  const bracket = buildBracket(tournament);
  return { format: 'ko', league: null, bracket, rounds: bracket.rounds.length, total: tournament.players.length - 1,
    completed: Object.keys(tournament.results).length, champion: bracket.champion, finished: Boolean(bracket.champion) };
}
