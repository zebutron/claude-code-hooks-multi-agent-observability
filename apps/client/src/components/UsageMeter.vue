<template>
  <div class="flex items-center gap-3 px-3 py-1.5 bg-black/20 rounded-lg">
    <!-- Hourly -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center justify-between mb-0.5">
        <span class="text-[9px] font-semibold text-stone-500 uppercase tracking-wider">Hour</span>
        <span class="text-[10px] text-stone-400 font-mono">{{ formatTokens(hourlyTokens) }}</span>
      </div>
      <div class="h-1 bg-stone-700/60 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-1000"
          :class="velocityBarClass(hourlyVelocity)"
          :style="{ width: hourlyBarWidth + '%' }"
        />
      </div>
    </div>

    <!-- Today -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center justify-between mb-0.5">
        <span class="text-[9px] font-semibold text-stone-500 uppercase tracking-wider">Today</span>
        <span class="text-[10px] text-stone-400 font-mono">{{ formatTokens(usage.today) }}</span>
      </div>
      <div class="h-1 bg-stone-700/60 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-1000"
          :class="velocityBarClass(dailyVelocity)"
          :style="{ width: dailyBarWidth + '%' }"
        />
      </div>
    </div>

    <!-- Week -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center justify-between mb-0.5">
        <span class="text-[9px] font-semibold text-stone-500 uppercase tracking-wider">Week</span>
        <span class="text-[10px] text-stone-400 font-mono">{{ formatTokens(usage.this_week) }}</span>
      </div>
      <div class="h-1 bg-stone-700/60 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-1000"
          :class="velocityBarClass(weeklyVelocity)"
          :style="{ width: weeklyBarWidth + '%' }"
        />
      </div>
    </div>

    <!-- Sessions count -->
    <div class="text-center shrink-0 pl-1">
      <div class="text-sm font-bold text-stone-200">{{ usage.by_session.length }}</div>
      <div class="text-[8px] text-stone-500 uppercase">Agents</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { UsageSummary } from '../types';

const props = defineProps<{
  usage: UsageSummary;
}>();

// Bars scale relative to observed usage — no fake caps.
// Bar width = % of a "reference day" (the higher of: actual today or 2M tokens).
// This keeps bars meaningful: small usage = small bar, heavy usage = bigger bar.
const REF_HOUR = 500_000;     // reference: 500k tokens/hour is moderate-heavy
const REF_DAY = 3_000_000;    // reference: 3M tokens/day is heavy
const REF_WEEK = 15_000_000;  // reference: 15M tokens/week is heavy

// Calculate hourly (last 60 min) — approximate from today / hours elapsed
const hourlyTokens = computed(() => {
  const now = new Date();
  const hoursToday = Math.max(1, now.getHours() + now.getMinutes() / 60);
  // Use the last-session's proportion as a rough hourly estimate
  if (props.usage.by_session.length > 0) {
    // Most recent session's tokens as a proxy for recent hourly rate
    const recentSession = props.usage.by_session[0];
    return recentSession?.tokens || Math.round(props.usage.today / hoursToday);
  }
  return Math.round(props.usage.today / hoursToday);
});

// Velocity: ratio of current usage to reference amounts
// < 0.5 = light, 0.5-1.0 = moderate, > 1.0 = heavy
const hourlyVelocity = computed(() => hourlyTokens.value / REF_HOUR);
const dailyVelocity = computed(() => props.usage.today / REF_DAY);
const weeklyVelocity = computed(() => props.usage.this_week / REF_WEEK);

// Bar widths: cap at 100%, scale against reference
const hourlyBarWidth = computed(() => Math.min(100, (hourlyTokens.value / REF_HOUR) * 100));
const dailyBarWidth = computed(() => Math.min(100, (props.usage.today / REF_DAY) * 100));
const weeklyBarWidth = computed(() => Math.min(100, (props.usage.this_week / REF_WEEK) * 100));

// Color based on velocity: green = light, amber = moderate, red = heavy
function velocityBarClass(v: number): string {
  if (v > 1.0) return 'bg-[#ff2d6f]';
  if (v > 0.6) return 'bg-[#ffee00]';
  return 'bg-[#39ff14]';
}

function formatTokens(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'k';
  return String(n);
}
</script>
