<script setup>
import { lang, languages, setLang, t } from './i18n.js';
</script>

<template>
  <div class="lang-switch" role="group" :aria-label="t('language')">
    <button v-for="code in languages" :key="code" type="button" :class="{ active: lang === code }" :aria-pressed="lang === code" :lang="code" @click="setLang(code)">{{ code.toUpperCase() }}</button>
  </div>
</template>
