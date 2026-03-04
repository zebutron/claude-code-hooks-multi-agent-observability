<template>
  <button
    @click="$emit('click')"
    class="flex items-center gap-1 hover:bg-stone-800/50 rounded px-1.5 py-0.5 -mx-0.5 transition-colors group"
    :title="`Click to change ${label} score (0-9)`"
  >
    <span class="text-[9px] font-bold text-stone-600 uppercase group-hover:text-stone-500">{{ label }}</span>
    <span
      class="font-bold text-sm tabular-nums w-4 text-center"
      :class="scoreColor"
    >{{ displayValue }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  label: string;
  value?: number;
}>(), {
  value: 0,
});

defineEmits<{
  click: [];
}>();

const safeValue = computed(() => props.value ?? 0);
const displayValue = computed(() => safeValue.value === 0 ? '—' : safeValue.value);

const scoreColor = computed(() => {
  const v = safeValue.value;
  if (v === 0) return 'text-stone-700';
  if (v >= 8) return 'text-emerald-400';
  if (v >= 6) return 'text-stone-200';
  if (v >= 4) return 'text-stone-400';
  if (v >= 2) return 'text-stone-500';
  return 'text-stone-600';
});
</script>
