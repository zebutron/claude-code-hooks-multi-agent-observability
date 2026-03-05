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
    <!-- Score picker dropdown — fixed center on screen -->
    <Teleport to="body">
    <div
      v-if="showDropdown"
      class="fixed z-50 bg-stone-800 border border-stone-700 rounded-lg shadow-lg overflow-hidden flex"
      :style="dropdownStyle"
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
    </Teleport>
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
const dropdownTop = ref(0);

const safeValue = computed(() => props.value ?? 0);

// Position the dropdown centered horizontally, just below the chip
const dropdownStyle = computed(() => {
  const pickerWidth = 10 * 28; // 10 buttons × w-7 (28px)
  const screenW = typeof window !== 'undefined' ? window.innerWidth : 400;
  const left = Math.max(8, (screenW - pickerWidth) / 2);
  return {
    top: `${dropdownTop.value}px`,
    left: `${left}px`,
  };
});

function scoreColor(v: number): string {
  if (props.highIsGood) {
    // High = good (green), low = bad (red). FIT, IMPACT, URGENCY
    if (v >= 8) return 'text-emerald-400';
    if (v >= 6) return 'text-lime-300';
    if (v >= 4) return 'text-stone-300';
    if (v >= 2) return 'text-orange-400';
    return 'text-red-400';
  } else {
    // High = bad (red), low = good (green). LENGTH, COST, RISK
    if (v >= 8) return 'text-red-400';
    if (v >= 6) return 'text-orange-400';
    if (v >= 4) return 'text-stone-300';
    if (v >= 2) return 'text-lime-300';
    return 'text-emerald-400';
  }
}

function toggleDropdown() {
  if (!showDropdown.value && chipRef.value) {
    const rect = chipRef.value.getBoundingClientRect();
    dropdownTop.value = rect.bottom + 4; // 4px gap below chip
  }
  showDropdown.value = !showDropdown.value;
}

function selectScore(n: number) {
  showDropdown.value = false;
  emit('select', n);
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as Node;
  // Check if click is inside chip
  if (chipRef.value && chipRef.value.contains(target)) return;
  // Check if click is inside the teleported dropdown (by checking z-50 fixed elements)
  const el = e.target as HTMLElement;
  if (el.closest?.('.fixed.z-50')) return;
  showDropdown.value = false;
}

onMounted(() => document.addEventListener('click', handleClickOutside));
onUnmounted(() => document.removeEventListener('click', handleClickOutside));
</script>
