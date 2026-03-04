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
      class="flex items-center gap-1.5 px-3 py-2 cursor-pointer select-none hover:bg-white/5 transition-colors"
      @click="onRowClick"
      @pointerdown="onPointerDown"
      @pointerup="onPointerUp"
      @pointerleave="onPointerLeave"
    >
      <!-- Priority badge (only P0/P1) -->
      <span
        v-if="task.priority === 'P0'"
        class="shrink-0 text-[8px] font-bold px-1 py-0.5 rounded bg-red-500/20 text-red-400"
      >P0</span>
      <span
        v-else-if="task.priority === 'P1'"
        class="shrink-0 text-[8px] font-bold px-1 py-0.5 rounded bg-amber-500/15 text-amber-400/80"
      >P1</span>

      <!-- Inline title editing or display -->
      <div class="min-w-0 flex-1 overflow-hidden">
        <div v-if="editingTitle" class="flex gap-1.5" @click.stop>
          <input
            ref="titleInput"
            v-model="editTitleValue"
            type="text"
            class="flex-1 px-1.5 py-0.5 text-xs font-medium rounded bg-stone-900 border border-stone-500 text-stone-100 focus:outline-none focus:border-stone-300"
            @keydown.enter="saveTitle"
            @keydown.escape="cancelTitleEdit"
            @blur="saveTitle"
          />
        </div>
        <div
          v-else
          class="text-xs font-medium text-stone-100"
          :class="isExpanded ? 'whitespace-normal' : 'truncate'"
        >
          {{ task.title }}
        </div>
      </div>

      <!-- Blocked reason (collapsed) -->
      <div v-if="task.blocked_by && !isExpanded" class="blocked-reason-container hidden sm:block shrink-0 max-w-[200px]">
        <div class="blocked-reason-scroll">
          <span class="text-[10px] text-[#ff2d6f] font-medium whitespace-nowrap">
            {{ task.blocked_reason }}
          </span>
        </div>
      </div>

      <!-- Archive button -->
      <button
        @click.stop="$emit('archive', task.id)"
        class="shrink-0 w-5 h-5 flex items-center justify-center rounded text-stone-700 hover:text-red-400 hover:bg-stone-800 transition-colors"
        title="Archive"
      >
        <span class="text-[10px]">✕</span>
      </button>
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
import { ref, nextTick } from 'vue';
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

// ── Inline title editing via long-press ─────────────────────────────

const editingTitle = ref(false);
const editTitleValue = ref('');
const titleInput = ref<HTMLInputElement | null>(null);
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let didLongPress = false;

function onPointerDown() {
  didLongPress = false;
  longPressTimer = setTimeout(() => {
    didLongPress = true;
    startTitleEdit();
  }, 500);
}

function onPointerUp() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function onPointerLeave() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

async function startTitleEdit() {
  editTitleValue.value = props.task.title;
  editingTitle.value = true;
  await nextTick();
  titleInput.value?.focus();
  titleInput.value?.select();
}

function saveTitle() {
  editingTitle.value = false;
  const val = editTitleValue.value.trim();
  if (val && val !== props.task.title) {
    emit('update', props.task.id, { title: val });
  }
}

function cancelTitleEdit() {
  editingTitle.value = false;
}

// ── Status border (left edge color = status) ────────────────────────

const statusBorderClass = {
  'border-l-2 border-[#ff2d6f]': props.task.status === 'blocked',
  'border-l-2 border-[#ffee00]': props.task.status === 'active',
  'border-l-2 border-[#c084fc]': props.task.status === 'queued',
  'border-l-2 border-[#39ff14]': props.task.status === 'complete',
  'border-l-2 border-[#00e5ff]': props.task.status === 'discovered',
};

// ── Drag & drop ─────────────────────────────────────────────────────

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
  if (!isDragging && !didLongPress && !editingTitle.value) {
    isExpanded.value = !isExpanded.value;
  }
  didLongPress = false;
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
