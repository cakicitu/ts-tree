import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { parse, compileScript } from 'vue/compiler-sfc';
import { renderToString } from 'vue/server-renderer';
import { buildBracket, buildLeague, createTournament, selectWinner, setScore } from '../shared/tournament.js';

// Compile the actual Vue component so the test checks rendered controls, not CSS.
const source = readFileSync(new URL('../src/Bracket.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const compiled = compileScript(descriptor, { id: 'bracket-test', inlineTemplate: true }).content
  .replace("import Icon from './Icon.vue';", 'const Icon = { render: () => null };')
  .replace("from './i18n.js'", `from '${new URL('../src/i18n.js', import.meta.url)}'`)
  .replaceAll("from 'vue'", `from '${import.meta.resolve('vue')}'`)
  .replaceAll('from "vue"', `from '${import.meta.resolve('vue')}'`);
const { default: Bracket } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function loadComponent(file, id) {
  const { descriptor } = parse(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'));
  const code = compileScript(descriptor, { id, inlineTemplate: true }).content
    .replace("import Icon from './Icon.vue';", 'const Icon = { render: () => null };')
    .replace("from './i18n.js'", `from '${new URL('../src/i18n.js', import.meta.url)}'`)
    .replace("from '../shared/tournament.js'", `from '${new URL('../shared/tournament.js', import.meta.url)}'`)
    .replaceAll("from 'vue'", `from '${import.meta.resolve('vue')}'`)
    .replaceAll('from "vue"', `from '${import.meta.resolve('vue')}'`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`).then(module => module.default);
}

test('Öffentlicher Baum zeigt Namen und Ergebnisse ohne Eingaben oder Bearbeitungsbuttons', async () => {
  const names = ['Anna', 'Bert', 'Clara', 'David'];
  const state = selectWinner(createTournament(names), '0-0', 'p1');
  const bracket = buildBracket(state);
  const publicHtml = await renderToString(createSSRApp(Bracket, { bracket, readOnly: true }));
  for (const name of names) assert.ok(publicHtml.includes(name));
  assert.match(publicHtml, /player-won/);
  assert.match(publicHtml, /player-lost/);
  assert.doesNotMatch(publicHtml, /<(button|input|select)\b/);
  const guardedHtml = await renderToString(createSSRApp(Bracket, { bracket, readOnly: true, editing: true, names }));
  assert.doesNotMatch(guardedHtml, /<(button|input|select)\b/);
  const adminHtml = await renderToString(createSSRApp(Bracket, { bracket }));
  assert.match(adminHtml, /class="undo"/);
  assert.match(adminHtml, /als Sieger wählen/);
});

test('Öffentliche Tabelle zeigt Ergebnisse und Punkte ohne Eingaben oder Buttons', async () => {
  const League = await loadComponent('League.vue', 'league-test');
  const state = setScore(createTournament(['Anna', 'Bert', 'Clara'], 'league'), 'p1-p2', [6, 3]);
  const league = buildLeague(state);
  const publicHtml = await renderToString(createSSRApp(League, { league, readOnly: true }));
  for (const name of ['Anna', 'Bert', 'Clara']) assert.ok(publicHtml.includes(name));
  assert.match(publicHtml, /home-score">6<\/span>[\s\S]*away-score">3<\/span>/);
  assert.match(publicHtml, /class="leader"/);
  assert.doesNotMatch(publicHtml, /<(button|input|select)\b/);
  const editableHtml = await renderToString(createSSRApp(League, { league }));
  assert.match(editableHtml, /<input[^>]*type="number"/);
  assert.match(editableHtml, /class="undo"/);
});
