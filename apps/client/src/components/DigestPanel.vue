<template>
  <div v-if="digest">
    <!-- ═══ FULL TAB MODE ═══ -->
    <div v-if="forceExpanded" class="space-y-4">
      <!-- Greeting + summary badges -->
      <div>
        <div class="text-lg font-semibold text-stone-100">{{ digest.greeting }}</div>
        <div class="flex items-center gap-2 mt-2 text-xs font-mono flex-wrap">
          <span v-if="digest.summary.blocked > 0" class="px-2 py-1 rounded bg-[#ff2d6f]/15 text-[#ff2d6f]">
            🚨 {{ digest.summary.blocked }} blocked
          </span>
          <span v-if="digest.summary.active > 0" class="px-2 py-1 rounded bg-[#ffee00]/10 text-[#ffee00]">
            ⚡ {{ digest.summary.active }} active
          </span>
          <span v-if="digest.summary.completed_today > 0" class="px-2 py-1 rounded bg-[#39ff14]/10 text-[#39ff14]">
            ✅ {{ digest.summary.completed_today }} done today
          </span>
          <span v-if="digest.summary.discovered > 0" class="px-2 py-1 rounded bg-[#00e5ff]/10 text-[#00e5ff]">
            🔮 {{ digest.summary.discovered }} to triage
          </span>
          <span class="px-2 py-1 rounded bg-[#c084fc]/10 text-[#c084fc]">
            📋 {{ digest.summary.queued }} queued
          </span>
        </div>
      </div>

      <!-- Sections -->
      <div v-for="section in digest.sections" :key="section.title" class="pt-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5">
          {{ section.emoji }} {{ section.title }}
        </div>
        <div class="space-y-1">
          <div
            v-for="(item, i) in section.items"
            :key="i"
            class="text-sm text-stone-300 pl-3 border-l-2 py-1"
            :class="sectionBorderClass(section.title)"
          >
            {{ item }}
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between pt-2">
        <span class="text-[9px] text-stone-600 font-mono">
          Generated {{ formatTime(digest.generated_at) }}
        </span>
        <button
          @click.stop="fetchDigest"
          class="text-[9px] text-stone-500 hover:text-stone-300 transition-colors"
          :disabled="loading"
        >
          {{ loading ? '...' : '↻ Refresh' }}
        </button>
      </div>
    </div>

    <!-- ═══ COLLAPSIBLE MODE (for embedding) ═══ -->
    <div v-else class="bg-stone-900/80 rounded-xl border border-stone-800/60 overflow-hidden mb-3">
      <button
        @click="expanded = !expanded"
        class="w-full flex items-center justify-between px-4 py-2.5 hover:bg-stone-800/50 transition-colors"
      >
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-stone-100">📋 Daily Digest</span>
          <div class="flex items-center gap-1.5 text-[10px] font-mono">
            <span v-if="digest.summary.blocked > 0" class="px-1.5 py-0.5 rounded bg-[#ff2d6f]/20 text-[#ff2d6f]">
              🚨 {{ digest.summary.blocked }}
            </span>
            <span v-if="digest.summary.active > 0" class="px-1.5 py-0.5 rounded bg-[#ffee00]/10 text-[#ffee00]">
              ⚡ {{ digest.summary.active }}
            </span>
            <span v-if="digest.summary.completed_today > 0" class="px-1.5 py-0.5 rounded bg-[#39ff14]/10 text-[#39ff14]">
              ✅ {{ digest.summary.completed_today }}
            </span>
            <span v-if="digest.summary.discovered > 0" class="px-1.5 py-0.5 rounded bg-[#00e5ff]/10 text-[#00e5ff]">
              🔮 {{ digest.summary.discovered }}
            </span>
            <span class="text-stone-500">{{ digest.summary.total_tasks }} total</span>
          </div>
        </div>
        <span class="text-stone-500 text-xs transition-transform" :class="expanded ? 'rotate-180' : ''">▼</span>
      </button>

      <div v-if="expanded" class="px-4 pb-3 space-y-3 border-t border-stone-800/40">
        <div v-for="section in digest.sections" :key="section.title" class="pt-2">
          <div class="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5">
            {{ section.emoji }} {{ section.title }}
          </div>
          <div class="space-y-1">
            <div
              v-for="(item, i) in section.items"
              :key="i"
              class="text-xs text-stone-300 pl-3 border-l-2 py-0.5"
              :class="sectionBorderClass(section.title)"
            >
              {{ item }}
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between pt-1">
          <span class="text-[9px] text-stone-600 font-mono">
            Generated {{ formatTime(digest.generated_at) }}
          </span>
          <button
            @click.stop="fetchDigest"
            class="text-[9px] text-stone-500 hover:text-stone-300 transition-colors"
            :disabled="loading"
          >
            {{ loading ? '...' : '↻ Refresh' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Loading state -->
  <div v-else class="flex items-center justify-center py-12">
    <div class="text-stone-500 text-sm">Loading digest...</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface DigestSection {
  title: string;
  emoji: string;
  items: string[];
}

interface DailyDigest {
  generated_at: number;
  greeting: string;
  sections: DigestSection[];
  summary: {
    total_tasks: number;
    blocked: number;
    active: number;
    completed_today: number;
    discovered: number;
    queued: number;
  };
}

withDefaults(defineProps<{
  forceExpanded?: boolean;
}>(), {
  forceExpanded: false,
});

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

const digest = ref<DailyDigest | null>(null);
const expanded = ref(false);
const loading = ref(false);

async function fetchDigest() {
  loading.value = true;
  try {
    const res = await fetch(`${SERVER}/digest`);
    if (res.ok) {
      digest.value = await res.json();
    }
  } catch (e) {
    console.error('Failed to fetch digest:', e);
  } finally {
    loading.value = false;
  }
}

function sectionBorderClass(title: string): string {
  if (title.includes('Input') || title.includes('Blocked')) return 'border-[#ff2d6f]/50';
  if (title.includes('Progress')) return 'border-[#ffee00]/40';
  if (title.includes('Completed')) return 'border-[#39ff14]/40';
  if (title.includes('Triage')) return 'border-[#00e5ff]/40';
  if (title.includes('Next')) return 'border-[#c084fc]/30';
  if (title.includes('Stale')) return 'border-amber-500/30';
  return 'border-stone-700/50';
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

onMounted(() => {
  fetchDigest();
});
</script>
