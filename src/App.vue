<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import Icon from './Icon.vue';
import Bracket from './Bracket.vue';
import PublicTree from './PublicTree.vue';
import { base } from './base.js';
import { buildBracket, MIN_PLAYERS, MAX_PLAYERS } from '../shared/tournament.js';

const user = ref(null);
const pathname = window.location.pathname.slice(base.length) || '/';
const publicView = pathname === '/tree' || pathname.startsWith('/tree/');
const publicCode = pathname.match(/^\/tree\/(\d{6})\/?$/)?.[1] || '';
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const notice = ref('');
const loginName = ref('admin');
const loginPassword = ref('');
const tournament = ref(null);
const version = ref(0);
const count = ref(MIN_PLAYERS);
const names = ref(Array(MAX_PLAYERS).fill(''));
const resetDialog = ref(null);
const cancelReset = ref(null);
const loaded = ref(false);
const preview = computed(() => ({ players: names.value.slice(0, count.value).map((name, index) => ({ id: `p${index + 1}`, name: name.trim() || `Spieler ${index + 1}` })), results: {} }));
const bracket = computed(() => buildBracket(tournament.value || preview.value));
const playerCount = computed(() => tournament.value?.players.length || count.value);
const completed = computed(() => tournament.value ? Object.keys(tournament.value.results).length : 0);
const total = computed(() => playerCount.value - 1);
const status = computed(() => !tournament.value ? 'Vorbereitung' : bracket.value.champion ? 'Abgeschlossen' : 'Turnier läuft');

async function api(path, method = 'GET', data) {
  let response;
  try {
    response = await fetch(`${base}/api${path}`, { method, credentials: 'same-origin', headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined });
  } catch { throw new Error('Keine Verbindung zum Server. Bitte versuche es erneut.'); }
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/login') { user.value = null; tournament.value = null; loaded.value = false; }
    const failure = new Error(result.error || 'Die Anfrage ist fehlgeschlagen.');
    failure.status = response.status;
    throw failure;
  }
  return result;
}
function applyState(state) { tournament.value = state.tournament; version.value = state.version; loaded.value = true; }
async function refresh() { applyState(await api('/tournament')); }
async function run(action) {
  if (busy.value) return;
  busy.value = true; error.value = ''; notice.value = '';
  try { await action(); }
  catch (failure) {
    if (failure.status === 409) {
      try { await refresh(); } catch { loaded.value = false; }
    }
    error.value = failure.message;
  } finally { busy.value = false; }
}
async function initialize() {
  loading.value = true; error.value = '';
  try { user.value = (await api('/session')).username; await refresh(); }
  catch (failure) { if (failure.status !== 401) error.value = failure.message; }
  finally { loading.value = false; }
}
function login() {
  run(async () => { user.value = (await api('/login', 'POST', { username: loginName.value, password: loginPassword.value })).username; loginPassword.value = ''; await refresh(); });
}
function logout() {
  run(async () => { await api('/logout', 'POST', {}); user.value = null; tournament.value = null; loaded.value = false; names.value = Array(MAX_PLAYERS).fill(''); });
}
function start() {
  run(async () => { applyState(await api('/tournament', 'POST', { names: names.value.slice(0, count.value), version: version.value })); notice.value = 'Los geht’s! Wähle nach jedem Spiel den Sieger über den Pfeil.'; });
}
function winner(matchId, playerId) {
  run(async () => { applyState(await api('/tournament/winner', 'POST', { matchId, playerId, version: version.value })); notice.value = playerId ? 'Ergebnis gespeichert.' : 'Ergebnis und betroffene Folgerunden zurückgesetzt.'; });
}
async function openReset() {
  resetDialog.value.showModal(); await nextTick(); cancelReset.value.focus();
}
function reset() {
  run(async () => { applyState(await api('/tournament', 'DELETE', { version: version.value })); names.value = Array(MAX_PLAYERS).fill(''); count.value = MIN_PLAYERS; notice.value = 'Das alte Turnier wurde gelöscht. Bereit für eine neue Runde.'; }).finally(() => resetDialog.value?.close());
}
onMounted(() => { if (!publicView) initialize(); });
</script>

