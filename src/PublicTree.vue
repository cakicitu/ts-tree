<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import Bracket from './Bracket.vue';
import League from './League.vue';
import Icon from './Icon.vue';
import { summarize } from '../shared/tournament.js';
import { base } from './base.js';
import LangSwitch from './LangSwitch.vue';
import { lang, t, tournamentTitle } from './i18n.js';

const props = defineProps({ code: { type: String, default: '' } });
const tournament = ref(null);
const loading = ref(true);
const fetching = ref(false);
const error = ref('');
const summary = computed(() => tournament.value ? summarize(tournament.value) : null);
let timer;
let controller;
let stopped = false;

async function refresh() {
  if (fetching.value || stopped) return;
  clearTimeout(timer);
  if (!/^\d{6}$/.test(props.code)) {
    error.value = t('errors.invalidCode');
    loading.value = false;
    return;
  }
  fetching.value = true;
  controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let unavailable = false;
  try {
    const response = await fetch(`${base}/api/tree/${props.code}`, { credentials: 'omit', cache: 'no-store', headers: { 'X-Lang': lang.value }, signal: controller.signal });
    const result = await response.json();
    if (response.status === 404) {
      tournament.value = null;
      unavailable = true;
    }
    if (!response.ok) throw new Error(result.error || t('errors.loadTournament'));
    tournament.value = result.tournament;
    error.value = '';
  } catch (failure) {
    if (!stopped) error.value = unavailable ? failure.message
      : t(tournament.value ? 'errors.refreshFailed' : 'errors.loadTournamentRetry');
  } finally {
    clearTimeout(timeout);
    fetching.value = false;
    loading.value = false;
    if (!stopped && !unavailable) timer = setTimeout(refresh, 5000);
  }
}

onMounted(refresh);
onUnmounted(() => { stopped = true; clearTimeout(timer); controller?.abort(); });
</script>

<template>
  <div class="app-shell">
    <header class="topbar"><a :href="`${base}/`" class="brand"><Icon name="tree" /><span>Ts-Tree</span><span class="brand-divider"></span><span class="brand-subtitle">{{ t('viewer') }}</span></a><div class="topbar-actions"><span v-if="/^\d{6}$/.test(code)" class="public-code">{{ code }}</span><LangSwitch /></div></header>
    <main class="dashboard">
      <p v-if="loading" role="status" class="alert">{{ t('loadingTournament') }}</p>
      <div v-if="error" class="alert error" role="alert">{{ error }} <button v-if="/^\d{6}$/.test(code)" class="button secondary" :disabled="fetching" @click="refresh">{{ t('retry') }}</button></div>
      <template v-if="tournament && summary">
        <div class="page-heading"><div><p class="eyebrow">{{ t('viewer').toUpperCase() }}</p><h1>{{ tournamentTitle(tournament) }}</h1></div></div>
        <section class="overview" :aria-label="t('overview')">
          <div class="overview-item"><span class="stat-icon"><Icon name="users" /></span><div><span class="stat-label">{{ t('participants') }}</span><strong>{{ tournament.players.length }} <small>{{ t('players') }}</small></strong></div></div>
          <div class="overview-item"><span class="stat-icon"><Icon name="trophy" /></span><div><span class="stat-label">{{ t('mode') }}</span><strong>{{ t(`formats.${summary.format}`) }} <small v-if="summary.format === 'ko'">{{ t('rounds', summary.rounds) }}</small></strong></div></div>
          <div class="overview-item status-item"><span class="status-dot live"></span><div><span class="stat-label">{{ t('status') }}</span><strong>{{ t(summary.finished ? 'state.done' : 'state.running') }}</strong></div><span class="progress-label">{{ t('matchesProgress', summary.completed, summary.total) }}</span></div>
        </section>
        <section v-if="summary.champion" class="champion" aria-live="polite"><div class="champion-icon"><Icon name="trophy" /></div><div><p class="eyebrow">{{ t('decided') }}</p><h2>{{ summary.champion.name }}</h2><p>{{ t('congrats') }}</p></div></section>
        <section class="board-panel" aria-labelledby="public-board-title">
          <div class="board-toolbar"><div><h2 id="public-board-title">{{ t(summary.format === 'league' ? 'titleLeague' : 'bracketTitle') }} <span class="mode-tag">{{ t('tagReadOnly') }}</span></h2><p>{{ t('hintPublic') }}</p></div><div v-if="summary.format === 'ko'" class="legend"><span><i class="legend-dot green"></i>{{ t('won') }}</span><span><i class="legend-dot red"></i>{{ t('lost') }}</span></div></div>
          <League v-if="summary.format === 'league'" :league="summary.league" read-only />
          <Bracket v-else :bracket="summary.bracket" read-only />
        </section>
      </template>
      <footer class="page-footer"><span>Ts-Tree</span></footer>
    </main>
  </div>
</template>
