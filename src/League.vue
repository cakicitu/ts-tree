<script setup>
import { reactive } from 'vue';
import Icon from './Icon.vue';
import { t } from './i18n.js';
import { MAX_SCORE } from '../shared/tournament.js';

const props = defineProps({ league: Object, editing: Boolean, readOnly: Boolean, busy: Boolean, names: Array });
const emit = defineEmits(['name', 'score']);
// Unsaved score input per match id; falls back to the stored score.
const drafts = reactive({});

const value = (match, side) => drafts[match.id]?.[side] ?? match.score?.[side] ?? '';
function edit(match, side, input) {
  drafts[match.id] = [0, 1].map(index => index === side ? input : String(value(match, index)));
}
const parsed = match => drafts[match.id]?.map(entry => entry === '' ? NaN : Number(entry));
const valid = match => parsed(match)?.every(entry => Number.isInteger(entry) && entry >= 0 && entry <= MAX_SCORE);
const changed = match => drafts[match.id] && String(drafts[match.id]) !== String(match.score ?? ['', '']);
function save(match) {
  if (!valid(match) || !changed(match)) return;
  emit('score', match.id, parsed(match));
  delete drafts[match.id];
}
function clear(match) {
  delete drafts[match.id];
  emit('score', match.id, null);
}
const seed = player => player.id.slice(1).padStart(2, '0');
</script>

<template>
  <div class="league">
    <div v-if="editing" class="league-names">
      <label v-for="(row, index) in league.standings.slice().sort((a, b) => a.seed - b.seed)" :key="row.player.id" class="league-name">
        <span class="seed">{{ seed(row.player) }}</span>
        <input v-if="!readOnly" :value="names[index]" form="setup-form" required maxlength="40" :aria-label="t('bracket.playerName', index + 1)" :placeholder="t('bracket.player', index + 1)" autocomplete="off" @input="emit('name', index, $event.target.value)" />
      </label>
    </div>

    <template v-else>
      <section class="standings" :aria-label="t('league.table')">
        <h3 class="league-heading">{{ t('league.table') }}</h3>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col" class="num">#</th><th scope="col">{{ t('league.player') }}</th>
                <th scope="col" class="num" :title="t('league.playedLong')">{{ t('league.played') }}</th>
                <th scope="col" class="num wdl" :title="t('league.wonLong')">{{ t('league.won') }}</th>
                <th scope="col" class="num wdl" :title="t('league.drawnLong')">{{ t('league.drawn') }}</th>
                <th scope="col" class="num wdl" :title="t('league.lostLong')">{{ t('league.lost') }}</th>
                <th scope="col" class="num wide">{{ t('league.score') }}</th>
                <th scope="col" class="num" :title="t('league.diffLong')">{{ t('league.diff') }}</th>
                <th scope="col" class="num points">{{ t('league.points') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in league.standings" :key="row.player.id" :class="{ leader: row.rank === 1 && row.played }">
                <td class="num rank">{{ row.rank }}</td>
                <td class="name" :title="row.player.name">{{ row.player.name }}</td>
                <td class="num">{{ row.played }}</td><td class="num wdl">{{ row.won }}</td><td class="num wdl">{{ row.drawn }}</td><td class="num wdl">{{ row.lost }}</td>
                <td class="num wide">{{ row.scored }}:{{ row.conceded }}</td>
                <td class="num">{{ row.diff > 0 ? `+${row.diff}` : row.diff }}</td>
                <td class="num points">{{ row.points }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="league-rule">{{ t('league.rule') }}</p>
      </section>

      <section class="fixtures" :aria-label="t('league.fixtures')">
        <h3 class="league-heading">{{ t('league.fixtures') }}</h3>
        <div class="matchdays">
          <div v-for="round in league.rounds" :key="round.index" class="matchday">
            <div class="matchday-header"><span class="round-index">{{ String(round.index + 1).padStart(2, '0') }}</span><h4>{{ t('league.matchday', round.index + 1) }}</h4><span v-if="round.resting" class="resting">{{ t('league.resting', round.resting.name) }}</span></div>
            <form v-for="match in round.matches" :key="match.id" class="fixture" :class="{ played: match.score && !drafts[match.id] }" @submit.prevent="save(match)">
              <span class="fixture-name home" :title="match.home.name" :class="{ 'is-winner': match.score && match.score[0] > match.score[1] }">{{ match.home.name }}</span>
              <span v-if="readOnly" class="fixture-scores">
                <span class="fixture-score home-score">{{ match.score ? match.score[0] : '–' }}</span>
                <span class="sep" aria-hidden="true">:</span>
                <span class="fixture-score away-score">{{ match.score ? match.score[1] : '–' }}</span>
              </span>
              <span v-else class="fixture-scores">
                <input class="home-score" type="number" inputmode="numeric" min="0" :max="MAX_SCORE" :value="value(match, 0)" :disabled="busy" :aria-label="t('league.scoreOf', match.home.name)" @input="edit(match, 0, $event.target.value)" />
                <span class="sep" aria-hidden="true">:</span>
                <input class="away-score" type="number" inputmode="numeric" min="0" :max="MAX_SCORE" :value="value(match, 1)" :disabled="busy" :aria-label="t('league.scoreOf', match.away.name)" @input="edit(match, 1, $event.target.value)" />
              </span>
              <span class="fixture-name away" :title="match.away.name" :class="{ 'is-winner': match.score && match.score[1] > match.score[0] }">{{ match.away.name }}</span>
              <span v-if="!readOnly" class="fixture-actions">
                <button v-if="changed(match)" class="advance selected" type="submit" :disabled="busy || !valid(match)" :aria-label="t('league.save')" :title="t('league.save')"><Icon name="check" /></button>
                <button v-else-if="match.score" class="undo" type="button" :disabled="busy" :aria-label="t('league.clear')" :title="t('league.clear')" @click="clear(match)"><Icon name="reset" /></button>
              </span>
            </form>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
