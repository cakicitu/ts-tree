<script setup>
import { computed } from 'vue';
import Icon from './Icon.vue';
const props = defineProps({ bracket: Object, editing: Boolean, readOnly: Boolean, busy: Boolean, names: Array });
const emit = defineEmits(['name', 'winner']);
const columnWidth = 304;
const cardWidth = 240;
const rowHeight = 144;
const height = computed(() => props.bracket.rounds[0].length * rowHeight + 12);
const width = computed(() => props.bracket.rounds.length * columnWidth - 64);
const top = (round, index) => (index + 0.5) * rowHeight * 2 ** round - 56;
const title = round => ['Finale', 'Halbfinale', 'Viertelfinale', 'Achtelfinale'][props.bracket.rounds.length - round - 1];
const edges = computed(() => props.bracket.rounds.slice(0, -1).flatMap((round, r) => round.map(match => {
  const parent = props.bracket.rounds[r + 1][Math.floor(match.index / 2)];
  const startX = r * columnWidth + cardWidth;
  const startY = top(r, match.index) + 64;
  const endX = (r + 1) * columnWidth;
  const endY = top(r + 1, parent.index) + (match.index % 2 === 0 ? 44 : 84);
  const color = !props.editing && match.winner
    ? parent.winner && parent.winner.id !== match.winner.id ? 'lost' : 'won' : 'pending';
  return { id: match.id, d: `M ${startX} ${startY} H ${startX + 32} V ${endY} H ${endX}`, color };
})));
function state(match, slot) {
  if (props.editing || !match.winner || !slot.player) return '';
  return match.winner.id === slot.player.id ? 'player-won' : 'player-lost';
}
</script>

<template>
  <div class="bracket-scroll" tabindex="0" role="region" aria-label="Turnierbaum; bei Bedarf horizontal scrollen">
    <div class="bracket-headings" :style="{ width: `${width}px` }">
      <div v-for="(round, r) in bracket.rounds" :key="r" :style="{ left: `${r * columnWidth}px` }">
        <span class="round-index">0{{ r + 1 }}</span><h3>{{ title(r) }}</h3><span class="round-count">{{ round.length === 1 ? '1 Spiel' : `${round.length} Spiele` }}</span>
      </div>
    </div>
    <div class="bracket-canvas" :style="{ width: `${width}px`, height: `${height}px` }">
      <svg class="connections" :width="width" :height="height" aria-hidden="true">
        <path v-for="edge in edges" :key="edge.id" :d="edge.d" :class="edge.color" />
      </svg>
      <template v-for="(round, r) in bracket.rounds" :key="r">
        <article v-for="match in round" :key="match.id" class="match" :class="{ 'match-finished': !editing && match.winner, 'final-match': r === bracket.rounds.length - 1 }"
          :style="{ left: `${r * columnWidth}px`, top: `${top(r, match.index)}px` }" :aria-label="`${title(r)}, Spiel ${match.index + 1}`">
          <div class="match-header">
            <span>{{ r === bracket.rounds.length - 1 ? 'DAS FINALE' : `SPIEL ${match.index + 1}` }}</span>
            <span v-if="match.auto">Freilos</span>
            <button v-else-if="!readOnly && !editing && match.winner" class="undo" type="button" :disabled="busy" :aria-label="`Ergebnis ${title(r)}, Spiel ${match.index + 1} zurücksetzen`" title="Ergebnis und betroffene Folgerunden zurücksetzen" @click="emit('winner', match.id, null)"><Icon name="reset" /></button>
            <span v-else>{{ editing ? 'Vorschau' : match.winner ? 'Beendet' : match.ready ? 'Spielbereit' : 'Ausstehend' }}</span>
          </div>
          <div v-for="(slot, index) in match.slots" :key="index" class="player" :class="[state(match, slot), { 'player-empty': !slot.player }]">
            <span class="seed">{{ slot.player ? slot.player.id.slice(1).padStart(2, '0') : '—' }}</span>
            <input v-if="!readOnly && editing && r === 0 && slot.player" :value="names[Number(slot.player.id.slice(1)) - 1]" form="setup-form" required maxlength="40" :aria-label="`Name Spieler ${slot.player.id.slice(1)}`" :placeholder="`Spieler ${slot.player.id.slice(1)}`" autocomplete="off" @input="emit('name', Number(slot.player.id.slice(1)) - 1, $event.target.value)" />
            <span v-else class="player-name" :title="slot.player?.name">{{ slot.player?.name || (slot.resolved ? 'Freilos' : 'Sieger der Vorrunde') }}</span>
            <button v-if="!readOnly && !editing && match.ready && !match.auto && slot.player" class="advance" :class="{ selected: match.winner?.id === slot.player.id }" :disabled="busy" type="button" :aria-pressed="match.winner?.id === slot.player.id" :aria-label="`${slot.player.name} als Sieger wählen`" :title="`${slot.player.name} gewinnt`" @click="emit('winner', match.id, slot.player.id)"><Icon :name="match.winner?.id === slot.player.id ? 'check' : 'arrow'" /></button>
            <Icon v-else-if="!editing && slot.player && match.winner?.id === slot.player.id" class="bye-icon" name="check" />
          </div>
        </article>
      </template>
    </div>
  </div>
</template>