<template>
  <PublicTree v-if="publicView" :code="publicCode" />
  <div v-else-if="loading" class="loading-screen"><Icon name="tree" /><p>Dein Turnier wird geladen …</p></div>
  <main v-else-if="!user" class="login-layout">
    <section class="login-story">
      <a class="brand" :href="`${base}/`"><Icon name="tree" /><span>Ts-Tree</span></a>
      <div class="login-copy"><p class="eyebrow">DEIN TURNIER. KLAR ORGANISIERT.</p></div>
      <svg class="tree-art" viewBox="0 0 380 200" fill="none" aria-hidden="true">
        <path d="M80 24h36v32h44M80 88h36V56M80 120h36v32h44M80 184h36v-32M228 56h36v48h44M228 152h36v-48" />
        <rect x="12" y="12" width="68" height="24" rx="5" /><rect x="12" y="76" width="68" height="24" rx="5" />
        <rect x="12" y="108" width="68" height="24" rx="5" /><rect x="12" y="172" width="68" height="24" rx="5" />
        <rect x="160" y="44" width="68" height="24" rx="5" /><rect x="160" y="140" width="68" height="24" rx="5" />
        <rect class="tree-final" x="308" y="92" width="60" height="24" rx="5" />
      </svg>
      <span class="login-footnote">TURNIERE EINFACH ORGANISIEREN <span>↗</span></span>
    </section>
    <section class="login-panel">
      <form class="login-form" @submit.prevent="login">
        <h2>Willkommen bei Ts-Tree.</h2><p class="muted">Melde dich an, um dein Turnier zu verwalten.</p>
        <div v-if="error" class="alert error" role="alert">{{ error }}</div>
        <label for="username">Anmeldename</label><input id="username" v-model="loginName" autocomplete="username" required maxlength="100" />
        <label for="password">Passwort</label><input id="password" v-model="loginPassword" type="password" autocomplete="current-password" placeholder="Dein Passwort" required maxlength="256" />
        <button class="button primary login-submit" :disabled="busy">{{ busy ? 'Anmeldung läuft …' : 'Anmelden' }}<Icon name="arrow" /></button>
      </form>
    </section>
  </main>
  <div v-else class="app-shell">
    <header class="topbar"><a :href="`${base}/`" class="brand"><Icon name="tree" /><span>Ts-Tree</span><span class="brand-divider"></span><span class="brand-subtitle">Turniermanager</span></a><button class="account" :disabled="busy" @click="logout"><span class="avatar">{{ user[0].toUpperCase() }}</span><span>{{ user }}</span><Icon name="logout" /><span class="sr-only">Abmelden</span></button></header>
    <main class="dashboard">
      <div class="page-heading"><div><p class="eyebrow">DEIN TURNIER. DEIN ÜBERBLICK.</p><p class="muted">Spieler eintragen. Sieger wählen.</p></div><button v-if="tournament" class="button secondary" :disabled="busy" @click="openReset"><Icon name="plus" />Neues Spiel</button></div>
      <div v-if="error" class="alert error" role="alert">{{ error }}</div>
      <div class="sr-only" role="status" aria-live="polite">{{ notice }}</div>
      <div v-if="!loaded" class="alert">Der Turnierstand konnte nicht geladen werden. <button class="button secondary" :disabled="busy" @click="run(refresh)">Erneut versuchen</button></div>
      <template v-else>
        <section class="overview" aria-label="Turnierübersicht">
          <div class="overview-item"><span class="stat-icon"><Icon name="users" /></span><div><span class="stat-label">TEILNEHMER</span><strong>{{ playerCount }} <small>Spieler</small></strong></div></div>
          <div class="overview-item"><span class="stat-icon"><Icon name="trophy" /></span><div><span class="stat-label">SPIELMODUS</span><strong>K. o. <small>{{ bracket.rounds.length }} Runden</small></strong></div></div>
          <div class="overview-item status-item"><span class="status-dot" :class="{ live: tournament }"></span><div><span class="stat-label">STATUS</span><strong>{{ status }}</strong></div><span class="progress-label">{{ completed }} / {{ total }} Spiele</span></div>
        </section>
        <section v-if="tournament?.code" class="share-bar" aria-label="Turnier teilen">
          <div><span class="stat-label">TURNIERCODE</span><strong class="share-code">{{ tournament.code }}</strong></div>
          <a class="button secondary" :href="`${base}/tree/${tournament.code}`" target="_blank" rel="noopener">/tree/{{ tournament.code }}<Icon name="arrow" /><span class="sr-only">Öffentliche Ansicht in neuem Tab öffnen</span></a>
        </section>
        <form v-if="!tournament" id="setup-form" class="setup-bar" @submit.prevent="start">
          <div class="step-number">1</div><div class="setup-copy"><h2>Teilnehmer vorbereiten</h2><p>Wähle die Spieleranzahl und trage die Namen im Baum ein.</p></div>
          <div class="setup-controls"><label for="player-count">Spieleranzahl<select id="player-count" v-model.number="count" :disabled="busy"><option v-for="n in MAX_PLAYERS - MIN_PLAYERS + 1" :key="n" :value="n + MIN_PLAYERS - 1">{{ n + MIN_PLAYERS - 1 }} Spieler</option></select></label><button class="button primary" :disabled="busy">{{ busy ? 'Wird gespeichert …' : 'Turnier starten' }}<Icon name="arrow" /></button></div>
        </form>
        <section v-if="bracket.champion && tournament" class="champion" aria-live="polite"><div class="champion-icon"><Icon name="trophy" /></div><div><p class="eyebrow">DAS TURNIER IST ENTSCHIEDEN.</p><h2>{{ bracket.champion.name }}</h2><p>Herzlichen Glückwunsch zum Turniersieg!</p></div><span class="champion-word" aria-hidden="true">CHAMPION</span></section>
        <section class="board-panel" aria-labelledby="board-title">
          <div class="board-toolbar"><div><h2 id="board-title">Turnierbaum <span class="mode-tag">{{ tournament ? 'K. O. SYSTEM' : 'VORSCHAU' }}</span></h2><p>{{ !tournament ? 'Namen eintragen – die Begegnungen stehen schon bereit.' : 'Pfeil anklicken, um den Sieger in die nächste Runde zu schicken.' }}</p></div><div class="legend"><span><i class="legend-dot green"></i>Gewonnen</span><span><i class="legend-dot red"></i>Ausgeschieden</span></div></div>
          <Bracket :bracket="bracket" :editing="!tournament" :busy="busy" :names="names" @name="(index, value) => names[index] = value" @winner="winner" />
          <div class="board-footer"><span><Icon name="tree" />{{ bracket.size > playerCount ? `${bracket.size - playerCount} Freilose · Spieler ohne Gegner kommen automatisch weiter.` : 'Von der ersten Runde bis ins Finale.' }}</span><span v-if="busy || tournament" :class="{ saving: busy }">{{ busy ? 'Wird gespeichert …' : 'Alle Ergebnisse gespeichert' }}</span></div>
        </section>
      </template>
      <footer class="page-footer"><span>Ts-Tree</span></footer>
    </main>
    <dialog ref="resetDialog" class="reset-dialog" aria-labelledby="reset-title" @click="event => { if (event.target === resetDialog) resetDialog.close(); }"><div class="dialog-icon"><Icon name="reset" /></div><h2 id="reset-title">Neue Runde, neues Glück?</h2><p>Das aktuelle Turnier mit allen Spielern und Ergebnissen wird endgültig gelöscht. Danach kannst du ein neues konfigurieren.</p><div class="dialog-actions"><button ref="cancelReset" class="button secondary" :disabled="busy" @click="resetDialog.close()">Abbrechen</button><button class="button danger" :disabled="busy" @click="reset">{{ busy ? 'Wird gelöscht …' : 'Löschen & neues Spiel' }}</button></div></dialog>
  </div>
</template>
