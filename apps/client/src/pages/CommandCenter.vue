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
          <span class="text-xs text-stone-500 font-mono">{{ tasks.length }} items</span>
        </div>

        <!-- Add task button -->
        <button
          @click="showCreateForm = !showCreateForm"
          class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-stone-200 hover:bg-white text-stone-900 transition-colors"
        >
          + Add Task
        </button>
      </div>

      <!-- Usage Meter -->
      <div class="px-4 pb-3">
        <UsageMeter :usage="usage" />
      </div>
    </header>

    <!-- Create Task Form (collapsible) -->
    <div v-if="showCreateForm" class="px-4 py-3 bg-stone-900/50 border-b border-stone-800">
      <div class="flex gap-2">
        <input
          v-model="newTaskTitle"
          type="text"
          placeholder="Task title..."
          class="flex-1 px-3 py-2 text-sm rounded bg-stone-950 border border-stone-700 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-stone-400"
          @keydown.enter="handleCreateTask"
        />
        <select v-model="newTaskPriority" class="px-2 py-2 text-xs rounded bg-stone-950 border border-stone-700 text-stone-200">
          <option value="P0">P0</option>
          <option value="P1">P1</option>
          <option value="P2" selected>P2</option>
          <option value="P3">P3</option>
        </select>
        <button
          @click="handleCreateTask"
          :disabled="!newTaskTitle.trim()"
          class="px-4 py-2 text-xs font-semibold rounded bg-stone-200 hover:bg-white disabled:bg-stone-700 disabled:text-stone-500 text-stone-900 transition-colors"
        >
          Create
        </button>
      </div>
    </div>

    <!-- Priority Stack -->
    <div class="flex-1 overflow-y-auto px-4 py-3 space-y-1">
      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="text-stone-500 text-sm">Loading tasks...</div>
      </div>

      <!-- Empty state -->
      <div v-else-if="sortedTasks.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
        <div class="text-4xl mb-3">🎯</div>
        <div class="text-lg text-stone-400 mb-1">No tasks yet</div>
        <div class="text-sm text-stone-600">Add a task above or let an agent create one via the API</div>
        <div class="text-xs text-stone-700 mt-4 font-mono max-w-md">
          curl -X POST localhost:4000/tasks -H 'Content-Type: application/json' -d '{"title":"My first task"}'
        </div>
      </div>

      <!-- Task list -->
      <TaskRow
        v-else
        v-for="task in sortedTasks"
        :key="task.id"
        :task="task"
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
import { ref, computed } from 'vue';
import type { Task, TaskPriority } from '../types';
import { useTaskTree } from '../composables/useTaskTree';
import { useUsage } from '../composables/useUsage';
import TaskRow from '../components/TaskRow.vue';
import UsageMeter from '../components/UsageMeter.vue';

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
    // Status tier
    const aTier = statusTier[a.status] ?? 4;
    const bTier = statusTier[b.status] ?? 4;
    if (aTier !== bTier) return aTier - bTier;

    // Then by priority
    const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    const aPri = priorityOrder[a.priority] ?? 2;
    const bPri = priorityOrder[b.priority] ?? 2;
    if (aPri !== bPri) return aPri - bPri;

    // Then by sort_order
    return a.sort_order - b.sort_order;
  });
});

// Create form
const showCreateForm = ref(false);
const newTaskTitle = ref('');
const newTaskPriority = ref<TaskPriority>('P2');

async function handleCreateTask() {
  const title = newTaskTitle.value.trim();
  if (!title) return;
  try {
    await createTask({ title, priority: newTaskPriority.value });
    newTaskTitle.value = '';
    showCreateForm.value = false;
  } catch (e: any) {
    console.error('Failed to create task:', e);
  }
}

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
</script>
