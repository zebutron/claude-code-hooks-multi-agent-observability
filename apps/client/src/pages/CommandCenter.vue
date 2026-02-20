<template>
  <div class="h-screen flex flex-col bg-stone-950">
    <!-- Header -->
    <header class="bg-stone-900 border-b border-stone-800">
      <!-- Title + Tabs -->
      <div class="px-4 pt-3 pb-0 flex items-center justify-between">
        <h1 class="text-lg font-bold text-stone-100">Command Center</h1>
      </div>

      <!-- Tab bar -->
      <div class="px-4 pt-2 flex items-center gap-4">
        <button
          @click="activeTab = 'prio'"
          class="pb-2 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === 'prio'
            ? 'text-stone-100 border-stone-100'
            : 'text-stone-500 border-transparent hover:text-stone-300'"
        >
          Priority Stack
        </button>
        <button
          @click="activeTab = 'digest'"
          class="pb-2 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === 'digest'
            ? 'text-stone-100 border-stone-100'
            : 'text-stone-500 border-transparent hover:text-stone-300'"
        >
          Daily Digest
        </button>
      </div>

      <!-- Usage Meter + Resource Locks (below tabs, always visible) -->
      <div class="px-4 py-2 flex items-center gap-4">
        <UsageMeter :usage="usage" class="flex-1" />
        <ResourceLocks />
      </div>

      <!-- Status filter chips + Tag filters (only on prio tab) -->
      <div v-if="activeTab === 'prio'" class="px-4 pb-2 flex items-center gap-1.5 flex-wrap">
        <button
          @click="activeFilter = null"
          class="filter-chip"
          :class="activeFilter === null ? 'filter-chip--active' : ''"
        >
          All <span class="font-mono ml-1 opacity-70">{{ tasks.length }}</span>
        </button>
        <button
          v-for="f in filterOptions"
          :key="f.status"
          @click="activeFilter = activeFilter === f.status ? null : f.status"
          class="filter-chip"
          :class="activeFilter === f.status ? 'filter-chip--active' : ''"
        >
          <span class="inline-block w-2 h-2 rounded-full mr-1" :class="f.dotClass" />
          {{ f.label }} <span class="font-mono ml-1 opacity-70">{{ f.count }}</span>
        </button>

        <!-- Tag filter -->
        <div v-if="allTags.length" class="sm:ml-2 sm:pl-2 sm:border-l sm:border-stone-700/50 flex items-center gap-1.5 flex-wrap basis-full sm:basis-auto mt-1.5 sm:mt-0">
          <button
            v-for="tag in allTags"
            :key="tag"
            @click="toggleTagFilter(tag)"
            class="filter-chip"
            :class="activeTagFilters.has(tag) ? 'filter-chip--active' : ''"
          >
            {{ tag }}
          </button>
          <button
            v-if="activeTagFilters.size > 0"
            @click="activeTagFilters.clear()"
            class="text-[10px] text-stone-500 hover:text-stone-300 transition-colors px-1"
          >
            clear
          </button>
        </div>
      </div>
    </header>

    <!-- ═══ PRIORITY STACK TAB ═══ -->
    <div v-if="activeTab === 'prio'" class="flex-1 overflow-y-auto px-4 py-3 space-y-1">
      <!-- Add Task button (minimal, centered, top of list) -->
      <div class="flex justify-center mb-2">
        <button
          @click="toggleCreateForm"
          class="w-full max-w-md h-8 flex items-center justify-center rounded-lg border border-dashed transition-all"
          :class="showCreateForm
            ? 'border-stone-600 bg-stone-900/80 text-stone-400'
            : 'border-stone-700/50 hover:border-stone-600 text-stone-600 hover:text-stone-400 hover:bg-stone-900/40'"
        >
          <span class="text-lg leading-none">+</span>
        </button>
      </div>

      <!-- Inline create form (expands in place) -->
      <div v-if="showCreateForm" class="mb-3 bg-stone-900/60 rounded-lg border border-stone-800/60 overflow-hidden">
        <div class="px-3 py-2">
          <input
            ref="titleInput"
            v-model="newTaskTitle"
            type="text"
            placeholder="What needs to happen?"
            class="w-full bg-transparent text-sm text-stone-100 placeholder-stone-600 focus:outline-none"
            @keydown.enter.exact="handleCreateTask"
            @keydown.escape="showCreateForm = false"
          />
        </div>
        <!-- Extra fields (collapsed until title has content) -->
        <div v-if="newTaskTitle.trim()" class="px-3 pb-2 flex flex-wrap gap-2 items-center border-t border-stone-800/30 pt-2">
          <select v-model="newTaskPriority" class="px-2 py-1 text-[10px] rounded bg-stone-950 border border-stone-700/50 text-stone-300">
            <option value="P0">P0</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
          </select>
          <select v-model="newTaskStatus" class="px-2 py-1 text-[10px] rounded bg-stone-950 border border-stone-700/50 text-stone-300">
            <option value="queued">Queued</option>
            <option value="active">Active</option>
            <option value="discovered">Unrated</option>
            <option value="blocked">Blocked</option>
          </select>
          <input
            v-model="newTaskTagsRaw"
            type="text"
            placeholder="Tags..."
            class="flex-1 min-w-[100px] px-2 py-1 text-[10px] rounded bg-stone-950 border border-stone-700/50 text-stone-300 placeholder-stone-600 focus:outline-none"
            @keydown.escape="showCreateForm = false"
          />
          <button
            @click="handleCreateTask"
            :disabled="!newTaskTitle.trim()"
            class="px-3 py-1 text-[10px] font-semibold rounded bg-stone-200 hover:bg-white disabled:bg-stone-700 disabled:text-stone-500 text-stone-900 transition-colors"
          >
            Create
          </button>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="text-stone-500 text-sm">Loading tasks...</div>
      </div>

      <!-- Empty state -->
      <div v-else-if="filteredTasks.length === 0 && tasks.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
        <div class="text-4xl mb-3">🎯</div>
        <div class="text-lg text-stone-400 mb-1">No tasks yet</div>
        <div class="text-sm text-stone-600">Add a task above or let an agent create one via the API</div>
      </div>

      <!-- No filter results -->
      <div v-else-if="filteredTasks.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
        <div class="text-stone-500 text-sm">No tasks match current filters</div>
        <button @click="clearFilters" class="text-xs text-stone-400 hover:text-stone-200 mt-2 transition-colors">
          Clear filters
        </button>
      </div>

      <!-- Task list -->
      <TaskRow
        v-else
        v-for="(task, idx) in filteredTasks"
        :key="task.id"
        :task="task"
        :focused="idx === focusedIndex"
        :ref="(el: any) => { if (el) taskRowRefs[idx] = el.$el || el; }"
        @unblock="handleUnblock"
        @update="handleUpdate"
        @archive="handleArchive"
        @reorder="handleReorder"
      />
    </div>

    <!-- ═══ DAILY DIGEST TAB ═══ -->
    <div v-if="activeTab === 'digest'" class="flex-1 overflow-y-auto px-4 py-4">
      <DigestPanel :force-expanded="true" />
    </div>

    <!-- Error toast -->
    <div
      v-if="error"
      class="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 bg-red-950/90 border border-red-500/30 text-stone-200 px-4 py-2 rounded-lg text-sm shadow-xl"
    >
      {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, nextTick, onMounted, onUnmounted } from 'vue';
