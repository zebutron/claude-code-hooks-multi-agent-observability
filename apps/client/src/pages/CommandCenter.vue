<template>
  <div class="h-screen flex flex-col bg-stone-950">
    <!-- Header -->
    <header class="bg-stone-900 shadow-lg border-b border-stone-800">
      <div class="px-4 py-3 flex items-center justify-between">
        <!-- Title + back link -->
        <div class="flex items-center gap-3">
          <router-link to="/" class="text-stone-500 hover:text-stone-200 transition-colors text-sm">
            ← Timeline
          </router-link>
          <h1 class="text-lg font-bold text-stone-100">Command Center</h1>
        </div>

        <!-- Add task button -->
        <button
          @click="showCreateForm = !showCreateForm"
          class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-stone-200 hover:bg-white text-stone-900 transition-colors"
        >
          + Add Task
        </button>
      </div>

      <!-- Status filter chips + counts -->
      <div class="px-4 pb-2 flex items-center gap-1.5 flex-wrap">
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
          <span class="inline-block w-1.5 h-1.5 rounded-full mr-1" :class="f.dotClass" />
          {{ f.label }} <span class="font-mono ml-1 opacity-70">{{ f.count }}</span>
        </button>

        <!-- Tag filter (if tags exist) -->
        <div v-if="allTags.length" class="ml-2 pl-2 border-l border-stone-700/50 flex items-center gap-1.5 flex-wrap">
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

      <!-- Usage Meter -->
      <div class="px-4 pb-3">
        <UsageMeter :usage="usage" />
      </div>
    </header>

    <!-- Create Task Form (collapsible) -->
    <div v-if="showCreateForm" class="px-4 py-3 bg-stone-900/50 border-b border-stone-800 space-y-2">
      <!-- Row 1: Title + Priority + Create -->
      <div class="flex gap-2">
        <input
          ref="titleInput"
          v-model="newTaskTitle"
          type="text"
          placeholder="Task title..."
          class="flex-1 px-3 py-2 text-sm rounded bg-stone-950 border border-stone-700 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-stone-400"
          @keydown.enter.exact="handleCreateTask"
          @keydown.escape="showCreateForm = false"
        />
        <select v-model="newTaskPriority" class="px-2 py-2 text-xs rounded bg-stone-950 border border-stone-700 text-stone-200">
          <option value="P0">P0</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
          <option value="P3">P3</option>
        </select>
        <select v-model="newTaskStatus" class="px-2 py-2 text-xs rounded bg-stone-950 border border-stone-700 text-stone-200">
          <option value="queued">Queued</option>
          <option value="active">Active</option>
          <option value="discovered">Discovered</option>
          <option value="blocked">Blocked</option>
        </select>
        <button
          @click="handleCreateTask"
          :disabled="!newTaskTitle.trim()"
          class="px-4 py-2 text-xs font-semibold rounded bg-stone-200 hover:bg-white disabled:bg-stone-700 disabled:text-stone-500 text-stone-900 transition-colors"
        >
          Create
        </button>
      </div>
      <!-- Row 2: Description + Tags -->
      <div class="flex gap-2">
        <input
          v-model="newTaskDescription"
          type="text"
          placeholder="Description (optional)..."
          class="flex-1 px-3 py-1.5 text-xs rounded bg-stone-950 border border-stone-700/50 text-stone-200 placeholder-stone-600 focus:outline-none focus:border-stone-500"
          @keydown.escape="showCreateForm = false"
        />
        <input
          v-model="newTaskTagsRaw"
          type="text"
          placeholder="Tags (comma separated)..."
          class="w-48 px-3 py-1.5 text-xs rounded bg-stone-950 border border-stone-700/50 text-stone-200 placeholder-stone-600 focus:outline-none focus:border-stone-500"
          @keydown.escape="showCreateForm = false"
        />
      </div>
    </div>

    <!-- Priority Stack -->
    <div class="flex-1 overflow-y-auto px-4 py-3 space-y-1">
      <!-- Digest Panel -->
      <DigestPanel />

      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="text-stone-500 text-sm">Loading tasks...</div>
      </div>

      <!-- Empty state -->
      <div v-else-if="filteredTasks.length === 0 && tasks.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
        <div class="text-4xl mb-3">🎯</div>
        <div class="text-lg text-stone-400 mb-1">No tasks yet</div>
        <div class="text-sm text-stone-600">Add a task above or let an agent create one via the API</div>
        <div class="text-xs text-stone-700 mt-4 font-mono max-w-md">
          curl -X POST localhost:4000/tasks -H 'Content-Type: application/json' -d '{"title":"My first task"}'
        </div>
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

// ── Filtering ──────────────────────────────────────────────────────────

const activeFilter = ref<TaskStatus | null>(null);
const activeTagFilters = reactive(new Set<string>());

// Collect all unique tags across tasks
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

// Status filter definitions with dot colors and counts
const filterOptions = computed(() => {
  const counts: Record<string, number> = {};
  for (const t of tasks.value) {
    counts[t.status] = (counts[t.status] || 0) + 1;
  }
  return [
    { status: 'blocked' as TaskStatus, label: 'Blocked', dotClass: 'bg-red-500', count: counts['blocked'] || 0 },
    { status: 'complete' as TaskStatus, label: 'Done', dotClass: 'bg-green-500', count: counts['complete'] || 0 },
    { status: 'discovered' as TaskStatus, label: 'New', dotClass: 'bg-purple-400', count: counts['discovered'] || 0 },
    { status: 'active' as TaskStatus, label: 'Active', dotClass: 'bg-amber-400', count: counts['active'] || 0 },
    { status: 'queued' as TaskStatus, label: 'Queued', dotClass: 'bg-blue-400/50', count: counts['queued'] || 0 },
  ].filter(f => f.count > 0);
});

// ── Sorting ────────────────────────────────────────────────────────────

// Sort: blocked first (needs attention), then complete (needs review),
// then discovered (NEW, needs prioritization), then active, then queued.
// Within each tier: by priority, then by sort_order.
const statusTier: Record<string, number> = {
  blocked: 0,
  complete: 1,
  discovered: 2,
  active: 3,
  queued: 4,
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

// Apply filters on top of sort
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

// Auto-focus title input when form opens
watch(showCreateForm, async (val) => {
  if (val) {
    await nextTick();
    titleInput.value?.focus();
  }
});

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
  // Don't capture when typing in inputs
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

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
        // Click the row to toggle expand
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
      // gg → go to top (vim style)
      focusedIndex.value = 0;
      scrollFocusedIntoView();
      break;
    case 'G':
      // G → go to bottom
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
