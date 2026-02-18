<template>
  <router-view />
</template>

<script setup lang="ts">
import { useThemes } from './composables/useThemes';

// Theme management (sets up theme system globally)
useThemes();
</script>
