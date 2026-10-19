<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import Icon from './Icon.vue';
import Bracket from './Bracket.vue';
import PublicTree from './PublicTree.vue';
import { base } from './base.js';
import LangSwitch from './LangSwitch.vue';
import { lang, t } from './i18n.js';
import { buildBracket, MIN_PLAYERS, MAX_PLAYERS } from '../shared/tournament.js';

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
const tournament = ref(null);
const version = ref(0);
const count = ref(MIN_PLAYERS);
const names = ref(Array(MAX_PLAYERS).fill(''));
const resetDialog = ref(null);
const cancelReset = ref(null);
const loaded = ref(false);
const preview = computed(() => ({ players: names.value.slice(0, count.value).map((name, index) => ({ id: `p${index + 1}`, name: name.trim() || t('bracket.player', index + 1) })), results: {} }));
const bracket = computed(() => buildBracket(tournament.value || preview.value));
const playerCount = computed(() => tournament.value?.players.length || count.value);
const completed = computed(() => tournament.value ? Object.keys(tournament.value.results).length : 0);
const total = computed(() => playerCount.value - 1);
const status = computed(() => t(!tournament.value ? 'state.setup' : bracket.value.champion ? 'state.done' : 'state.running'));

async function api(path, method = 'GET', data) {
  let response;
  try {
    response = await fetch(`${base}/api${path}`, { method, credentials: 'same-origin', headers: { 'X-Lang': lang.value, ...(data ? { 'Content-Type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined });
  } catch { throw new Error(t('errors.offline')); }
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/login') { user.value = null; tournament.value = null; loaded.value = false; }
    const failure = new Error(result.error || t('errors.failed'));
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
  run(async () => { await api('/logout', 'POST', {}); user.value = null; tournament.value = null; loaded.value = false; names.value = Array(MAX_PLAYERS).fill(''); });
}
function start() {
  run(async () => { applyState(await api('/tournament', 'POST', { names: names.value.slice(0, count.value), version: version.value })); notice.value = 'started'; });
}
function winner(matchId, playerId) {
  run(async () => { applyState(await api('/tournament/winner', 'POST', { matchId, playerId, version: version.value })); notice.value = playerId ? 'saved' : 'undone'; });
}
async function openReset() {
  resetDialog.value.showModal(); await nextTick(); cancelReset.value.focus();
}
function reset() {
  run(async () => { applyState(await api('/tournament', 'DELETE', { version: version.value })); names.value = Array(MAX_PLAYERS).fill(''); count.value = MIN_PLAYERS; notice.value = 'deleted'; }).finally(() => resetDialog.value?.close());
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
      <div class="page-heading"><div><p class="eyebrow">{{ t('dashTagline') }}</p><p class="muted">{{ t('dashText') }}</p></div><button v-if="tournament" class="button secondary" :disabled="busy" @click="openReset"><Icon name="plus" />{{ t('newGame') }}</button></div>
      <div v-if="error" class="alert error" role="alert">{{ error }}</div>
      <div class="sr-only" role="status" aria-live="polite">{{ notice && t(`notice.${notice}`) }}</div>
      <div v-if="!loaded" class="alert">{{ t('errors.loadState') }} <button class="button secondary" :disabled="busy" @click="run(refresh)">{{ t('retry') }}</button></div>
      <template v-else>
        <section class="overview" :aria-label="t('overview')">
          <div class="overview-item"><span class="stat-icon"><Icon name="users" /></span><div><span class="stat-label">{{ t('participants') }}</span><strong>{{ playerCount }} <small>{{ t('players') }}</small></strong></div></div>
          <div class="overview-item"><span class="stat-icon"><Icon name="trophy" /></span><div><span class="stat-label">{{ t('mode') }}</span><strong>{{ t('knockout') }} <small>{{ t('rounds', bracket.rounds.length) }}</small></strong></div></div>
          <div class="overview-item status-item"><span class="status-dot" :class="{ live: tournament }"></span><div><span class="stat-label">{{ t('status') }}</span><strong>{{ status }}</strong></div><span class="progress-label">{{ t('matchesProgress', completed, total) }}</span></div>
        </section>
        <section v-if="tournament?.code" class="share-bar" :aria-label="t('share')">
          <div><span class="stat-label">{{ t('code') }}</span><strong class="share-code">{{ tournament.code }}</strong></div>
          <a class="button secondary" :href="`${base}/tree/${tournament.code}`" target="_blank" rel="noopener">/tree/{{ tournament.code }}<Icon name="arrow" /><span class="sr-only">{{ t('openPublic') }}</span></a>
        </section>
        <form v-if="!tournament" id="setup-form" class="setup-bar" @submit.prevent="start">
          <div class="step-number">1</div><div class="setup-copy"><h2>{{ t('setupTitle') }}</h2><p>{{ t('setupText') }}</p></div>
          <div class="setup-controls"><label for="player-count">{{ t('playerCount') }}<select id="player-count" v-model.number="count" :disabled="busy"><option v-for="n in MAX_PLAYERS - MIN_PLAYERS + 1" :key="n" :value="n + MIN_PLAYERS - 1">{{ t('nPlayers', n + MIN_PLAYERS - 1) }}</option></select></label><button class="button primary" :disabled="busy">{{ busy ? t('saving') : t('start') }}<Icon name="arrow" /></button></div>
        </form>
        <section v-if="bracket.champion && tournament" class="champion" aria-live="polite"><div class="champion-icon"><Icon name="trophy" /></div><div><p class="eyebrow">{{ t('decided') }}</p><h2>{{ bracket.champion.name }}</h2><p>{{ t('congrats') }}</p></div><span class="champion-word" aria-hidden="true">{{ t('championWord') }}</span></section>
        <section class="board-panel" aria-labelledby="board-title">
          <div class="board-toolbar"><div><h2 id="board-title">{{ t('bracketTitle') }} <span class="mode-tag">{{ t(tournament ? 'tagKo' : 'tagPreview') }}</span></h2><p>{{ t(tournament ? 'hintPlay' : 'hintPreview') }}</p></div><div class="legend"><span><i class="legend-dot green"></i>{{ t('won') }}</span><span><i class="legend-dot red"></i>{{ t('lost') }}</span></div></div>
          <Bracket :bracket="bracket" :editing="!tournament" :busy="busy" :names="names" @name="(index, value) => names[index] = value" @winner="winner" />
          <div class="board-footer"><span><Icon name="tree" />{{ bracket.size > playerCount ? t('byes', bracket.size - playerCount) : t('allRounds') }}</span><span v-if="busy || tournament" :class="{ saving: busy }">{{ busy ? t('saving') : t('allSaved') }}</span></div>
        </section>
      </template>
      <footer class="page-footer"><span>Ts-Tree</span></footer>
    </main>
    <dialog ref="resetDialog" class="reset-dialog" aria-labelledby="reset-title" @click="event => { if (event.target === resetDialog) resetDialog.close(); }"><div class="dialog-icon"><Icon name="reset" /></div><h2 id="reset-title">{{ t('resetTitle') }}</h2><p>{{ t('resetText') }}</p><div class="dialog-actions"><button ref="cancelReset" class="button secondary" :disabled="busy" @click="resetDialog.close()">{{ t('cancel') }}</button><button class="button danger" :disabled="busy" @click="reset">{{ busy ? t('deleting') : t('deleteAndNew') }}</button></div></dialog>
  </div>
</template>
