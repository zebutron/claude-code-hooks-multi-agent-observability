<template>
  <div
    class="task-row"
    :class="[
      statusBorderClass,
      { 'task-row--blocked-pulse': task.status === 'blocked' },
      { 'ml-5': task.depth > 0 },
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

      <!-- Blocked reason (only for blocked — not a status label, actual useful info) -->
      <span v-if="task.blocked_by" class="text-[10px] text-stone-400 truncate max-w-[200px] hidden sm:inline">
        {{ task.blocked_reason }}
      </span>

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

const props = defineProps<{
  task: Task;
}>();

const emit = defineEmits<{
  unblock: [id: string, response: string];
  update: [id: string, updates: Partial<Task>];
  archive: [id: string];
  reorder: [id: string, sortOrder: number];
}>();

const isExpanded = ref(false);
const isDragOver = ref(false);

// Status colors — bright dots only
const statusBorderClass = computed(() => ({
  'border-l-2 border-red-500': props.task.status === 'blocked',
  'border-l-2 border-amber-400': props.task.status === 'active',
  'border-l-2 border-blue-400/50': props.task.status === 'queued',
  'border-l-2 border-green-500': props.task.status === 'complete',
  'border-l-2 border-purple-400': props.task.status === 'discovered',
}));

const statusDotClass = computed(() => ({
  'bg-red-500 animate-pulse': props.task.status === 'blocked',
  'bg-amber-400': props.task.status === 'active',
  'bg-blue-400/50': props.task.status === 'queued',
  'bg-green-500': props.task.status === 'complete',
  'bg-purple-400': props.task.status === 'discovered',
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
.task-row--blocked-pulse {
  animation: blocked-pulse 2s ease-in-out infinite;
}
@keyframes blocked-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
  50% { box-shadow: 0 0 10px 1px rgba(239, 68, 68, 0.25); }
}
</style>
