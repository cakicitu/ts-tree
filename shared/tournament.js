export class ValidationError extends Error {}
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 16;

export function createTournament(names) {
  if (!Array.isArray(names) || names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) {
    throw new ValidationError(`Bitte wähle ${MIN_PLAYERS} bis ${MAX_PLAYERS} Spieler.`);
  }
  const players = names.map((name, index) => {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) {
      throw new ValidationError('Jeder Spieler braucht einen Namen mit 1 bis 40 Zeichen.');
    }
    return { id: `p${index + 1}`, name: name.trim() };
  });
  return { players, results: {}, createdAt: new Date().toISOString() };
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
