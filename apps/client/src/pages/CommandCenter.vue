<template>
  <div class="h-screen flex flex-col bg-stone-950">
    <!-- Header -->
    <header class="bg-stone-900 border-b border-stone-800">
      <!-- Title + Tabs -->
      <div class="px-4 pt-3 pb-0 flex items-center justify-between">
        <h1 class="text-lg font-bold text-stone-100">CRABHUD</h1>
        <!-- Agent count badge -->
        <div v-if="agentStats.running > 0" class="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30">
          <span class="w-1.5 h-1.5 rounded-full bg-[#39ff14] animate-pulse" />
          <span class="text-[10px] font-medium text-emerald-400">{{ agentStats.running }} agent{{ agentStats.running > 1 ? 's' : '' }}</span>
        </div>
      </div>

      <!-- Tab bar -->
      <div class="px-4 pt-2 flex items-center gap-4">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          class="pb-2 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === tab.id
            ? 'text-stone-100 border-stone-100'
            : 'text-stone-500 border-transparent hover:text-stone-300'"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Usage Meter + Resource Locks (STACK tab only) -->
      <div v-if="activeTab === 'prio'" class="px-4 py-2 flex items-center gap-4">
        <UsageMeter :usage="usage" :claude-usage="claudeUsage" class="flex-1" />
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

        <!-- Tag filter toggle -->
        <button
          v-if="allTags.length"
          @click="showTagFilters = !showTagFilters"
          class="w-6 h-6 flex items-center justify-center rounded transition-colors flex-shrink-0"
          :class="showTagFilters || activeTagFilters.size > 0
            ? 'text-stone-300 hover:text-stone-100 bg-stone-700/50'
            : 'text-stone-600 hover:text-stone-400'"
        >
          <span class="text-[10px]">{{ showTagFilters ? '▴' : '▾' }}</span>
        </button>
      </div>
      <!-- Tag filter chips (collapsible, hidden by default) -->
      <div v-if="activeTab === 'prio' && showTagFilters && allTags.length" class="px-4 pb-2 flex items-center gap-1.5 flex-wrap">
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
            <option v-for="n in 10" :key="n-1" :value="'P'+(n-1)">P{{ n-1 }}</option>
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
        :expanded="expandedTaskId === task.id"
        :expanded-id="expandedTaskId"
        :ref="(el: any) => { if (el) taskRowRefs[idx] = el.$el || el; }"
        @toggle-expand="handleToggleExpand"
        @unblock="handleUnblock"
        @update="handleUpdate"
        @archive="handleArchive"
        @reorder="handleReorder"
      />
    </div>

    <!-- ═══ REPORT TAB ═══ -->
    <div v-if="activeTab === 'report'" class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <!-- Report header -->
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-bold text-stone-300 uppercase tracking-wider">Productivity Report</h2>
        <button
          @click="refreshReport"
          class="px-3 py-1 text-[10px] font-medium rounded bg-stone-800 border border-stone-700/50 text-stone-400 hover:text-stone-200 transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      <!-- Velocity stats -->
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-stone-900/60 rounded-lg border border-stone-800/50 p-3 text-center">
          <div class="text-2xl font-bold text-[#39ff14]">{{ reportStats.completedToday }}</div>
          <div class="text-[9px] text-stone-500 uppercase tracking-wider mt-1">Completed Today</div>
        </div>
        <div class="bg-stone-900/60 rounded-lg border border-stone-800/50 p-3 text-center">
          <div class="text-2xl font-bold text-[#00e5ff]">{{ reportStats.completedWeek }}</div>
          <div class="text-[9px] text-stone-500 uppercase tracking-wider mt-1">This Week</div>
        </div>
        <div class="bg-stone-900/60 rounded-lg border border-stone-800/50 p-3 text-center">
          <div class="text-2xl font-bold text-[#c084fc]">{{ reportStats.activeNow }}</div>
          <div class="text-[9px] text-stone-500 uppercase tracking-wider mt-1">Active Now</div>
        </div>
      </div>

      <!-- System health -->
      <div class="bg-stone-900/60 rounded-lg border border-stone-800/50 p-3 space-y-2">
        <div class="text-[9px] font-bold text-stone-600 uppercase tracking-wider">System Health</div>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div class="flex justify-between">
            <span class="text-stone-500">CRABHUD</span>
            <span class="text-[#39ff14]">● Online</span>
          </div>
          <div class="flex justify-between">
            <span class="text-stone-500">Heartbeat</span>
            <span :class="heartbeatStatus.enabled ? 'text-[#39ff14]' : 'text-stone-600'">
              {{ heartbeatStatus.enabled ? '● Active' : '○ Off' }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-stone-500">Agents Running</span>
            <span :class="agentStats.running > 0 ? 'text-[#ffee00]' : 'text-stone-500'">{{ agentStats.running }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-stone-500">Queue Depth</span>
            <span class="text-stone-300">{{ reportStats.queueDepth }}</span>
          </div>
        </div>
      </div>

      <!-- Recent completions -->
      <div class="space-y-1">
        <div class="text-[9px] font-bold text-stone-600 uppercase tracking-wider">Recent Completions</div>
        <div v-if="recentCompletions.length === 0" class="text-xs text-stone-600 italic py-4 text-center">
          No completed tasks yet
        </div>
        <div
          v-for="task in recentCompletions"
          :key="task.id"
          class="flex items-center gap-2 px-3 py-2 rounded-lg bg-stone-900/40 border border-stone-800/30"
        >
          <span class="w-2 h-2 rounded-full bg-[#39ff14] shrink-0" />
          <span class="text-xs text-stone-300 truncate flex-1">{{ task.title }}</span>
          <span class="text-[10px] text-stone-600 font-mono shrink-0">
            {{ task.completed_at ? formatDate(task.completed_at) : '' }}
          </span>
        </div>
      </div>

      <!-- Session log summaries (from personal-os) -->
      <div class="space-y-1">
        <div class="text-[9px] font-bold text-stone-600 uppercase tracking-wider">Latest Session Activity</div>
        <DigestPanel :force-expanded="true" />
      </div>
    </div>

    <!-- ═══ LOG TAB ═══ -->
    <div v-if="activeTab === 'log'" class="flex-1 flex flex-col overflow-hidden">

      <!-- Output header: controls + PULSE button -->
      <div class="px-4 py-3 border-b border-stone-800 bg-stone-900/50">
        <!-- Heartbeat controls row -->
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <!-- ON/OFF toggle -->
            <button
              @click="handleHeartbeatToggle"
              class="relative w-14 h-7 rounded-full transition-colors duration-200 focus:outline-none"
              :class="heartbeatStatus.enabled ? 'bg-[#39ff14]/30 border border-[#39ff14]/50' : 'bg-stone-800 border border-stone-700'"
            >
              <span
                class="absolute top-0.5 left-0.5 w-6 h-6 rounded-full transition-transform duration-200 flex items-center justify-center text-[10px] font-bold"
                :class="heartbeatStatus.enabled
                  ? 'translate-x-7 bg-[#39ff14] text-stone-950'
                  : 'translate-x-0 bg-[#ff2d6f] text-white'"
              >
                {{ heartbeatStatus.enabled ? 'ON' : 'OFF' }}
              </span>
            </button>

            <!-- Frequency -->
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] text-stone-500 uppercase tracking-wider">Every</span>
              <input
                v-model.number="frequencyInput"
                type="number"
                min="1"
                max="1440"
                class="w-16 px-2 py-1 text-xs font-mono rounded bg-stone-950 border border-stone-700/50 text-stone-200 focus:outline-none focus:border-stone-500"
                @change="handleFrequencyChange"
                @keydown.enter="($event.target as HTMLInputElement).blur()"
              />
              <span class="text-[10px] text-stone-500">min</span>
            </div>

            <!-- Next scheduled -->
            <div v-if="heartbeatStatus.enabled && heartbeatStatus.nextScheduled" class="flex items-center gap-1.5 hidden sm:flex">
              <span class="text-[10px] text-stone-500 uppercase tracking-wider">Next</span>
              <span class="text-xs font-mono text-stone-300">{{ formatTimestamp(heartbeatStatus.nextScheduled) }}</span>
            </div>
          </div>

          <!-- PULSE button -->
          <button
            @click="handlePulse"
            :disabled="heartbeatStatus.pulseRunning"
            class="px-4 py-1.5 text-xs font-bold rounded-md transition-all"
            :class="heartbeatStatus.pulseRunning
              ? 'bg-stone-800 text-stone-500 cursor-wait'
              : 'bg-[#ffee00]/20 border border-[#ffee00]/40 text-[#ffee00] hover:bg-[#ffee00]/30 hover:border-[#ffee00]/60'"
          >
            <span v-if="heartbeatStatus.pulseRunning" class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-[#ffee00] animate-pulse" />
              PULSING...
            </span>
            <span v-else>⚡ PULSE</span>
          </button>
        </div>
      </div>

      <!-- Output log (scrollable, newest first) -->
      <div class="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        <!-- Loading -->
        <div v-if="heartbeatLoading" class="flex items-center justify-center py-12">
          <div class="text-stone-500 text-sm">Loading heartbeat outputs...</div>
        </div>

        <!-- Empty state -->
        <div v-else-if="heartbeatOutputs.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
          <div class="text-4xl mb-3">💓</div>
          <div class="text-lg text-stone-400 mb-1">No heartbeat outputs yet</div>
          <div class="text-sm text-stone-600">Hit PULSE to fire your first heartbeat</div>
        </div>

        <!-- Output entries (concise: title, why now, next steps) -->
        <div
          v-else
          v-for="(entry, idx) in parsedHeartbeatEntries"
          :key="entry.filename"
          class="rounded-lg border overflow-hidden"
          :class="idx === 0
            ? 'border-stone-700/70 bg-stone-900/60'
            : 'border-stone-800/50 bg-stone-900/30'"
        >
          <!-- Entry header (always visible) -->
          <div
            class="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
            @click="toggleLogEntry(entry.filename)"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span v-if="idx === 0" class="w-1.5 h-1.5 rounded-full bg-[#39ff14] shrink-0" />
              <span class="text-[10px] font-mono shrink-0" :class="idx === 0 ? 'text-stone-300' : 'text-stone-500'">
                {{ entry.date }}
              </span>
            </div>
            <span class="text-[10px] text-stone-600">{{ expandedLogs.has(entry.filename) ? '▴' : '▾' }}</span>
          </div>

          <!-- Concise summary (top 3 tasks) -->
          <div class="px-3 pb-2 space-y-1.5">
            <div
              v-for="(item, i) in entry.items"
              :key="i"
              class="flex gap-2 text-xs"
            >
              <span class="text-stone-600 shrink-0 font-mono">{{ i + 1 }}.</span>
              <div class="min-w-0">
                <div class="font-medium text-stone-200">{{ item.title }}</div>
                <div class="text-stone-500 text-[10px]">{{ item.whyNow }}</div>
                <div v-if="item.nextSteps" class="text-stone-400 text-[10px] truncate max-w-lg">→ {{ item.nextSteps.slice(0, 120) }}{{ item.nextSteps.length > 120 ? '…' : '' }}</div>
              </div>
            </div>
            <div v-if="entry.items.length === 0" class="text-[10px] text-stone-600 italic">
              No structured items parsed
            </div>
          </div>

          <!-- Expandable raw output -->
          <div v-if="expandedLogs.has(entry.filename)" class="border-t border-stone-800/40">
            <div
              class="px-4 py-3 text-stone-300 text-xs leading-relaxed max-w-none heartbeat-content"
              v-html="renderMarkdown(entry.rawContent)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ AGENTS TAB ═══ -->
    <div v-if="activeTab === 'agents'" class="flex-1 flex flex-col overflow-hidden">

      <!-- Usage timeseries chart -->
      <div class="px-4 py-3 border-b border-stone-800 bg-stone-900/50">
        <div class="flex items-center justify-between mb-2">
          <div class="text-[9px] font-bold text-stone-600 uppercase tracking-wider">Usage Velocity</div>
          <UsageMeter :usage="usage" :claude-usage="claudeUsage" class="flex-shrink-0" />
        </div>
        <!-- Simple usage bars (timeseries placeholder until we have more data) -->
        <div class="h-16 flex items-end gap-0.5">
          <div
            v-for="(bar, i) in usageBars"
            :key="i"
            class="flex-1 rounded-t transition-all duration-300"
            :style="{ height: bar.height + '%', backgroundColor: bar.color }"
            :title="bar.label"
          />
        </div>
        <div class="flex justify-between text-[8px] text-stone-600 mt-1">
          <span>24h ago</span>
          <span>Now</span>
        </div>
      </div>

      <!-- Agent list -->
      <div class="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        <!-- No agents -->
        <div v-if="allAgents.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
          <div class="text-4xl mb-3">🤖</div>
          <div class="text-lg text-stone-400 mb-1">No agents</div>
          <div class="text-sm text-stone-600">Spawn an agent from a task in STACK</div>
        </div>

        <!-- Agent cards -->
        <div
          v-for="agent in sortedAgents"
          :key="agent.pid"
          class="rounded-lg border overflow-hidden"
          :class="agentCardClass(agent)"
        >
          <!-- Agent header -->
          <div class="px-3 py-2 flex items-center gap-2">
            <!-- Status dot with color matching chart -->
            <span class="w-2.5 h-2.5 rounded-full shrink-0" :class="agentDotClass(agent)" />

            <!-- Task title -->
            <div class="min-w-0 flex-1">
              <div class="text-xs font-medium text-stone-200 truncate">{{ agent.task_title }}</div>
              <div class="text-[10px] text-stone-500">
                PID {{ agent.pid }}
                <span v-if="agent.model"> · {{ agent.model }}</span>
                · {{ agentRuntime(agent) }}
              </div>
            </div>

            <!-- Status badge -->
            <span
              class="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0"
              :class="agentStatusBadgeClass(agent)"
            >
              {{ agent.status }}
            </span>

            <!-- Stop button (running only) -->
            <button
              v-if="agent.status === 'running'"
              @click="handleStopAgent(agent.pid)"
              class="shrink-0 px-2 py-1 text-[10px] font-medium rounded bg-red-950/60 border border-red-500/30 text-red-400 hover:bg-red-950 transition-colors"
            >
              Stop
            </button>
          </div>

          <!-- Output tail (last lines) -->
          <div v-if="agent.output_tail.length > 0 && agent.status === 'running'" class="px-3 pb-2">
            <div class="max-h-20 overflow-y-auto rounded bg-black/30 p-2">
              <div
                v-for="(line, i) in agent.output_tail.slice(-5)"
                :key="i"
                class="text-[10px] font-mono text-stone-500 leading-tight"
              >{{ line }}</div>
            </div>
          </div>

          <!-- Needs attention indicator -->
          <div
            v-if="agentNeedsAttention(agent)"
            class="px-3 py-1.5 bg-[#ff2d6f]/10 border-t border-[#ff2d6f]/20 flex items-center gap-2"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-[#ff2d6f] animate-pulse" />
            <span class="text-[10px] text-[#ff2d6f] font-medium">Needs attention — may be stalled</span>
          </div>
        </div>
      </div>
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
import type { Task, TaskPriority, TaskStatus, AgentInfo } from '../types';
import { useTaskTree } from '../composables/useTaskTree';
import { useUsage } from '../composables/useUsage';
import { useAgents } from '../composables/useAgents';
import { useHeartbeat } from '../composables/useHeartbeat';
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

const { usage, claudeUsage } = useUsage();
const { agents: allAgents, stats: agentStats, stopAgent: stopAgentFn } = useAgents();
const {
  outputs: heartbeatOutputs,
  status: heartbeatStatus,
  loading: heartbeatLoading,
  triggerPulse,
  updateConfig: updateHeartbeatConfig,
} = useHeartbeat();

// ── Tabs ─────────────────────────────────────────────────────────────

const tabs = [
  { id: 'prio' as const, label: 'STACK' },
  { id: 'report' as const, label: 'REPORT' },
  { id: 'log' as const, label: 'LOG' },
  { id: 'agents' as const, label: 'AGENTS' },
];

const activeTab = ref<'prio' | 'report' | 'log' | 'agents'>('prio');

// ── Heartbeat controls ──────────────────────────────────────────────

const frequencyInput = ref(240);

// Sync frequencyInput with heartbeat status
watch(() => heartbeatStatus.value.frequencyMinutes, (val) => {
  frequencyInput.value = val;
}, { immediate: true });

async function handleHeartbeatToggle() {
  await updateHeartbeatConfig({ enabled: !heartbeatStatus.value.enabled });
}

async function handleFrequencyChange() {
  const val = Math.max(1, Math.min(1440, frequencyInput.value || 240));
  frequencyInput.value = val;
  await updateHeartbeatConfig({ frequencyMinutes: val });
}

async function handlePulse() {
  const result = await triggerPulse();
  if (!result.success) {
    console.error('Pulse failed:', result.error);
  }
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

// ── LOG: Parsed heartbeat entries (concise view) ─────────────────────

const expandedLogs = reactive(new Set<string>());

function toggleLogEntry(filename: string) {
  if (expandedLogs.has(filename)) {
    expandedLogs.delete(filename);
  } else {
    expandedLogs.add(filename);
  }
}

interface HeartbeatItem {
  title: string;
  whyNow: string;
  nextSteps: string;
}

interface ParsedHeartbeatEntry {
  filename: string;
  date: string;
  items: HeartbeatItem[];
  rawContent: string;
}

const parsedHeartbeatEntries = computed((): ParsedHeartbeatEntry[] => {
  // Heartbeat outputs are already sorted newest first from the API
  return heartbeatOutputs.value.map(output => {
    const items = parseHeartbeatItems(output.content);
    return {
      filename: output.filename,
      date: output.date,
      items: items.slice(0, 3), // Top 3 only
      rawContent: output.content,
    };
  });
});

/**
 * Parse heartbeat markdown to extract top delegatable tasks.
 * Looks for numbered headings (### 1. Title) or bold items.
 */
function parseHeartbeatItems(md: string): HeartbeatItem[] {
  const items: HeartbeatItem[] = [];
  const lines = md.split('\n');

  let currentItem: Partial<HeartbeatItem> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match numbered task headings: "### 1. Title" or "### 1. Title (URGENT)" or "## 🚨 Title"
    const headingMatch = line.match(/^#{2,3}\s+(?:\d+\.\s+)?(?:🚨\s*)?(.+?)(?:\s*\(.*\))?\s*$/);
    const skipPatterns = ['Top 3', 'Needs Zeb', 'Stale', 'At Risk', 'Summary', 'Overview', 'Status', 'Quick Wins', 'Delegation', 'Next Steps', 'Action Items', 'Context', 'Crisis'];
    const isSkipHeading = skipPatterns.some(p => headingMatch?.[1]?.includes(p));
    if (headingMatch && !isSkipHeading && !line.includes('CRISIS') && !line.includes('Heartbeat')) {
      // Save previous item
      if (currentItem?.title) {
        items.push({
          title: currentItem.title,
          whyNow: currentItem.whyNow || '',
          nextSteps: currentItem.nextSteps || '',
        });
      }
      currentItem = { title: headingMatch[1].replace(/\*\*/g, '').trim() };
      continue;
    }

    // Check for crisis/top-level heading as an item
    const crisisMatch = line.match(/^#{2,3}\s+(?:🚨\s*)?(?:CRISIS:\s*)?(.+)/);
    if (crisisMatch && line.includes('CRISIS')) {
      if (currentItem?.title) {
        items.push({
          title: currentItem.title,
          whyNow: currentItem.whyNow || '',
          nextSteps: currentItem.nextSteps || '',
        });
      }
      currentItem = { title: crisisMatch[1].replace(/\*\*/g, '').trim() };
      continue;
    }

    if (!currentItem) continue;

    // Look for "Why now:" or bolded reason
    if (line.match(/^\*\*Why now:?\*\*/i) || line.match(/^Why now:/i)) {
      currentItem.whyNow = line.replace(/^\*\*Why now:?\*\*\s*/i, '').replace(/^Why now:\s*/i, '').replace(/\*\*/g, '').trim();
    }

    // Look for bold lines as "why now" if none found yet
    if (!currentItem.whyNow) {
      const boldMatch = line.match(/^\*\*(.+?)\*\*/);
      if (boldMatch && !line.startsWith('###') && !line.includes('Delegation')) {
        currentItem.whyNow = boldMatch[1].trim();
      }
    }

    // Look for "Next steps" or "Done looks like" or "Delegation prompt"
    if (!line.startsWith('#') && (line.match(/next\s*step/i) || line.match(/done\s*looks?\s*like/i) || line.match(/delegation\s*prompt/i))) {
      const nextLine = lines[i + 1]?.trim();
      if (nextLine && (nextLine.startsWith('-') || nextLine.startsWith('>') || nextLine.startsWith('*'))) {
        currentItem.nextSteps = nextLine.replace(/^[-*>]\s*/, '').replace(/\*\*/g, '').trim();
      } else if (!line.startsWith('**Delegation')) {
        currentItem.nextSteps = line.replace(/.*?:/i, '').replace(/\*\*/g, '').trim();
      }
    }
  }

  // Save last item
  if (currentItem?.title) {
    items.push({
      title: currentItem.title,
      whyNow: currentItem.whyNow || '',
      nextSteps: currentItem.nextSteps || '',
    });
  }

  return items;
}

// ── Simple markdown renderer ─────────────────────────────────────────

function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^---$/gm, '<hr />')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br />');

  html = html.replace(/(<li>.*?<\/li>(?:<br \/>)?)+/gs, (match) => {
    const cleaned = match.replace(/<br \/>/g, '');
    return `<ul>${cleaned}</ul>`;
  });

  html = `<p>${html}</p>`;
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<h[123]>)/g, '$1');
  html = html.replace(/(<\/h[123]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<\/p>/g, '$1');
  html = html.replace(/<p>(<hr \/>)/g, '$1');
  html = html.replace(/(<hr \/>)<\/p>/g, '$1');
  html = html.replace(/<p>(<blockquote>)/g, '$1');
  html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');

  return html;
}

// ── REPORT: Stats ────────────────────────────────────────────────────

const reportStats = computed(() => {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const completed = tasks.value.filter(t => t.status === 'complete' || t.status === 'archived');
  const completedToday = completed.filter(t => t.completed_at && t.completed_at >= todayStart.getTime()).length;
  const completedWeek = completed.filter(t => t.completed_at && t.completed_at >= weekStart.getTime()).length;
  const activeNow = tasks.value.filter(t => t.status === 'active').length;
  const queueDepth = tasks.value.filter(t => t.status === 'queued').length;

  return { completedToday, completedWeek, activeNow, queueDepth };
});

const recentCompletions = computed(() => {
  return tasks.value
    .filter(t => (t.status === 'complete' || t.status === 'archived') && t.completed_at)
    .sort((a, b) => (b.completed_at || 0) - (a.completed_at || 0))
    .slice(0, 10);
});

function refreshReport() {
  // Trigger re-fetch of tasks to update stats
  // (tasks are already reactive from useTaskTree)
}

// ── AGENTS: Helpers ──────────────────────────────────────────────────

// Agent colors for chart (cycle through palette)
const agentColors = ['#39ff14', '#00e5ff', '#ffee00', '#c084fc', '#ff2d6f', '#ff9500'];

function getAgentColor(idx: number): string {
  return agentColors[idx % agentColors.length];
}

const sortedAgents = computed(() => {
  return [...allAgents.value].sort((a, b) => {
    // Running first, then by start time descending
    if (a.status === 'running' && b.status !== 'running') return -1;
    if (b.status === 'running' && a.status !== 'running') return 1;
    return b.started_at - a.started_at;
  });
});

// Usage bars (simple visualization)
const usageBars = computed(() => {
  const bars: { height: number; color: string; label: string }[] = [];
  const sessions = usage.value?.by_session || [];

  // Generate 24 bars representing rough hourly activity
  for (let i = 0; i < 24; i++) {
    const hasActivity = sessions.length > 0 && i > 18; // Placeholder: show recent activity
    bars.push({
      height: hasActivity ? 20 + Math.random() * 60 : 5 + Math.random() * 10,
      color: hasActivity ? '#39ff14' : '#292524',
      label: `${24 - i}h ago`,
    });
  }
  return bars;
});

function agentCardClass(agent: AgentInfo): string {
  switch (agent.status) {
    case 'running': return 'border-[#39ff14]/30 bg-stone-900/60';
    case 'completed': return 'border-stone-800/50 bg-stone-900/30';
    case 'failed': return 'border-red-500/20 bg-stone-900/30';
    case 'stopped': return 'border-stone-800/50 bg-stone-900/30';
    default: return 'border-stone-800/50 bg-stone-900/30';
  }
}

function agentDotClass(agent: AgentInfo): Record<string, boolean> {
  return {
    'bg-[#39ff14] animate-pulse': agent.status === 'running',
    'bg-[#39ff14]': agent.status === 'completed',
    'bg-[#ff2d6f]': agent.status === 'failed',
    'bg-stone-600': agent.status === 'stopped',
  };
}

function agentStatusBadgeClass(agent: AgentInfo): string {
  switch (agent.status) {
    case 'running': return 'bg-[#39ff14]/10 text-[#39ff14]';
    case 'completed': return 'bg-stone-800 text-stone-400';
    case 'failed': return 'bg-red-950/40 text-red-400';
    case 'stopped': return 'bg-stone-800 text-stone-500';
    default: return 'bg-stone-800 text-stone-500';
  }
}

function agentRuntime(agent: AgentInfo): string {
  const elapsed = Date.now() - agent.started_at;
  const mins = Math.floor(elapsed / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function agentNeedsAttention(agent: AgentInfo): boolean {
  if (agent.status !== 'running') return false;
  // Stalled if no output in last 5 minutes
  const elapsed = Date.now() - agent.started_at;
  return elapsed > 300000 && agent.output_tail.length === 0;
}

async function handleStopAgent(pid: number) {
  try {
    await stopAgentFn(pid);
  } catch (e: any) {
    console.error('Failed to stop agent:', e);
  }
}

// ── Expand state (single expanded item, auto-scroll) ─────────────────

const expandedTaskId = ref<string | null>(null);

function handleToggleExpand(id: string) {
  if (expandedTaskId.value === id) {
    // Collapsing — just collapse in place
    expandedTaskId.value = null;
  } else {
    // Expanding — close previous, open new, scroll with buffer
    expandedTaskId.value = id;
    nextTick(() => {
      const idx = filteredTasks.value.findIndex(t => t.id === id);
      const el = taskRowRefs[idx] as HTMLElement;
      if (el) {
        // Find the scroll container (parent with overflow-y-auto)
        const scrollParent = el.closest('.overflow-y-auto') as HTMLElement;
        if (scrollParent) {
          const elTop = el.offsetTop - scrollParent.offsetTop;
          // 12px buffer between header and expanded item
          scrollParent.scrollTo({ top: elTop - 12, behavior: 'smooth' });
        } else {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  }
}

// ── Filtering ──────────────────────────────────────────────────────────

const activeFilter = ref<TaskStatus | null>(null);
const activeTagFilters = reactive(new Set<string>());
const showTagFilters = ref(false);

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

// Status filter definitions
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

// ── Create form (status always queued) ─────────────────────────────────

const showCreateForm = ref(false);
const titleInput = ref<HTMLInputElement | null>(null);
const newTaskTitle = ref('');
const newTaskPriority = ref<TaskPriority>('P2');
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
      status: 'queued', // Always queued for new items
      tags: tags.length > 0 ? tags : undefined,
    });
    // Reset form
    newTaskTitle.value = '';
    newTaskTagsRaw.value = '';
    newTaskPriority.value = 'P2';
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

// ── Formatters ──────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
          const clickTarget = el.querySelector('.flex.items-center.gap-2') as HTMLElement;
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

/* Heartbeat markdown content */
.heartbeat-content :deep(h1),
.heartbeat-content :deep(h2),
.heartbeat-content :deep(h3) {
  color: white;
  font-weight: 600;
  margin-top: 0.75rem;
  margin-bottom: 0.375rem;
}
.heartbeat-content :deep(h1) { font-size: 1rem; }
.heartbeat-content :deep(h2) { font-size: 0.875rem; }
.heartbeat-content :deep(h3) { font-size: 0.75rem; }
.heartbeat-content :deep(strong) { color: white; }
.heartbeat-content :deep(code) {
  color: #c084fc;
  font-size: 11px;
  background: rgba(41, 37, 36, 0.5);
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
}
.heartbeat-content :deep(blockquote) {
  border-left: 2px solid #57534e;
  padding-left: 0.75rem;
  color: #a8a29e;
  font-size: 0.75rem;
}
.heartbeat-content :deep(a) {
  color: #00e5ff;
  text-decoration: none;
}
.heartbeat-content :deep(a:hover) {
  text-decoration: underline;
}
.heartbeat-content :deep(ul) {
  padding-left: 1.25rem;
  list-style-type: disc;
}
.heartbeat-content :deep(li) {
  margin: 0.125rem 0;
}
.heartbeat-content :deep(hr) {
  border-color: #44403c;
  margin: 0.75rem 0;
}
</style>