import type { Task, TaskPriority, TaskStatus } from '../types';
import { useTaskTree } from '../composables/useTaskTree';
import { useUsage } from '../composables/useUsage';
import TaskRow from '../components/TaskRow.vue';
import UsageMeter from '../components/UsageMeter.vue';
import DigestPanel from '../components/DigestPanel.vue';
import ResourceLocks from '../components/ResourceLocks.vue';

const {
  tasks,
  loading,
  error,
  createTask,
  updateTask,
  unblockTask,
  archiveTask,
  reorderTask,
} = useTaskTree();

const { usage } = useUsage();

// ── Tabs ─────────────────────────────────────────────────────────────

const activeTab = ref<'prio' | 'digest'>('prio');

// ── Filtering ──────────────────────────────────────────────────────────

const activeFilter = ref<TaskStatus | null>(null);
const activeTagFilters = reactive(new Set<string>());

const allTags = computed(() => {
  const tagSet = new Set<string>();
  for (const task of tasks.value) {
    if (task.tags) {
      for (const tag of task.tags) {
        tagSet.add(tag);
      }
    }
  }
  return [...tagSet].sort();
});

function toggleTagFilter(tag: string) {
  if (activeTagFilters.has(tag)) {
    activeTagFilters.delete(tag);
  } else {
    activeTagFilters.add(tag);
  }
}

function clearFilters() {
  activeFilter.value = null;
  activeTagFilters.clear();
}

// Status filter definitions — new names + neon colors
const filterOptions = computed(() => {
  const counts: Record<string, number> = {};
  for (const t of tasks.value) {
    counts[t.status] = (counts[t.status] || 0) + 1;
  }
  return [
    { status: 'blocked' as TaskStatus, label: 'Blocked', dotClass: 'bg-[#ff2d6f]', count: counts['blocked'] || 0 },
    { status: 'discovered' as TaskStatus, label: 'Unrated', dotClass: 'bg-[#00e5ff]', count: counts['discovered'] || 0 },
    { status: 'active' as TaskStatus, label: 'Active', dotClass: 'bg-[#ffee00]', count: counts['active'] || 0 },
    { status: 'queued' as TaskStatus, label: 'Queued', dotClass: 'bg-[#c084fc]', count: counts['queued'] || 0 },
    { status: 'complete' as TaskStatus, label: 'Done', dotClass: 'bg-[#39ff14]', count: counts['complete'] || 0 },
  ].filter(f => f.count > 0);
});

