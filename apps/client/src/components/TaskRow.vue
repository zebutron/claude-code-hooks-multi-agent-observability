<template>
  <div
    class="task-row"
    :class="[
      statusBorderClass,
      { 'task-row--blocked-pulse': task.status === 'blocked' },
      { 'ml-5': task.depth > 0 },
      { 'task-row--focused': focused },
    ]"
    draggable="true"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- Collapsed Row -->
    <div
      class="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer select-none hover:bg-white/5 transition-colors"
      @click="onRowClick"
    >
      <!-- Status dot -->
      <span class="shrink-0 w-2.5 h-2.5 rounded-full" :class="statusDotClass" />

      <!-- Priority badge (only P0/P1 — P2/P3 are default, no need to show) -->
      <span
        v-if="task.priority === 'P0'"
        class="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400"
      >P0</span>
      <span
        v-else-if="task.priority === 'P1'"
        class="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400/80"
      >P1</span>

      <!-- Title -->
      <span class="font-medium text-sm text-stone-100 truncate">
        {{ task.title }}
      </span>

      <!-- Tags -->
      <div v-if="task.tags && task.tags.length" class="flex gap-1 shrink-0">
        <span
          v-for="tag in task.tags"
          :key="tag"
          class="text-[9px] font-medium px-1.5 py-0.5 rounded bg-stone-700/60 text-stone-400"
        >
          {{ tag }}
        </span>
      </div>

      <!-- Spacer -->
      <div class="flex-1" />

      <!-- Blocked reason — red text, horizontal scroll with fade masks -->
      <div v-if="task.blocked_by" class="blocked-reason-container hidden sm:block shrink-0 max-w-[280px]">
        <div class="blocked-reason-scroll">
          <span class="text-[10px] text-[#ff2d6f] font-medium whitespace-nowrap">
            {{ task.blocked_reason }}
          </span>
        </div>
      </div>

      <!-- Budget bars -->
      <div v-if="task.estimated_tokens || task.estimated_minutes" class="flex gap-3 shrink-0 hidden sm:flex">
        <!-- Token bar -->
        <div v-if="task.estimated_tokens" class="w-20">
          <div class="h-1.5 bg-stone-700 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="barColor(tokenPercent)"
              :style="{ width: tokenPercent + '%' }"
            />
          </div>
          <div class="text-[9px] text-stone-400 mt-0.5 text-center font-mono">
            {{ fmt(task.actual_tokens) }}/{{ fmt(task.estimated_tokens) }}
          </div>
        </div>
        <!-- Time bar -->
        <div v-if="task.estimated_minutes" class="w-20">
          <div class="h-1.5 bg-stone-700 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="barColor(timePercent)"
              :style="{ width: timePercent + '%' }"
            />
          </div>
          <div class="text-[9px] text-stone-400 mt-0.5 text-center font-mono">
            {{ task.actual_minutes }}m/{{ task.estimated_minutes }}m
          </div>
        </div>
      </div>
    </div>

    <!-- Drop indicator -->
    <div v-if="isDragOver" class="h-0.5 bg-blue-500 mx-4" />

    <!-- Expanded Detail -->
    <TaskDetail
      v-if="isExpanded"
      :task="task"
      @unblock="$emit('unblock', task.id, $event)"
      @update="$emit('update', task.id, $event)"
      @archive="$emit('archive', task.id)"
    />

    <!-- Children (recursive) -->
    <div v-if="isExpanded && task.children && task.children.length > 0" class="border-l border-stone-700/30 ml-3">
      <TaskRow
        v-for="child in task.children"
        :key="child.id"
        :task="child"
        @unblock="(id: string, resp: string) => $emit('unblock', id, resp)"
        @update="(id: string, upd: Partial<Task>) => $emit('update', id, upd)"
        @archive="(id: string) => $emit('archive', id)"
        @reorder="(id: string, order: number) => $emit('reorder', id, order)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Task } from '../types';
import TaskDetail from './TaskDetail.vue';

const props = withDefaults(defineProps<{
  task: Task;
  focused?: boolean;
}>(), {
  focused: false,
});

