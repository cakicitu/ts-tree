import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { parse, compileScript } from 'vue/compiler-sfc';
import { renderToString } from 'vue/server-renderer';
import { buildBracket, createTournament, selectWinner } from '../shared/tournament.js';

// Compile the actual Vue component so the test checks rendered controls, not CSS.
const source = readFileSync(new URL('../src/Bracket.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const compiled = compileScript(descriptor, { id: 'bracket-test', inlineTemplate: true }).content
  .replace("import Icon from './Icon.vue';", 'const Icon = { render: () => null };')
  .replaceAll("from 'vue'", `from '${import.meta.resolve('vue')}'`)
  .replaceAll('from "vue"', `from '${import.meta.resolve('vue')}'`);
const { default: Bracket } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

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
