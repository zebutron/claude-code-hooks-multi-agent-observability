<template>
  <div class="flex items-center gap-3 px-4 py-2 bg-black/20 rounded-lg">
    <!-- Today's usage -->
    <div class="flex-1">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">Today</span>
        <span class="text-xs text-stone-300 font-mono">{{ formatTokens(usage.today) }}</span>
      </div>
      <div class="h-1.5 bg-stone-700 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-1000"
          :class="usageBarClass(todayPercent)"
          :style="{ width: todayPercent + '%' }"
        />
      </div>
    </div>

    <!-- Week usage -->
    <div class="flex-1">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">This Week</span>
        <span class="text-xs text-stone-300 font-mono">{{ formatTokens(usage.this_week) }}</span>
      </div>
      <div class="h-1.5 bg-stone-700 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-1000"
          :class="usageBarClass(weekPercent)"
          :style="{ width: weekPercent + '%' }"
        />
      </div>
    </div>

    <!-- Active sessions count -->
    <div class="text-center shrink-0">
      <div class="text-lg font-bold text-stone-100">{{ usage.by_session.length }}</div>
      <div class="text-[9px] text-stone-500 uppercase">Sessions</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { UsageSummary } from '../types';

const props = defineProps<{
  usage: UsageSummary;
}>();

const DAILY_LIMIT_ESTIMATE = 5_000_000;
const WEEKLY_LIMIT_ESTIMATE = 30_000_000;

const todayPercent = computed(() =>
  Math.min(100, (props.usage.today / DAILY_LIMIT_ESTIMATE) * 100)
);

const weekPercent = computed(() =>
  Math.min(100, (props.usage.this_week / WEEKLY_LIMIT_ESTIMATE) * 100)
);

function usageBarClass(pct: number): string {
  if (pct > 85) return 'bg-red-500';
  if (pct > 60) return 'bg-amber-500';
  return 'bg-green-500';
}

function formatTokens(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'k';
  return String(n);
}
</script>
