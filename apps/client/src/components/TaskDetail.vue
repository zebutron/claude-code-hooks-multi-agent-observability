<template>
  <div class="px-4 py-3 border-t border-stone-700/30 bg-stone-950/50 space-y-3">
    <!-- Blocked alert + inline unblock -->
    <div v-if="task.blocked_by === 'human_input'" class="bg-red-950/40 border border-red-500/30 rounded-lg p-3">
      <div class="text-xs font-semibold text-stone-200 mb-1">Needs your input</div>
      <div class="text-sm text-stone-300 mb-2">{{ task.blocked_reason }}</div>
      <InlineUnblock @submit="$emit('unblock', $event)" />
    </div>

    <div v-else-if="task.blocked_by" class="bg-amber-950/30 border border-amber-500/30 rounded-lg p-3">
      <div class="text-xs font-semibold text-stone-200">
        {{ task.blocked_by === 'dependency' ? 'Waiting on dependency' : 'Needs resource' }}
      </div>
      <div class="text-sm text-stone-300 mt-1">{{ task.blocked_reason }}</div>
    </div>

    <!-- New/Discovered item: needs prioritization -->
    <div v-if="task.status === 'discovered'" class="bg-purple-950/30 border border-purple-500/30 rounded-lg p-3">
      <div class="text-xs text-stone-300 mb-2">AI-proposed — needs your prioritization</div>
      <div class="flex gap-2">
        <button
          @click="$emit('update', { status: 'queued' })"
          class="px-3 py-1.5 text-xs font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors"
        >
          Approve &amp; Queue
        </button>
        <button
          @click="$emit('archive')"
          class="px-3 py-1.5 text-xs font-medium rounded bg-stone-700 hover:bg-stone-600 text-stone-200 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>

    <!-- Completed: waiting for review -->
    <div v-if="task.status === 'complete'" class="bg-green-950/30 border border-green-500/30 rounded-lg p-3">
      <div class="text-xs text-stone-300 mb-2">Completed by agent — review and clear</div>
      <div class="flex gap-2">
        <button
          @click="$emit('archive')"
          class="px-3 py-1.5 text-xs font-medium rounded bg-green-600 hover:bg-green-500 text-white transition-colors"
        >
          Reviewed &amp; Archive
        </button>
        <button
          @click="$emit('update', { status: 'active' })"
          class="px-3 py-1.5 text-xs font-medium rounded bg-stone-700 hover:bg-stone-600 text-stone-200 transition-colors"
        >
          Reopen
        </button>
      </div>
    </div>

    <!-- Rationale (no label, just the text) -->
    <div v-if="task.rationale" class="text-sm text-stone-300 italic">
      {{ task.rationale }}
    </div>

    <!-- Description -->
    <div v-if="task.description" class="text-sm text-stone-300">
      {{ task.description }}
    </div>

    <!-- Scores — plain high-contrast text -->
    <div class="flex gap-5 text-xs">
      <div class="flex items-center gap-1.5">
        <span class="text-stone-500">ROI</span>
        <span class="font-bold text-stone-200">{{ task.roi_score }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-stone-500">Risk</span>
        <span class="font-bold text-stone-200">{{ task.risk_score }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-stone-500">AI Fit</span>
        <span class="font-bold text-stone-200">{{ task.fit_score }}</span>
      </div>
    </div>

    <!-- Agent info -->
    <div v-if="task.agent_session_id" class="text-xs text-stone-500">
      Agent: <span class="font-mono text-stone-300">{{ task.agent_session_id.slice(0, 8) }}...</span>
      <span v-if="task.last_agent_activity"> · last active {{ timeAgo(task.last_agent_activity) }}</span>
    </div>

    <!-- Activity log (notes) -->
    <div v-if="task.notes" class="rounded-lg overflow-hidden">
      <div class="text-[10px] font-semibold text-stone-500 uppercase tracking-wider mb-1">Activity</div>
      <div class="space-y-1 max-h-32 overflow-y-auto">
        <div
          v-for="(entry, i) in parsedNotes"
          :key="i"
          class="text-xs px-2.5 py-1.5 rounded bg-black/20"
        >
          <span v-if="entry.time" class="text-stone-500 font-mono text-[10px]">{{ entry.time }}</span>
          <span class="text-stone-300 ml-1.5">{{ entry.text }}</span>
        </div>
      </div>
    </div>

    <!-- Author + timestamps -->
    <div class="flex gap-4 text-[10px] text-stone-500">
      <span>Author: {{ task.source }}</span>
      <span>Created: {{ formatDate(task.created_at) }}</span>
      <span v-if="task.blocked_since">Blocked: {{ timeAgo(task.blocked_since) }}</span>
      <span v-if="task.completed_at">Completed: {{ formatDate(task.completed_at) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Task } from '../types';
import InlineUnblock from './InlineUnblock.vue';

const props = defineProps<{
  task: Task;
}>();

defineEmits<{
  unblock: [response: string];
  update: [updates: Partial<Task>];
  archive: [];
}>();

// Parse notes into structured activity entries
const parsedNotes = computed(() => {
  if (!props.task.notes) return [];
  return props.task.notes.split('\n').filter(line => line.trim()).map(line => {
    const match = line.match(/^\[([^\]]+)\]\s*(.*)/);
    if (match) {
      return { time: match[1], text: match[2] };
    }
    return { time: '', text: line };
  });
});

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
</script>
