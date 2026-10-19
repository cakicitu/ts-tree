<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import Icon from './Icon.vue';
import Bracket from './Bracket.vue';
import League from './League.vue';
import TournamentCard from './TournamentCard.vue';
import PublicTree from './PublicTree.vue';
import { base } from './base.js';
import LangSwitch from './LangSwitch.vue';
import { formatDate, lang, t, tournamentTitle } from './i18n.js';
import { MIN_PLAYERS, MAX_PLAYERS, MAX_TITLE, MIN_PLAYERS_BY_FORMAT, FORMATS, summarize } from '../shared/tournament.js';

const user = ref(null);
const pathname = window.location.pathname.slice(base.length) || '/';
const publicView = pathname === '/tree' || pathname.startsWith('/tree/');
const publicCode = pathname.match(/^\/tree\/(\d{6})\/?$/)?.[1] || '';
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const notice = ref('');
const resetToken = pathname === '/reset-password' ? new URLSearchParams(window.location.search).get('token') || '' : '';
// login | register | forgot | reset
const mode = ref(resetToken ? 'reset' : 'login');
const loginEmail = ref('');
const loginPassword = ref('');
// Newest first: { id, version, tournament }.
const tournaments = ref([]);
// Ids of expanded accordion items; the newest one starts open.
const expanded = ref(new Set());
const creating = ref(false);
const setupOpen = computed(() => creating.value || !tournaments.value.length);
const deleting = ref(null);
const title = ref('');
const format = ref('ko');
const count = ref(MIN_PLAYERS);
const minCount = computed(() => MIN_PLAYERS_BY_FORMAT[format.value]);
watch(format, () => { if (count.value < minCount.value) count.value = minCount.value; });
const names = ref(Array(MAX_PLAYERS).fill(''));
const deleteDialog = ref(null);
const cancelDelete = ref(null);
const loaded = ref(false);
const preview = computed(() => ({ format: format.value, players: names.value.slice(0, count.value).map((name, index) => ({ id: `p${index + 1}`, name: name.trim() || t('bracket.player', index + 1) })), results: {} }));
const summary = computed(() => summarize(preview.value));

