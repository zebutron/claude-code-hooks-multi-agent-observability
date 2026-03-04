<template>
  <div class="relative" ref="chipRef">
    <button
      @click.stop="toggleDropdown"
      class="flex items-center gap-1 hover:bg-stone-800/50 rounded px-1.5 py-0.5 -mx-0.5 transition-colors group"
      :title="`Click to set ${label} score (0-9)`"
    >
      <span class="text-[9px] font-bold text-stone-600 uppercase group-hover:text-stone-500">{{ label }}</span>
      <span
        class="font-bold text-sm tabular-nums w-4 text-center"
        :class="scoreColor(safeValue)"
      >{{ safeValue }}</span>
    </button>
    <!-- Score picker dropdown -->
    <div
      v-if="showDropdown"
      class="absolute top-full left-0 mt-1 z-30 bg-stone-800 border border-stone-700 rounded-lg shadow-lg overflow-hidden flex"
    >
      <button
        v-for="n in 10"
        :key="n - 1"
        @click.stop="selectScore(n - 1)"
        class="w-7 h-7 flex items-center justify-center text-xs font-bold transition-colors hover:bg-stone-700"
        :class="[
          (n - 1) === safeValue ? 'bg-stone-600 ring-1 ring-stone-400' : '',
          scoreColor(n - 1),
        ]"
      >{{ n - 1 }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = withDefaults(defineProps<{
  label: string;
  value?: number;
  highIsGood?: boolean;
}>(), {
  value: 0,
  highIsGood: true,
});

const emit = defineEmits<{
  select: [value: number];
}>();

const showDropdown = ref(false);
const chipRef = ref<HTMLElement | null>(null);

const safeValue = computed(() => props.value ?? 0);

function scoreColor(v: number): string {
  if (props.highIsGood) {
    // High = good (green), low = bad (red). IMPACT, FIT
    if (v >= 8) return 'text-emerald-400';
    if (v >= 6) return 'text-lime-300';
    if (v >= 4) return 'text-stone-300';
    if (v >= 2) return 'text-orange-400';
    return 'text-red-400';
  } else {
    // High = bad (red), low = good (green). TIME, COST, RISK
    if (v >= 8) return 'text-red-400';
    if (v >= 6) return 'text-orange-400';
    if (v >= 4) return 'text-stone-300';
    if (v >= 2) return 'text-lime-300';
    return 'text-emerald-400';
  }
}

function toggleDropdown() {
  showDropdown.value = !showDropdown.value;
}

function selectScore(n: number) {
  showDropdown.value = false;
  emit('select', n);
}

function handleClickOutside(e: MouseEvent) {
  if (chipRef.value && !chipRef.value.contains(e.target as Node)) {
    showDropdown.value = false;
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside));
onUnmounted(() => document.removeEventListener('click', handleClickOutside));
</script>
