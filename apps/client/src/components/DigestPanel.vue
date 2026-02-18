<template>
  <div v-if="digest" class="bg-stone-900/80 rounded-xl border border-stone-800/60 overflow-hidden mb-3">
    <!-- Header bar (always visible, click to toggle) -->
    <button
      @click="expanded = !expanded"
      class="w-full flex items-center justify-between px-4 py-2.5 hover:bg-stone-800/50 transition-colors"
    >
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-stone-100">📋 Daily Digest</span>
        <!-- Quick stats -->
        <div class="flex items-center gap-1.5 text-[10px] font-mono">
          <span v-if="digest.summary.blocked > 0" class="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
            🚨 {{ digest.summary.blocked }}
          </span>
          <span v-if="digest.summary.active > 0" class="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400/80">
            ⚡ {{ digest.summary.active }}
          </span>
          <span v-if="digest.summary.completed_today > 0" class="px-1.5 py-0.5 rounded bg-green-500/15 text-green-400/80">
            ✅ {{ digest.summary.completed_today }}
          </span>
          <span v-if="digest.summary.discovered > 0" class="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400/80">
            🔮 {{ digest.summary.discovered }}
          </span>
          <span class="text-stone-500">{{ digest.summary.total_tasks }} total</span>
        </div>
      </div>
      <span class="text-stone-500 text-xs transition-transform" :class="expanded ? 'rotate-180' : ''">▼</span>
    </button>

    <!-- Expanded content -->
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

      <!-- Refresh + timestamp -->
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
  if (title.includes('Input') || title.includes('Blocked')) return 'border-red-500/50';
  if (title.includes('Progress')) return 'border-amber-400/50';
  if (title.includes('Completed')) return 'border-green-500/50';
  if (title.includes('Triage')) return 'border-purple-400/50';
  if (title.includes('Next')) return 'border-blue-400/30';
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
