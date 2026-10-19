<script setup>
defineProps({ name: { type: String, default: 'arrow' } });
const paths = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 12 4 4L19 6',
  trophy: 'M8 3h8v7a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 2v7m-4 0h8',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8 .13a4 4 0 0 1 0 7.75',
  lock: 'M6 10h12v11H6V10Zm3 0V6a3 3 0 0 1 6 0v4m-3 5v2',
  logout: 'M9 4H4v16h5m5-12 4 4-4 4m-6-4h14',
  reset: 'M3 10a9 9 0 1 1 2 8M3 4v6h6',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  chevron: 'm6 9 6 6 6-6',
  tree: 'M3 3h5v5H3V3Zm0 13h5v5H3v-5Zm13-6h5v5h-5v-5ZM8 5.5h4v13H8m4-6h4',
};
</script>
<template><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.arrow" /></svg></template>