// ── Sorting ────────────────────────────────────────────────────────────

const statusTier: Record<string, number> = {
  blocked: 0,
  active: 1,
  queued: 2,
  discovered: 3,
  complete: 4,
};

const sortedTasks = computed(() => {
  return [...tasks.value].sort((a, b) => {
    const aTier = statusTier[a.status] ?? 4;
    const bTier = statusTier[b.status] ?? 4;
    if (aTier !== bTier) return aTier - bTier;

    const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    const aPri = priorityOrder[a.priority] ?? 2;
    const bPri = priorityOrder[b.priority] ?? 2;
    if (aPri !== bPri) return aPri - bPri;

    return a.sort_order - b.sort_order;
  });
});

const filteredTasks = computed(() => {
  let result = sortedTasks.value;

  if (activeFilter.value) {
    result = result.filter(t => t.status === activeFilter.value);
  }

  if (activeTagFilters.size > 0) {
    result = result.filter(t =>
      t.tags && t.tags.some(tag => activeTagFilters.has(tag))
    );
  }

  return result;
});

// ── Create form ────────────────────────────────────────────────────────

const showCreateForm = ref(false);
const titleInput = ref<HTMLInputElement | null>(null);
const newTaskTitle = ref('');
const newTaskDescription = ref('');
const newTaskPriority = ref<TaskPriority>('P2');
const newTaskStatus = ref<TaskStatus>('queued');
const newTaskTagsRaw = ref('');

async function toggleCreateForm() {
  showCreateForm.value = !showCreateForm.value;
  if (showCreateForm.value) {
    await nextTick();
    titleInput.value?.focus();
  }
}

async function handleCreateTask() {
  const title = newTaskTitle.value.trim();
  if (!title) return;

  const tags = newTaskTagsRaw.value
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  try {
    await createTask({
      title,
      priority: newTaskPriority.value,
      status: newTaskStatus.value,
      description: newTaskDescription.value.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
    });
    // Reset form
    newTaskTitle.value = '';
    newTaskDescription.value = '';
    newTaskTagsRaw.value = '';
    newTaskPriority.value = 'P2';
    newTaskStatus.value = 'queued';
    showCreateForm.value = false;
  } catch (e: any) {
    console.error('Failed to create task:', e);
  }
}

// ── Event handlers ─────────────────────────────────────────────────────

async function handleUnblock(id: string, response: string) {
  try {
    await unblockTask(id, response);
  } catch (e: any) {
    console.error('Failed to unblock task:', e);
  }
}

async function handleUpdate(id: string, updates: Partial<Task>) {
  try {
    await updateTask(id, updates);
  } catch (e: any) {
    console.error('Failed to update task:', e);
  }
}

async function handleArchive(id: string) {
  try {
    await archiveTask(id);
  } catch (e: any) {
    console.error('Failed to archive task:', e);
  }
}

async function handleReorder(id: string, sortOrder: number) {
  try {
    await reorderTask(id, sortOrder);
  } catch (e: any) {
    console.error('Failed to reorder task:', e);
  }
}

// ── Keyboard navigation ─────────────────────────────────────────────

const focusedIndex = ref(-1);
const taskRowRefs: Record<number, HTMLElement> = {};

function handleKeyNav(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (activeTab.value !== 'prio') return;

  const len = filteredTasks.value.length;
  if (len === 0) return;

  switch (e.key) {
    case 'j':
    case 'ArrowDown':
      e.preventDefault();
      focusedIndex.value = Math.min(focusedIndex.value + 1, len - 1);
      scrollFocusedIntoView();
      break;
    case 'k':
    case 'ArrowUp':
      e.preventDefault();
      focusedIndex.value = Math.max(focusedIndex.value - 1, 0);
      scrollFocusedIntoView();
      break;
    case 'Enter':
    case ' ':
      if (focusedIndex.value >= 0) {
        e.preventDefault();
        const el = taskRowRefs[focusedIndex.value];
        if (el) {
          const clickTarget = el.querySelector('.flex.items-center.gap-2\\.5') as HTMLElement;
          if (clickTarget) clickTarget.click();
        }
      }
      break;
    case 'Escape':
      focusedIndex.value = -1;
      break;
    case 'g':
      focusedIndex.value = 0;
      scrollFocusedIntoView();
      break;
    case 'G':
      focusedIndex.value = len - 1;
      scrollFocusedIntoView();
      break;
  }
}

function scrollFocusedIntoView() {
  nextTick(() => {
    const el = taskRowRefs[focusedIndex.value];
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyNav);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyNav);
});
</script>

<style scoped>
.filter-chip {
  @apply px-2 py-1 text-[10px] font-medium rounded-md
    bg-stone-800 text-stone-400 border border-stone-700/50
    hover:bg-stone-700/80 hover:text-stone-200
    transition-all cursor-pointer flex items-center;
}
.filter-chip--active {
  @apply bg-stone-700 text-stone-100 border-stone-500/50;
}
</style>
