<template>
  <div class="px-4 py-3 border-t border-stone-700/30 bg-stone-950/50 space-y-3">

    <!-- 1. Scores: IMPACT / TIME / COST / RISK / FIT — all 0-9, click-to-edit -->
    <div class="flex flex-wrap gap-2 sm:gap-3 text-xs">
      <ScoreChip label="IMPACT" :value="task.roi_score" @click="cycleScore('roi_score')" />
      <ScoreChip label="TIME" :value="task.time_score" @click="cycleScore('time_score')" />
      <ScoreChip label="COST" :value="task.cost_score" @click="cycleScore('cost_score')" />
      <ScoreChip label="RISK" :value="task.risk_score" @click="cycleScore('risk_score')" />
      <ScoreChip label="FIT" :value="task.fit_score" @click="cycleScore('fit_score')" />

      <!-- Quick status actions (right side) -->
      <div class="flex-1" />
      <div class="flex gap-1.5">
        <button
          v-if="task.status !== 'active' && task.status !== 'blocked' && task.status !== 'complete'"
          @click="$emit('update', { status: 'active' })"
          class="detail-action-btn"
          title="Start working on this"
        >
          ▶ Start
        </button>
        <button
          v-if="task.status === 'active'"
          @click="$emit('update', { status: 'complete' })"
          class="detail-action-btn"
          title="Mark as complete"
        >
          ✓ Done
        </button>
        <button
          v-if="task.status !== 'blocked' && task.status !== 'complete'"
          @click="setBlocked"
          class="detail-action-btn"
          title="Mark as blocked"
        >
          ⏸ Block
        </button>
      </div>
    </div>

    <!-- 2. Priority (dropdown) + Tags (click to edit) -->
    <div class="flex items-center gap-3 flex-wrap">
      <!-- Priority dropdown -->
      <div class="relative" ref="priorityDropdownRef">
        <button
          @click="showPriorityDropdown = !showPriorityDropdown"
          class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors hover:bg-stone-800/60"
          :class="priorityColor(task.priority)"
        >
          {{ task.priority }}
          <span class="text-[8px] text-stone-500">▼</span>
        </button>
        <div
          v-if="showPriorityDropdown"
          class="absolute top-full left-0 mt-1 z-20 bg-stone-800 border border-stone-700 rounded shadow-lg overflow-hidden"
        >
          <button
            v-for="p in ['P0','P1','P2','P3']"
            :key="p"
            @click="selectPriority(p)"
            class="block w-full text-left px-3 py-1 text-[10px] font-bold hover:bg-stone-700 transition-colors"
            :class="priorityColor(p)"
          >{{ p }}</button>
        </div>
      </div>

      <!-- Tags (click to edit) -->
      <div class="flex items-center gap-1 flex-1 min-w-0">
        <div v-if="editingTags" class="flex-1 flex gap-1.5" @click.stop>
          <input
            ref="tagsInput"
            v-model="editTagsValue"
            type="text"
            placeholder="comma,separated,tags"
            class="flex-1 px-2 py-0.5 text-[10px] rounded bg-stone-900 border border-stone-600 text-stone-300 focus:outline-none focus:border-stone-400"
            @keydown.enter="saveTags"
            @keydown.escape="editingTags = false"
            @blur="saveTags"
          />
        </div>
        <div
          v-else
          @click="startEditTags"
          class="flex gap-1 items-center cursor-pointer hover:bg-stone-800/50 rounded px-1 -mx-1 py-0.5 transition-colors min-w-0"
        >
          <span
            v-if="task.tags && task.tags.length"
            v-for="tag in task.tags"
            :key="tag"
            class="text-[9px] font-medium px-1.5 py-0.5 rounded bg-stone-700/60 text-stone-400"
          >{{ tag }}</span>
          <span v-else class="text-[9px] text-stone-600 italic">+ tags</span>
        </div>
      </div>
    </div>

    <!-- 3. BLOCKED alert + inline unblock -->
    <div v-if="task.blocked_by === 'human_input'" class="bg-red-950/40 border border-red-500/30 rounded-lg p-3">
      <div class="text-xs font-semibold text-[#ff2d6f] mb-1">BLOCKED</div>
      <div class="text-sm text-stone-300 mb-2">{{ task.blocked_reason }}</div>
      <InlineUnblock @submit="$emit('unblock', $event)" />
    </div>

    <div v-else-if="task.blocked_by" class="bg-amber-950/30 border border-amber-500/30 rounded-lg p-3">
      <div class="text-xs font-semibold text-amber-400">
        {{ task.blocked_by === 'dependency' ? 'Blocked: dependency' : 'Blocked: resource' }}
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
      <div class="text-xs text-stone-300 mb-2">Completed — review and clear</div>
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

    <!-- 4. Goal (rationale) — click to edit -->
    <div>
      <span class="text-[9px] font-bold text-stone-600 uppercase tracking-wider">Goal</span>
      <div v-if="editingRationale" class="mt-1" @click.stop>
        <textarea
          ref="rationaleInput"
          v-model="editRationaleValue"
          class="w-full px-2 py-1 text-xs rounded bg-stone-900 border border-stone-600 text-stone-200 italic focus:outline-none focus:border-stone-400 resize-none"
          placeholder="What outcome does this achieve..."
          rows="2"
          @keydown.escape="editingRationale = false"
          @blur="saveRationale"
        />
      </div>
      <div
        v-else
        @click="startEditRationale"
        class="text-xs italic cursor-pointer hover:bg-stone-800/50 rounded px-1 -mx-1 py-0.5 transition-colors mt-0.5"
        :class="task.rationale ? 'text-stone-300' : 'text-stone-600'"
      >
        {{ task.rationale || 'Add goal...' }}
      </div>
    </div>

    <!-- 5. Context (description) — click to edit -->
    <div>
      <span class="text-[9px] font-bold text-stone-600 uppercase tracking-wider">Context</span>
      <div v-if="editingDescription" class="mt-1" @click.stop>
        <textarea
          ref="descriptionInput"
          v-model="editDescriptionValue"
          class="w-full px-2 py-1 text-xs rounded bg-stone-900 border border-stone-600 text-stone-200 focus:outline-none focus:border-stone-400 resize-none"
          placeholder="Why it matters, urgency, what surfaced it..."
          rows="3"
          @keydown.escape="editingDescription = false"
          @blur="saveDescription"
        />
      </div>
      <div
        v-else
        @click="startEditDescription"
        class="text-xs cursor-pointer hover:bg-stone-800/50 rounded px-1 -mx-1 py-0.5 transition-colors mt-0.5"
        :class="task.description ? 'text-stone-300' : 'text-stone-600'"
      >
        {{ task.description || 'Add context...' }}
      </div>
    </div>

    <!-- 6. Reqs (requirements) — click to edit -->
    <div>
      <span class="text-[9px] font-bold text-stone-600 uppercase tracking-wider">Reqs</span>
      <div v-if="editingRequirements" class="mt-1" @click.stop>
        <textarea
          ref="requirementsInput"
          v-model="editRequirementsValue"
          class="w-full px-2 py-1 text-xs rounded bg-stone-900 border border-stone-600 text-stone-200 focus:outline-none focus:border-stone-400 resize-none"
          placeholder="Access needed, freedoms granted, risks to watch..."
          rows="3"
          @keydown.escape="editingRequirements = false"
          @blur="saveRequirements"
        />
      </div>
      <div
        v-else
        @click="startEditRequirements"
        class="text-xs cursor-pointer hover:bg-stone-800/50 rounded px-1 -mx-1 py-0.5 transition-colors mt-0.5"
        :class="task.requirements ? 'text-stone-300' : 'text-stone-600'"
      >
        {{ task.requirements || 'Add reqs...' }}
      </div>
    </div>

    <!-- 7. Agent delegation — SPAWN -->
    <div class="bg-stone-900/60 border border-stone-700/40 rounded-lg p-3 space-y-2">
      <div class="flex items-center justify-between">
        <div class="text-[9px] font-bold text-stone-600 uppercase tracking-wider">Agent</div>
        <!-- Running agent indicator -->
        <div v-if="runningAgent" class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-[#39ff14] animate-pulse" />
          <span class="text-[10px] text-stone-400">PID {{ runningAgent.pid }}</span>
        </div>
      </div>

      <!-- Agent currently running -->
      <div v-if="runningAgent" class="space-y-2">
        <div class="text-xs text-stone-300">
          Running in <span class="font-mono text-stone-400">{{ runningAgent.project_dir.split('/').slice(-2).join('/') }}</span>
          <span v-if="runningAgent.model" class="text-stone-500"> · {{ runningAgent.model }}</span>
        </div>
        <div v-if="task.last_agent_activity" class="text-[10px] text-stone-500">
          Last active {{ timeAgo(task.last_agent_activity) }}
        </div>
        <!-- Output tail (last few lines) -->
        <div v-if="runningAgent.output_tail.length" class="max-h-24 overflow-y-auto rounded bg-black/30 p-2">
          <div
            v-for="(line, i) in runningAgent.output_tail.slice(-8)"
            :key="i"
            class="text-[10px] font-mono text-stone-400 leading-tight"
          >{{ line }}</div>
        </div>
        <button
          @click="handleStopAgent"
          :disabled="stoppingAgent"
          class="px-3 py-1.5 text-xs font-medium rounded bg-red-950/60 border border-red-500/30 text-red-400 hover:bg-red-950 hover:border-red-500/50 transition-colors disabled:opacity-50"
        >
          {{ stoppingAgent ? 'Stopping...' : 'Stop Agent' }}
        </button>
      </div>

      <!-- No agent running — show SPAWN button -->
      <div v-else-if="task.status !== 'complete' && task.status !== 'archived'">
        <div v-if="task.agent_session_id" class="text-[10px] text-stone-500 mb-1.5">
          Previous: <span class="font-mono">{{ task.agent_session_id.slice(0, 12) }}...</span>
          <span v-if="task.last_agent_activity"> · {{ timeAgo(task.last_agent_activity) }}</span>
        </div>
        <!-- SPAWN form -->
        <div v-if="showAssignForm" class="space-y-2">
          <input
            v-model="assignProjectDir"
            type="text"
            placeholder="Project dir (default: personal-os)"
            class="w-full px-2 py-1 text-xs rounded bg-stone-950 border border-stone-700/50 text-stone-300 placeholder-stone-600 focus:outline-none focus:border-stone-500"
          />
          <div class="flex gap-2">
            <select v-model="assignModel" class="px-2 py-1 text-[10px] rounded bg-stone-950 border border-stone-700/50 text-stone-300">
              <option value="">Default model</option>
              <option value="sonnet">Sonnet</option>
              <option value="opus">Opus</option>
              <option value="haiku">Haiku</option>
            </select>
            <input
              v-model.number="assignMaxTurns"
              type="number"
              placeholder="Max turns"
              min="1"
              max="100"
              class="w-20 px-2 py-1 text-[10px] rounded bg-stone-950 border border-stone-700/50 text-stone-300 placeholder-stone-600 focus:outline-none"
            />
          </div>
          <textarea
            v-model="assignScope"
            placeholder="Scope description (optional — what dirs/resources are in scope)"
            class="w-full px-2 py-1 text-xs rounded bg-stone-950 border border-stone-700/50 text-stone-300 placeholder-stone-600 focus:outline-none focus:border-stone-500 resize-none"
            rows="2"
          />
          <textarea
            v-model="assignInstructions"
            placeholder="Additional instructions for the agent..."
            class="w-full px-2 py-1 text-xs rounded bg-stone-950 border border-stone-700/50 text-stone-300 placeholder-stone-600 focus:outline-none focus:border-stone-500 resize-none"
            rows="2"
          />
          <div class="flex gap-2">
            <button
              @click="handleAssign"
              :disabled="assigningAgent"
              class="px-4 py-1.5 text-xs font-bold rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 uppercase tracking-wider"
            >
              {{ assigningAgent ? 'Spawning...' : '⚡ SPAWN' }}
            </button>
            <button
              @click="showAssignForm = false"
              class="px-3 py-1.5 text-xs font-medium rounded bg-stone-700 hover:bg-stone-600 text-stone-200 transition-colors"
            >
              Cancel
            </button>
          </div>
          <div v-if="assignError" class="text-[10px] text-red-400">{{ assignError }}</div>
        </div>
        <!-- Simple SPAWN button -->
        <button
          v-else
          @click="showAssignForm = true"
          class="px-4 py-1.5 text-xs font-bold rounded bg-stone-800 border border-stone-700/50 text-stone-300 hover:bg-stone-700 hover:text-stone-100 transition-colors uppercase tracking-wider"
        >
          ⚡ SPAWN
        </button>
      </div>

      <!-- Completed/archived — just show history -->
      <div v-else-if="task.agent_session_id" class="text-xs text-stone-500">
        Completed by <span class="font-mono text-stone-400">{{ task.agent_session_id.slice(0, 12) }}...</span>
      </div>
      <div v-else class="text-xs text-stone-600 italic">No agent assigned</div>
    </div>

    <!-- Activity log (notes) -->
    <div v-if="task.notes" class="rounded-lg overflow-hidden">
      <div class="text-[9px] font-bold text-stone-600 uppercase tracking-wider mb-1">Activity</div>
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

    <!-- Add note -->
    <div class="flex gap-2">
      <input
        v-model="newNote"
        type="text"
        placeholder="Add a note..."
        class="flex-1 px-2 py-1 text-xs rounded bg-stone-900 border border-stone-700/50 text-stone-300 placeholder-stone-600 focus:outline-none focus:border-stone-500"
        @keydown.enter="addNote"
      />
      <button
        v-if="newNote.trim()"
        @click="addNote"
        class="px-2 py-1 text-[10px] font-medium rounded bg-stone-700 hover:bg-stone-600 text-stone-200 transition-colors"
      >
        Add
      </button>
    </div>

    <!-- Author + timestamps -->
    <div class="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-stone-500">
      <span>Author: {{ task.source }}</span>
      <span>Created: {{ formatDate(task.created_at) }}</span>
      <span v-if="task.blocked_since">Blocked: {{ timeAgo(task.blocked_since) }}</span>
      <span v-if="task.completed_at">Completed: {{ formatDate(task.completed_at) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import type { Task, AgentInfo } from '../types';
import InlineUnblock from './InlineUnblock.vue';
import ScoreChip from './ScoreChip.vue';
import { useAgents } from '../composables/useAgents';

const props = defineProps<{
  task: Task;
}>();

const emit = defineEmits<{
  unblock: [response: string];
  update: [updates: Partial<Task>];
  archive: [];
}>();

// ── Agent delegation ─────────────────────────────────────────────────

const { assignAgent, stopAgent: stopAgentFn, getAgentForTask } = useAgents();

const showAssignForm = ref(false);
const assignProjectDir = ref('');
const assignModel = ref('');
const assignMaxTurns = ref<number | undefined>(undefined);
const assignScope = ref('');
const assignInstructions = ref('');
const assigningAgent = ref(false);
const stoppingAgent = ref(false);
const assignError = ref('');

const runningAgent = computed((): AgentInfo | undefined => {
  return getAgentForTask(props.task.id);
});

async function handleAssign() {
  assigningAgent.value = true;
  assignError.value = '';
  try {
    await assignAgent(props.task.id, {
      project_dir: assignProjectDir.value.trim() || undefined,
      model: assignModel.value || undefined,
      max_turns: assignMaxTurns.value || undefined,
      scope_description: assignScope.value.trim() || undefined,
      additional_instructions: assignInstructions.value.trim() || undefined,
    });
    showAssignForm.value = false;
    assignProjectDir.value = '';
    assignModel.value = '';
    assignMaxTurns.value = undefined;
    assignScope.value = '';
    assignInstructions.value = '';
  } catch (e: any) {
    assignError.value = e.message || 'Failed to spawn agent';
  } finally {
    assigningAgent.value = false;
  }
}

async function handleStopAgent() {
  const agent = runningAgent.value;
  if (!agent) return;
  stoppingAgent.value = true;
  try {
    await stopAgentFn(agent.pid);
  } catch (e: any) {
    console.error('Failed to stop agent:', e);
  } finally {
    stoppingAgent.value = false;
  }
}

// ── Priority dropdown ────────────────────────────────────────────────

const showPriorityDropdown = ref(false);
const priorityDropdownRef = ref<HTMLElement | null>(null);

function selectPriority(p: string) {
  showPriorityDropdown.value = false;
  if (p !== props.task.priority) {
    emit('update', { priority: p } as any);
  }
}

function priorityColor(p: string): string {
  switch (p) {
    case 'P0': return 'text-red-400';
    case 'P1': return 'text-amber-400';
    case 'P2': return 'text-stone-300';
    case 'P3': return 'text-stone-500';
    default: return 'text-stone-300';
  }
}

// Close priority dropdown on outside click
function handleClickOutside(e: MouseEvent) {
  if (priorityDropdownRef.value && !priorityDropdownRef.value.contains(e.target as Node)) {
    showPriorityDropdown.value = false;
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside));
onUnmounted(() => document.removeEventListener('click', handleClickOutside));

// ── Inline editing: Tags ─────────────────────────────────────────────

const editingTags = ref(false);
const editTagsValue = ref('');
const tagsInput = ref<HTMLInputElement | null>(null);

async function startEditTags() {
  editTagsValue.value = (props.task.tags || []).join(', ');
  editingTags.value = true;
  await nextTick();
  tagsInput.value?.focus();
}

function saveTags() {
  editingTags.value = false;
  const newTags = editTagsValue.value.split(',').map(t => t.trim()).filter(t => t.length > 0);
  const oldTags = (props.task.tags || []).join(',');
  if (newTags.join(',') !== oldTags) {
    emit('update', { tags: newTags } as any);
  }
}

// ── Inline editing: Rationale (Goal) ─────────────────────────────────

const editingRationale = ref(false);
const editRationaleValue = ref('');
const rationaleInput = ref<HTMLTextAreaElement | null>(null);

async function startEditRationale() {
  editRationaleValue.value = props.task.rationale || '';
  editingRationale.value = true;
  await nextTick();
  rationaleInput.value?.focus();
}

function saveRationale() {
  editingRationale.value = false;
  const val = editRationaleValue.value.trim();
  if (val !== (props.task.rationale || '')) {
    emit('update', { rationale: val || undefined } as any);
  }
}

// ── Inline editing: Description (Context) ────────────────────────────

const editingDescription = ref(false);
const editDescriptionValue = ref('');
const descriptionInput = ref<HTMLTextAreaElement | null>(null);

async function startEditDescription() {
  editDescriptionValue.value = props.task.description || '';
  editingDescription.value = true;
  await nextTick();
  descriptionInput.value?.focus();
}

function saveDescription() {
  editingDescription.value = false;
  const val = editDescriptionValue.value.trim();
  if (val !== (props.task.description || '')) {
    emit('update', { description: val || undefined } as any);
  }
}

// ── Inline editing: Requirements (Reqs) ──────────────────────────────

const editingRequirements = ref(false);
const editRequirementsValue = ref('');
const requirementsInput = ref<HTMLTextAreaElement | null>(null);

async function startEditRequirements() {
  editRequirementsValue.value = props.task.requirements || '';
  editingRequirements.value = true;
  await nextTick();
  requirementsInput.value?.focus();
}

function saveRequirements() {
  editingRequirements.value = false;
  const val = editRequirementsValue.value.trim();
  if (val !== (props.task.requirements || '')) {
    emit('update', { requirements: val || undefined } as any);
  }
}

// ── Score cycling (0-9 loop) ─────────────────────────────────────────

function cycleScore(field: string) {
  const current = (props.task as any)[field] ?? 0;
  const next = current >= 9 ? 0 : current + 1;
  emit('update', { [field]: next } as any);
}

// ── Quick block ──────────────────────────────────────────────────────

function setBlocked() {
  const reason = prompt('What is blocking this task?');
  if (reason) {
    emit('update', {
      status: 'blocked',
      blocked_by: 'human_input',
      blocked_reason: reason,
    });
  }
}

// ── Add note ─────────────────────────────────────────────────────────

const newNote = ref('');

function addNote() {
  const text = newNote.value.trim();
  if (!text) return;
  const timestamp = new Date().toISOString();
  const noteEntry = `[${timestamp}] ${text}`;
  const updatedNotes = props.task.notes
    ? props.task.notes + '\n' + noteEntry
    : noteEntry;
  emit('update', { notes: updatedNotes });
  newNote.value = '';
}

// ── Notes parsing ────────────────────────────────────────────────────

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

// ── Formatters ───────────────────────────────────────────────────────

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

<style scoped>
.detail-action-btn {
  @apply px-2 py-0.5 text-[10px] font-medium rounded
    bg-stone-800 text-stone-400 border border-stone-700/50
    hover:bg-stone-700 hover:text-stone-200
    transition-colors;
}
</style>
