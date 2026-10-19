<script setup>
import { computed, ref, watch } from 'vue';
import Icon from './Icon.vue';
import Bracket from './Bracket.vue';
import League from './League.vue';
import { base } from './base.js';
import { formatDate, t, tournamentTitle } from './i18n.js';
import { MAX_TITLE } from '../shared/tournament.js';
import { summarize } from '../shared/tournament.js';

const props = defineProps({ item: Object, open: Boolean, busy: Boolean });
const emit = defineEmits(['toggle', 'winner', 'score', 'delete', 'rename']);
const tournament = computed(() => props.item.tournament);
const summary = computed(() => summarize(tournament.value));
const title = computed(() => tournamentTitle(tournament.value));
const bodyId = computed(() => `tournament-${props.item.id}`);
const name = ref(props.item.tournament.title || '');
watch(() => props.item.tournament.title, value => { name.value = value || ''; });
const nameChanged = computed(() => name.value.trim() !== (tournament.value.title || ''));
function saveName() { if (nameChanged.value) emit('rename', name.value.trim()); }
</script>

<template>
  <article class="tournament-item" :class="{ open, finished: summary.finished }">
    <h2 class="tournament-heading">
      <button type="button" class="tournament-toggle" :aria-expanded="open" :aria-controls="bodyId" @click="emit('toggle')">
        <span class="chevron" aria-hidden="true"><Icon name="chevron" /></span>
        <span class="tournament-title">
          <strong>{{ title }}</strong>
          <span class="tournament-meta">{{ t(`formats.${summary.format}`) }} · {{ t('nPlayers', tournament.players.length) }} · {{ tournament.code }}</span>
        </span>
        <span class="tournament-status">
          <span class="progress-label">{{ t('matchesProgress', summary.completed, summary.total) }}</span>
          <span class="status-pill" :class="summary.finished ? 'done' : 'running'">
            <Icon v-if="summary.finished" name="trophy" /><i v-else class="pulse" aria-hidden="true"></i>
            {{ summary.finished ? (summary.champion ? t('winnerIs', summary.champion.name) : t('state.done')) : t('state.running') }}
          </span>
        </span>
      </button>
    </h2>
    <div v-if="open" :id="bodyId" class="tournament-body">
      <form class="rename-bar" @submit.prevent="saveName">
        <label :for="`${bodyId}-name`">{{ t('titleLabel') }} <span class="optional">{{ t('titleOptional') }}</span></label>
        <div class="rename-row">
          <input :id="`${bodyId}-name`" v-model="name" :maxlength="MAX_TITLE" :placeholder="formatDate(tournament.createdAt)" autocomplete="off" :disabled="busy" />
          <button v-if="nameChanged" class="button primary" :disabled="busy"><Icon name="check" />{{ t('rename') }}</button>
        </div>
      </form>
      <section class="overview" :aria-label="t('overview')">
        <div class="overview-item"><span class="stat-icon"><Icon name="users" /></span><div><span class="stat-label">{{ t('participants') }}</span><strong>{{ tournament.players.length }} <small>{{ t('players') }}</small></strong></div></div>
        <div class="overview-item"><span class="stat-icon"><Icon name="trophy" /></span><div><span class="stat-label">{{ t('mode') }}</span><strong>{{ t(`formats.${summary.format}`) }} <small v-if="summary.format === 'ko'">{{ t('rounds', summary.rounds) }}</small></strong></div></div>
        <div class="overview-item status-item"><span class="status-dot live"></span><div><span class="stat-label">{{ t('status') }}</span><strong>{{ t(summary.finished ? 'state.done' : 'state.running') }}</strong></div><span class="progress-label">{{ t('matchesProgress', summary.completed, summary.total) }}</span></div>
      </section>
      <section class="share-bar" :aria-label="t('share')">
        <div><span class="stat-label">{{ t('code') }}</span><strong class="share-code">{{ tournament.code }}</strong></div>
        <a class="button secondary" :href="`${base}/tree/${tournament.code}`" target="_blank" rel="noopener">/tree/{{ tournament.code }}<Icon name="arrow" /><span class="sr-only">{{ t('openPublic') }}</span></a>
      </section>
      <section v-if="summary.champion" class="champion"><div class="champion-icon"><Icon name="trophy" /></div><div><p class="eyebrow">{{ t('decided') }}</p><h3>{{ summary.champion.name }}</h3><p>{{ t('congrats') }}</p></div><span class="champion-word" aria-hidden="true">{{ t('championWord') }}</span></section>
      <section class="board-panel" :aria-labelledby="`${bodyId}-board`">
        <template v-if="summary.format === 'league'">
          <div class="board-toolbar"><div><h3 :id="`${bodyId}-board`">{{ t('titleLeague') }} <span class="mode-tag">{{ t('tagLeague') }}</span></h3><p>{{ t('hintLeague') }}</p></div></div>
          <League :league="summary.league" :busy="busy" @score="(matchId, value) => emit('score', matchId, value)" />
          <div class="board-footer"><span><Icon name="tree" />{{ t('leagueFooter', summary.total, summary.rounds) }}</span></div>
        </template>
        <template v-else>
          <div class="board-toolbar"><div><h3 :id="`${bodyId}-board`">{{ t('bracketTitle') }} <span class="mode-tag">{{ t('tagKo') }}</span></h3><p>{{ t('hintPlay') }}</p></div><div class="legend"><span><i class="legend-dot green"></i>{{ t('won') }}</span><span><i class="legend-dot red"></i>{{ t('lost') }}</span></div></div>
          <Bracket :bracket="summary.bracket" :busy="busy" @winner="(matchId, playerId) => emit('winner', matchId, playerId)" />
          <div class="board-footer"><span><Icon name="tree" />{{ summary.bracket.size > tournament.players.length ? t('byes', summary.bracket.size - tournament.players.length) : t('allRounds') }}</span></div>
        </template>
      </section>
      <div class="tournament-actions">
        <button type="button" class="button danger-outline" :disabled="busy" @click="emit('delete')"><Icon name="trash" />{{ t('deleteTournament') }}</button>
      </div>
    </div>
  </article>
</template>