const emit = defineEmits<{
  unblock: [id: string, response: string];
  update: [id: string, updates: Partial<Task>];
  archive: [id: string];
  reorder: [id: string, sortOrder: number];
}>();

const isExpanded = ref(false);
const isDragOver = ref(false);

// Status colors — neon palette, max contrast against stone-950
// Blocked: neon red-fuchsia, Unrated: bright cyan, Active: bright yellow,
// Queued: bright purple, Done: neon lime
const statusBorderClass = computed(() => ({
  'border-l-2 border-[#ff2d6f]': props.task.status === 'blocked',
  'border-l-2 border-[#ffee00]': props.task.status === 'active',
  'border-l-2 border-[#c084fc]': props.task.status === 'queued',
  'border-l-2 border-[#39ff14]': props.task.status === 'complete',
  'border-l-2 border-[#00e5ff]': props.task.status === 'discovered',
}));

const statusDotClass = computed(() => ({
  'bg-[#ff2d6f] animate-pulse': props.task.status === 'blocked',
  'bg-[#ffee00]': props.task.status === 'active',
  'bg-[#c084fc]': props.task.status === 'queued',
  'bg-[#39ff14]': props.task.status === 'complete',
  'bg-[#00e5ff]': props.task.status === 'discovered',
}));

const tokenPercent = computed(() => {
  if (!props.task.estimated_tokens) return 0;
  return Math.min(100, (props.task.actual_tokens / props.task.estimated_tokens) * 100);
});

const timePercent = computed(() => {
  if (!props.task.estimated_minutes) return 0;
  return Math.min(100, (props.task.actual_minutes / props.task.estimated_minutes) * 100);
});

function barColor(pct: number): string {
  if (pct > 90) return 'bg-red-500';
  if (pct > 60) return 'bg-amber-500';
  return 'bg-stone-400';
}

function fmt(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'k';
  return String(n);
}

// Drag & drop
let isDragging = false;

function onDragStart(e: DragEvent) {
  isDragging = true;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', props.task.id);
    const target = e.currentTarget as HTMLElement;
    if (target) {
      e.dataTransfer.setDragImage(target, 20, 20);
    }
  }
}

function onDragEnd() {
  isDragging = false;
  isDragOver.value = false;
}

function onDragOver(e: DragEvent) {
  isDragOver.value = true;
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move';
  }
}

function onDragLeave(e: DragEvent) {
  const target = e.currentTarget as HTMLElement;
  const related = e.relatedTarget as HTMLElement;
  if (target && related && target.contains(related)) return;
  isDragOver.value = false;
}

function onDrop(e: DragEvent) {
  isDragOver.value = false;
  const draggedId = e.dataTransfer?.getData('text/plain');
  if (draggedId && draggedId !== props.task.id) {
    const newOrder = props.task.sort_order - 0.5;
    emit('reorder', draggedId, newOrder);
  }
}

function onRowClick() {
  if (!isDragging) {
    isExpanded.value = !isExpanded.value;
  }
}
</script>

<style scoped>
.task-row {
  @apply bg-stone-900 rounded-lg mb-0.5 overflow-hidden transition-all duration-200;
}
.task-row:hover {
  @apply bg-stone-800/80 shadow-md;
}
.task-row:active {
  cursor: grabbing;
}
.task-row--focused {
  @apply ring-1 ring-stone-500/60 bg-stone-800/80;
}
.task-row--blocked-pulse {
  animation: blocked-pulse 2s ease-in-out infinite;
}
@keyframes blocked-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 45, 111, 0); }
  50% { box-shadow: 0 0 10px 1px rgba(255, 45, 111, 0.2); }
}
.blocked-reason-container {
  position: relative;
}
.blocked-reason-container::before,
.blocked-reason-container::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 20px;
  z-index: 1;
  pointer-events: none;
}
.blocked-reason-container::before {
  left: 0;
  background: linear-gradient(to right, rgb(28 25 23 / 0.8), transparent);
}
.blocked-reason-container::after {
  right: 0;
  background: linear-gradient(to left, rgb(28 25 23 / 0.8), transparent);
}
.blocked-reason-scroll {
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding: 0 8px;
}
.blocked-reason-scroll::-webkit-scrollbar {
  display: none;
}
</style>
