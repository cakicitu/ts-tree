<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import Bracket from './Bracket.vue';
import Icon from './Icon.vue';
import { buildBracket } from '../shared/tournament.js';
import { base } from './base.js';

const props = defineProps({ code: { type: String, default: '' } });
const tournament = ref(null);
const loading = ref(true);
const fetching = ref(false);
const error = ref('');
const bracket = computed(() => tournament.value ? buildBracket(tournament.value) : null);
const completed = computed(() => Object.keys(tournament.value?.results || {}).length);
let timer;
let controller;
let stopped = false;

async function refresh() {
  if (fetching.value || stopped) return;
  clearTimeout(timer);
  if (!/^\d{6}$/.test(props.code)) {
    error.value = 'Ungültiger Turniercode. Der Link muss sechs Ziffern enthalten, zum Beispiel /tree/123456.';
    loading.value = false;
    return;
  }
  fetching.value = true;
  controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let unavailable = false;
  try {
    const response = await fetch(`${base}/api/tree/${props.code}`, { credentials: 'omit', cache: 'no-store', signal: controller.signal });
    const result = await response.json();
    if (response.status === 404) {
      tournament.value = null;
      unavailable = true;
    }
    if (!response.ok) throw new Error(result.error || 'Das Turnier konnte nicht geladen werden.');
    tournament.value = result.tournament;
    error.value = '';
  } catch (failure) {
    if (!stopped) error.value = unavailable ? failure.message
      : tournament.value ? 'Aktualisierung fehlgeschlagen. Angezeigt wird der zuletzt geladene Stand.'
        : 'Das Turnier konnte nicht geladen werden. Bitte versuche es erneut.';
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
    <header class="topbar"><a :href="`${base}/`" class="brand"><Icon name="tree" /><span>Ts-Tree</span><span class="brand-divider"></span><span class="brand-subtitle">Turnieransicht</span></a><span v-if="/^\d{6}$/.test(code)" class="public-code">{{ code }}</span></header>
    <main class="dashboard">
      <p v-if="loading" role="status" class="alert">Turnier wird geladen …</p>
      <div v-if="error" class="alert error" role="alert">{{ error }} <button v-if="/^\d{6}$/.test(code)" class="button secondary" :disabled="fetching" @click="refresh">Erneut versuchen</button></div>
      <template v-if="tournament && bracket">
        <section class="overview" aria-label="Turnierübersicht">
          <div class="overview-item"><span class="stat-icon"><Icon name="users" /></span><div><span class="stat-label">TEILNEHMER</span><strong>{{ tournament.players.length }} <small>Spieler</small></strong></div></div>
          <div class="overview-item"><span class="stat-icon"><Icon name="trophy" /></span><div><span class="stat-label">SPIELMODUS</span><strong>K. o. <small>{{ bracket.rounds.length }} Runden</small></strong></div></div>
          <div class="overview-item status-item"><span class="status-dot live"></span><div><span class="stat-label">STATUS</span><strong>{{ bracket.champion ? 'Abgeschlossen' : 'Turnier läuft' }}</strong></div><span class="progress-label">{{ completed }} / {{ tournament.players.length - 1 }} Spiele</span></div>
        </section>
        <section v-if="bracket.champion" class="champion" aria-live="polite"><div class="champion-icon"><Icon name="trophy" /></div><div><p class="eyebrow">DAS TURNIER IST ENTSCHIEDEN.</p><h2>{{ bracket.champion.name }}</h2><p>Herzlichen Glückwunsch zum Turniersieg!</p></div></section>
        <section class="board-panel" aria-labelledby="public-board-title">
          <div class="board-toolbar"><div><h1 id="public-board-title">Turnierbaum <span class="mode-tag">NUR ANSEHEN</span></h1><p>Ergebnisse werden automatisch aktualisiert.</p></div><div class="legend"><span><i class="legend-dot green"></i>Gewonnen</span><span><i class="legend-dot red"></i>Ausgeschieden</span></div></div>
          <Bracket :bracket="bracket" read-only />
        </section>
      </template>
      <footer class="page-footer"><span>Ts-Tree</span></footer>
    </main>
  </div>
</template>