async function api(path, method = 'GET', data) {
  let response;
  try {
    response = await fetch(`${base}/api${path}`, { method, credentials: 'same-origin', headers: { 'X-Lang': lang.value, ...(data ? { 'Content-Type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined });
  } catch { throw new Error(t('errors.offline')); }
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/login') { user.value = null; tournaments.value = []; loaded.value = false; }
    const failure = new Error(result.error || t('errors.failed'));
    failure.status = response.status;
    throw failure;
  }
  return result;
}
async function refresh() {
  const first = !loaded.value;
  tournaments.value = (await api('/tournaments')).tournaments;
  if (first) expanded.value = new Set(tournaments.value.slice(0, 1).map(item => item.id));
  loaded.value = true;
}
// Replaces one tournament in the list with the server's answer.
function apply(item) { tournaments.value = tournaments.value.map(entry => entry.id === item.id ? item : entry); }
function toggle(id) {
  const next = new Set(expanded.value);
  if (!next.delete(id)) next.add(id);
  expanded.value = next;
}
async function run(action) {
  if (busy.value) return;
  busy.value = true; error.value = ''; notice.value = '';
  try { await action(); }
  catch (failure) {
    if (failure.status === 409 || failure.status === 404) {
      try { await refresh(); } catch { loaded.value = false; }
    }
    error.value = failure.message;
  } finally { busy.value = false; }
}
async function initialize() {
  loading.value = true; error.value = '';
  try { user.value = (await api('/session')).email; await refresh(); }
  catch (failure) { if (failure.status !== 401) error.value = failure.message; }
  finally { loading.value = false; }
}
function switchMode(next) { mode.value = next; error.value = ''; notice.value = ''; loginPassword.value = ''; }
function leaveResetPage() { if (resetToken) window.history.replaceState(null, '', `${base}/`); }
function submitAuth() {
  run(async () => {
    if (mode.value === 'forgot') {
      await api('/forgot-password', 'POST', { email: loginEmail.value });
      notice.value = 'resetSent';
      return;
    }
    const result = mode.value === 'reset' ? await api('/reset-password', 'POST', { token: resetToken, password: loginPassword.value })
      : await api(mode.value === 'register' ? '/register' : '/login', 'POST', { email: loginEmail.value, password: loginPassword.value });
    if (mode.value === 'reset') leaveResetPage();
    user.value = result.email; loginPassword.value = ''; mode.value = 'login';
    await refresh();
  });
}
function logout() {
  run(async () => { await api('/logout', 'POST', {}); user.value = null; tournaments.value = []; loaded.value = false; names.value = Array(MAX_PLAYERS).fill(''); });
}
function start() {
  run(async () => {
    const item = await api('/tournaments', 'POST', { names: names.value.slice(0, count.value), format: format.value, title: title.value });
    tournaments.value = [item, ...tournaments.value];
    expanded.value = new Set([item.id]);
    creating.value = false; title.value = ''; names.value = Array(MAX_PLAYERS).fill('');
    notice.value = format.value === 'league' ? 'leagueStarted' : 'started';
  });
}
function winner(item, matchId, playerId) {
  run(async () => { apply(await api(`/tournaments/${item.id}/winner`, 'POST', { matchId, playerId, version: item.version })); notice.value = playerId ? 'saved' : 'undone'; });
}
function score(item, matchId, value) {
  run(async () => { apply(await api(`/tournaments/${item.id}/score`, 'POST', { matchId, score: value, version: item.version })); notice.value = value ? 'saved' : 'cleared'; });
}
function rename(item, value) {
  run(async () => { apply(await api(`/tournaments/${item.id}/title`, 'POST', { title: value })); notice.value = 'renamed'; });
}
async function askDelete(item) {
  deleting.value = item; deleteDialog.value.showModal(); await nextTick(); cancelDelete.value.focus();
}
function confirmDelete() {
  const item = deleting.value;
  run(async () => {
    await api(`/tournaments/${item.id}`, 'DELETE', {});
    tournaments.value = tournaments.value.filter(entry => entry.id !== item.id);
    notice.value = 'deleted';
  }).finally(() => deleteDialog.value?.close());
}
onMounted(() => { if (!publicView) { if (resetToken) loading.value = false; else initialize(); } });
</script>

<template>
  <PublicTree v-if="publicView" :code="publicCode" />
  <div v-else-if="loading" class="loading-screen"><Icon name="tree" /><p>{{ t('loading') }}</p></div>
  <main v-else-if="!user" class="login-layout">
    <section class="login-story">
      <a class="brand" :href="`${base}/`"><Icon name="tree" /><span>Ts-Tree</span></a>
      <div class="login-copy"><p class="eyebrow">{{ t('tagline') }}</p></div>
      <svg class="tree-art" viewBox="0 0 380 200" fill="none" aria-hidden="true">
        <path d="M80 24h36v32h44M80 88h36V56M80 120h36v32h44M80 184h36v-32M228 56h36v48h44M228 152h36v-48" />
        <rect x="12" y="12" width="68" height="24" rx="5" /><rect x="12" y="76" width="68" height="24" rx="5" />
        <rect x="12" y="108" width="68" height="24" rx="5" /><rect x="12" y="172" width="68" height="24" rx="5" />
        <rect x="160" y="44" width="68" height="24" rx="5" /><rect x="160" y="140" width="68" height="24" rx="5" />
        <rect class="tree-final" x="308" y="92" width="60" height="24" rx="5" />
      </svg>
      <span class="login-footnote">{{ t('footnote') }} <span>↗</span></span>
    </section>
    <section class="login-panel">
      <LangSwitch class="login-lang" />
      <form class="login-form" @submit.prevent="submitAuth">
        <h2>{{ t(`auth.${mode}Title`) }}</h2><p class="muted">{{ t(`auth.${mode}Text`) }}</p>
        <div v-if="error" class="alert error" role="alert">{{ error }}</div>
        <div v-if="notice" class="alert success" role="status">{{ t(`notice.${notice}`) }}</div>
        <template v-if="mode !== 'reset'"><label for="email">{{ t('auth.email') }}</label><input id="email" v-model="loginEmail" type="email" autocomplete="email" :placeholder="t('auth.emailPlaceholder')" required maxlength="254" /></template>
        <template v-if="mode !== 'forgot'"><label for="password">{{ t(mode === 'login' ? 'auth.password' : 'auth.newPassword') }}</label><input id="password" v-model="loginPassword" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" :placeholder="t(mode === 'login' ? 'auth.passwordPlaceholder' : 'auth.newPasswordPlaceholder')" required :minlength="mode === 'login' ? undefined : 8" maxlength="256" /></template>
        <button class="button primary login-submit" :disabled="busy">{{ busy ? t('auth.wait') : t(`auth.submit.${mode}`) }}<Icon name="arrow" /></button>
        <p class="auth-links">
          <template v-if="mode === 'login'"><button type="button" class="text-link" @click="switchMode('forgot')">{{ t('auth.forgotLink') }}</button><span>{{ t('auth.noAccount') }} <button type="button" class="text-link" @click="switchMode('register')">{{ t('auth.register') }}</button></span></template>
          <template v-else-if="mode === 'register'"><span>{{ t('auth.haveAccount') }} <button type="button" class="text-link" @click="switchMode('login')">{{ t('auth.login') }}</button></span></template>
          <template v-else><button type="button" class="text-link" @click="leaveResetPage(); switchMode('login')">{{ t('auth.back') }}</button><button v-if="mode === 'reset'" type="button" class="text-link" @click="leaveResetPage(); switchMode('forgot')">{{ t('auth.newLink') }}</button></template>
        </p>
      </form>
    </section>
  </main>
  <div v-else class="app-shell">
    <header class="topbar"><a :href="`${base}/`" class="brand"><Icon name="tree" /><span>Ts-Tree</span><span class="brand-divider"></span><span class="brand-subtitle">{{ t('manager') }}</span></a><div class="topbar-actions"><LangSwitch /><button class="account" :disabled="busy" @click="logout"><span class="avatar">{{ user[0].toUpperCase() }}</span><span>{{ user }}</span><Icon name="logout" /><span class="sr-only">{{ t('auth.logout') }}</span></button></div></header>
    <main class="dashboard">
      <div class="page-heading"><div><p class="eyebrow">{{ t('dashTagline') }}</p><p class="muted">{{ t('dashText') }}</p></div><button v-if="tournaments.length && !creating" class="button primary" :disabled="busy" @click="creating = true"><Icon name="plus" />{{ t('newTournament') }}</button></div>
      <div v-if="error" class="alert error" role="alert">{{ error }}</div>
      <div class="sr-only" role="status" aria-live="polite">{{ notice && t(`notice.${notice}`) }}</div>
      <div v-if="!loaded" class="alert">{{ t('errors.loadState') }} <button class="button secondary" :disabled="busy" @click="run(refresh)">{{ t('retry') }}</button></div>
      <template v-else>
        <section v-if="setupOpen" class="new-tournament" aria-labelledby="setup-title">
          <form id="setup-form" class="setup-bar" @submit.prevent="start">
            <div class="step-number"><Icon name="plus" /></div><div class="setup-copy"><h2 id="setup-title">{{ t('newTournament') }}</h2><p>{{ t('setupText') }}</p></div>
            <div class="setup-controls">
              <label for="tournament-title" class="field title-field"><span>{{ t('titleLabel') }} <span class="optional">{{ t('titleOptional') }}</span></span><input id="tournament-title" v-model="title" :maxlength="MAX_TITLE" :placeholder="formatDate(new Date())" autocomplete="off" :disabled="busy" /></label>
              <div class="field"><span id="format-label">{{ t('formats.label') }}</span><div class="format-switch" role="group" aria-labelledby="format-label"><button v-for="option in FORMATS" :key="option" type="button" :class="{ active: format === option }" :aria-pressed="format === option" :disabled="busy" @click="format = option">{{ t(`formats.${option}`) }}</button></div></div>
              <label for="player-count">{{ t('playerCount') }}<select id="player-count" v-model.number="count" :disabled="busy"><option v-for="n in MAX_PLAYERS - minCount + 1" :key="n" :value="n + minCount - 1">{{ t('nPlayers', n + minCount - 1) }}</option></select></label>
              <div class="setup-buttons"><button v-if="tournaments.length" type="button" class="button secondary" :disabled="busy" @click="creating = false">{{ t('cancel') }}</button><button class="button primary" :disabled="busy">{{ busy ? t('saving') : t('start') }}<Icon name="arrow" /></button></div>
            </div>
          </form>
          <section class="board-panel" aria-labelledby="board-title">
            <template v-if="summary.format === 'league'">
              <div class="board-toolbar"><div><h2 id="board-title">{{ t('titleLeague') }} <span class="mode-tag">{{ t('tagPreview') }}</span></h2><p>{{ t('hintLeaguePreview') }}</p></div></div>
              <League :league="summary.league" editing :busy="busy" :names="names" @name="(index, value) => names[index] = value" />
              <div class="board-footer"><span><Icon name="tree" />{{ t('leagueFooter', summary.total, summary.rounds) }}</span></div>
            </template>
            <template v-else>
              <div class="board-toolbar"><div><h2 id="board-title">{{ t('bracketTitle') }} <span class="mode-tag">{{ t('tagPreview') }}</span></h2><p>{{ t('hintPreview') }}</p></div></div>
              <Bracket :bracket="summary.bracket" editing :busy="busy" :names="names" @name="(index, value) => names[index] = value" />
              <div class="board-footer"><span><Icon name="tree" />{{ summary.bracket.size > count ? t('byes', summary.bracket.size - count) : t('allRounds') }}</span></div>
            </template>
          </section>
        </section>
        <section v-if="tournaments.length" class="tournament-list" aria-labelledby="list-title">
          <div class="list-heading"><h2 id="list-title">{{ t('yourTournaments') }}</h2><span>{{ t('tournamentCount', tournaments.length) }}</span></div>
          <TournamentCard v-for="item in tournaments" :key="item.id" :item="item" :open="expanded.has(item.id)" :busy="busy"
            @toggle="toggle(item.id)" @rename="value => rename(item, value)" @winner="(matchId, playerId) => winner(item, matchId, playerId)" @score="(matchId, value) => score(item, matchId, value)" @delete="askDelete(item)" />
        </section>
      </template>
      <footer class="page-footer"><span>Ts-Tree</span></footer>
    </main>
    <dialog ref="deleteDialog" class="reset-dialog" aria-labelledby="delete-title" @click="event => { if (event.target === deleteDialog) deleteDialog.close(); }"><div class="dialog-icon"><Icon name="trash" /></div><h2 id="delete-title">{{ t('deleteTitle') }}</h2><p>{{ deleting ? t('deleteText', tournamentTitle(deleting.tournament)) : '' }}</p><div class="dialog-actions"><button ref="cancelDelete" class="button secondary" :disabled="busy" @click="deleteDialog.close()">{{ t('cancel') }}</button><button class="button danger" :disabled="busy" @click="confirmDelete">{{ busy ? t('deleting') : t('deleteConfirm') }}</button></div></dialog>
  </div>
</template>
