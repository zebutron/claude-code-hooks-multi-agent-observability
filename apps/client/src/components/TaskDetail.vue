<template>
  <div class="px-4 py-3 border-t border-stone-700/30 bg-stone-950/50 space-y-3" @click.stop>

    <!-- 1. Scores: FIT / IMPACT / URGENCY (good) then LENGTH / COST / RISK (bad) — all 0-9, dropdown picker -->
    <div class="flex justify-between text-xs items-center">
      <ScoreChip label="FIT" :value="task.fit_score" :high-is-good="true" @select="v => emitUpdate({ fit_score: v })" />
      <ScoreChip label="IMPACT" :value="task.roi_score" :high-is-good="true" @select="v => emitUpdate({ roi_score: v })" />
      <ScoreChip label="URGENCY" :value="task.urgent_score" :high-is-good="true" @select="v => emitUpdate({ urgent_score: v })" />
      <ScoreChip label="LENGTH" :value="task.time_score" :high-is-good="false" @select="v => emitUpdate({ time_score: v })" />
      <ScoreChip label="COST" :value="task.cost_score" :high-is-good="false" @select="v => emitUpdate({ cost_score: v })" />
      <ScoreChip label="RISK" :value="task.risk_score" :high-is-good="false" @select="v => emitUpdate({ risk_score: v })" />
    </div>

    <!-- 2. Tags (click to edit) -->
    <div class="flex items-center gap-2 min-w-0">
      <div class="flex items-center gap-1 min-w-0 overflow-hidden flex-1">
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
          @click.stop="startEditTags"
          class="flex gap-1 items-center cursor-pointer hover:bg-stone-800/50 rounded px-1 -mx-1 py-0.5 transition-colors min-w-0 overflow-hidden"
        >
          <span
            v-if="task.tags && task.tags.length"
            v-for="tag in task.tags"
            :key="tag"
            class="text-[9px] font-medium px-1.5 py-0.5 rounded bg-stone-700/60 text-stone-400 shrink-0 max-w-[80px] truncate"
          >{{ tag }}</span>
          <span v-else class="text-[9px] text-stone-600 italic shrink-0">+ tags</span>
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
          @click.stop="emitUpdate({ status: 'queued' })"
          class="px-3 py-1.5 text-xs font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors"
        >
          Approve &amp; Queue
        </button>
        <button
          @click.stop="$emit('reject')"
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
          @click.stop="$emit('archive')"
          class="px-3 py-1.5 text-xs font-medium rounded bg-green-600 hover:bg-green-500 text-white transition-colors"
        >
          Reviewed &amp; Archive
        </button>
        <button
          @click.stop="emitUpdate({ status: 'active' })"
          class="px-3 py-1.5 text-xs font-medium rounded bg-stone-700 hover:bg-stone-600 text-stone-200 transition-colors"
        >
          Reopen
        </button>
      </div>
    </div>

    <!-- 4. Goal (rationale) — click to edit -->
    <div @click.stop>
      <span class="text-[9px] font-bold text-stone-600 uppercase tracking-wider">Goal</span>
      <div v-if="editingRationale" class="mt-1">
        <textarea
          ref="rationaleInput"
          v-model="editRationaleValue"
          class="w-full px-2 py-1 text-xs rounded bg-stone-900 border border-stone-600 text-stone-200 italic focus:outline-none focus:border-stone-400 resize-none"
          placeholder="What outcome does this achieve..."
          rows="2"
          @keydown.escape="editingRationale = false"
          @keydown.enter.exact.prevent="saveRationale"
          @blur="saveRationale"
        />
      </div>
      <div
        v-else
        @click.stop="startEditRationale"
        class="text-xs italic cursor-pointer hover:bg-stone-800/50 rounded px-1 -mx-1 py-0.5 transition-colors mt-0.5"
        :class="task.rationale ? 'text-stone-300' : 'text-stone-600'"
      >
        {{ task.rationale || 'Add goal...' }}
      </div>
    </div>

    <!-- 5. Context (description) — click to edit -->
    <div @click.stop>
      <span class="text-[9px] font-bold text-stone-600 uppercase tracking-wider">Context</span>
      <div v-if="editingDescription" class="mt-1">
        <textarea
          ref="descriptionInput"
          v-model="editDescriptionValue"
          class="w-full px-2 py-1 text-xs rounded bg-stone-900 border border-stone-600 text-stone-200 focus:outline-none focus:border-stone-400 resize-none"
          placeholder="Why it matters, urgency, what surfaced it..."
          rows="3"
          @keydown.escape="editingDescription = false"
          @keydown.enter.exact.prevent="saveDescription"
          @blur="saveDescription"
        />
      </div>
      <div
        v-else
        @click.stop="startEditDescription"
        class="text-xs cursor-pointer hover:bg-stone-800/50 rounded px-1 -mx-1 py-0.5 transition-colors mt-0.5"
        :class="task.description ? 'text-stone-300' : 'text-stone-600'"
      >
        {{ task.description || 'Add context...' }}
      </div>
    </div>

    <!-- 6. Reqs (requirements) — click to edit -->
    <div @click.stop>
      <span class="text-[9px] font-bold text-stone-600 uppercase tracking-wider">Reqs</span>
      <div v-if="editingRequirements" class="mt-1">
        <textarea
          ref="requirementsInput"
          v-model="editRequirementsValue"
          class="w-full px-2 py-1 text-xs rounded bg-stone-900 border border-stone-600 text-stone-200 focus:outline-none focus:border-stone-400 resize-none"
          placeholder="Access needed, freedoms granted, risks to watch..."
          rows="3"
          @keydown.escape="editingRequirements = false"
          @keydown.enter.exact.prevent="saveRequirements"
          @blur="saveRequirements"
        />
      </div>
      <div
        v-else
        @click.stop="startEditRequirements"
        class="text-xs cursor-pointer hover:bg-stone-800/50 rounded px-1 -mx-1 py-0.5 transition-colors mt-0.5"
        :class="task.requirements ? 'text-stone-300' : 'text-stone-600'"
      >
        {{ task.requirements || 'Add reqs...' }}
      </div>
    </div>

    <!-- 7. AGENT — collapsible section -->
    <div class="bg-stone-900/60 border border-stone-700/40 rounded-lg overflow-hidden">
      <!-- AGENT header bar (always visible, click to expand) -->
      <div
        @click.stop="agentExpanded = !agentExpanded"
        class="flex items-center justify-center gap-2 px-3 py-2 cursor-pointer hover:bg-stone-800/40 transition-colors"
      >
        <!-- Running agent indicator -->
        <span v-if="runningAgent" class="w-1.5 h-1.5 rounded-full bg-[#39ff14] animate-pulse" />
        <span class="text-[11px] font-bold text-stone-300 uppercase tracking-widest">AGENT</span>
        <span class="text-[14px] text-stone-500 leading-none transition-transform" :class="agentExpanded ? 'rotate-180' : ''">▼</span>
        <span v-if="runningAgent" class="text-[10px] text-stone-500 ml-1">PID {{ runningAgent.pid }}</span>
      </div>

      <!-- AGENT expanded content -->
      <div v-if="agentExpanded" class="px-3 pb-3 space-y-2 border-t border-stone-700/30">
        <!-- Agent currently running -->
        <div v-if="runningAgent" class="space-y-2 pt-2">
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
            @click.stop="handleStopAgent"
            :disabled="stoppingAgent"
            class="px-3 py-1.5 text-xs font-medium rounded bg-red-950/60 border border-red-500/30 text-red-400 hover:bg-red-950 hover:border-red-500/50 transition-colors disabled:opacity-50"
          >
            {{ stoppingAgent ? 'Stopping...' : 'Stop Agent' }}
          </button>
        </div>

        <!-- No agent running — show SPAWN form -->
        <div v-else-if="task.status !== 'complete' && task.status !== 'archived'" class="pt-2 space-y-2">
          <div v-if="task.agent_session_id" class="text-[10px] text-stone-500">
            Previous: <span class="font-mono">{{ task.agent_session_id.slice(0, 12) }}...</span>
            <span v-if="task.last_agent_activity"> · {{ timeAgo(task.last_agent_activity) }}</span>
          </div>
          <input
            v-model="assignProjectDir"
            type="text"
            placeholder="Project dir (default: personal-os)"
            class="w-full px-2 py-1 text-xs rounded bg-stone-950 border border-stone-700/50 text-stone-300 placeholder-stone-600 focus:outline-none focus:border-stone-500"
            @click.stop
          />
          <div class="flex gap-2">
            <select v-model="assignModel" @click.stop class="px-2 py-1 text-[10px] rounded bg-stone-950 border border-stone-700/50 text-stone-300">
              <option value="opus">Opus 4</option>
              <option value="sonnet">Sonnet 4</option>
              <option value="haiku">Haiku 3.5</option>
            </select>
            <input
              v-model.number="assignMaxTurns"
              type="number"
              placeholder="Max turns"
              min="1"
              max="100"
              class="w-20 px-2 py-1 text-[10px] rounded bg-stone-950 border border-stone-700/50 text-stone-300 placeholder-stone-600 focus:outline-none"
              @click.stop
            />
          </div>
          <textarea
            v-model="assignScope"
            placeholder="Scope description (optional — what dirs/resources are in scope)"
            class="w-full px-2 py-1 text-xs rounded bg-stone-950 border border-stone-700/50 text-stone-300 placeholder-stone-600 focus:outline-none focus:border-stone-500 resize-none"
            rows="2"
            @click.stop
          />
          <textarea
            v-model="assignInstructions"
            placeholder="Additional instructions for the agent..."
            class="w-full px-2 py-1 text-xs rounded bg-stone-950 border border-stone-700/50 text-stone-300 placeholder-stone-600 focus:outline-none focus:border-stone-500 resize-none"
            rows="2"
            @click.stop
          />
          <div class="flex gap-2">
            <button
              @click.stop="handleAssign"
              :disabled="assigningAgent"
              class="px-4 py-1.5 text-xs font-bold rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 uppercase tracking-wider"
            >
              {{ assigningAgent ? 'Spawning...' : '⚡ SPAWN' }}
            </button>
          </div>
          <div v-if="assignError" class="text-[10px] text-red-400">{{ assignError }}</div>
        </div>

        <!-- Completed/archived — just show history -->
        <div v-else-if="task.agent_session_id" class="text-xs text-stone-500 pt-2">
          Completed by <span class="font-mono text-stone-400">{{ task.agent_session_id.slice(0, 12) }}...</span>
        </div>
        <div v-else class="text-xs text-stone-600 italic pt-2">No agent assigned</div>
      </div>
    </div>

    <!-- Activity log (notes) — reverse chronological -->
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

    <!-- Add note (does NOT close item on submit) -->
    <div class="flex gap-2" @click.stop>
      <input
        v-model="newNote"
        type="text"
        placeholder="Add a note..."
        class="flex-1 px-2 py-1 text-xs rounded bg-stone-900 border border-stone-700/50 text-stone-300 placeholder-stone-600 focus:outline-none focus:border-stone-500"
        @keydown.enter.stop="addNote"
      />
      <button
        v-if="newNote.trim()"
        @click.stop="addNote"
        class="px-2 py-1 text-[10px] font-medium rounded bg-stone-700 hover:bg-stone-600 text-stone-200 transition-colors"
      >
        Add
      </button>
    </div>

    <!-- BLOCKED button (full-width, between add note and footer) -->
    <div v-if="task.status !== 'blocked' && task.status !== 'complete' && task.status !== 'archived'" @click.stop>
      <button
        v-if="!showBlockConfirm"
        @click.stop="showBlockConfirm = true"
        class="w-full py-2 text-xs font-bold rounded-lg bg-stone-800 border border-stone-700/50 text-red-400 hover:bg-red-950/60 hover:border-red-500/40 transition-colors uppercase tracking-wider"
      >
        BLOCKED
      </button>
      <!-- Block confirmation panel (like reject) -->
      <div v-else class="rounded-lg border border-red-500/30 bg-red-950/30 p-3 space-y-2">
        <div class="text-xs font-semibold text-red-400">What's blocking this?</div>
        <textarea
          ref="blockReasonInput"
          v-model="blockReason"
          placeholder="Describe the blockage so agents can attempt to work around it..."
          class="w-full px-2 py-1.5 text-xs rounded bg-stone-900 border border-red-500/20 text-stone-200 placeholder-stone-600 focus:outline-none focus:border-red-400 resize-none"
          rows="3"
          @keydown.escape="cancelBlock"
          @keydown.enter.exact.prevent="confirmBlock"
        />
        <div class="flex gap-2">
          <button
            @click.stop="confirmBlock"
            :disabled="!blockReason.trim()"
            class="px-4 py-1.5 text-xs font-bold rounded bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-wider"
          >
            Confirm Block
          </button>
          <button
            @click.stop="cancelBlock"
            class="px-3 py-1.5 text-xs rounded bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Author + timestamps -->
    <div class="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-stone-500">
      <span>Author: {{ task.source }}</span>
      <span>Created: {{ formatDate(task.created_at) }}</span>
      <span>Updated: {{ formatDate(task.updated_at) }}</span>
      <span v-if="task.blocked_since">Blocked: {{ timeAgo(task.blocked_since) }}</span>
      <span v-if="task.completed_at">Completed: {{ formatDate(task.completed_at) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
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
  reject: [];
  done: [];
}>();

// Wrapper to emit update without bubbling causing collapse
function emitUpdate(updates: Partial<Task>) {
  emit('update', updates);
}

// ── Agent delegation ─────────────────────────────────────────────────

const { assignAgent, stopAgent: stopAgentFn, getAgentForTask } = useAgents();

const agentExpanded = ref(false);
const assignProjectDir = ref('');
const assignModel = ref('opus');
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
    emitUpdate({ tags: newTags } as any);
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
    emitUpdate({ rationale: val || undefined } as any);
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
    emitUpdate({ description: val || undefined } as any);
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
    emitUpdate({ requirements: val || undefined } as any);
  }
}

// ── Block confirmation ────────────────────────────────────────────────

const showBlockConfirm = ref(false);
const blockReason = ref('');
const blockReasonInput = ref<HTMLTextAreaElement | null>(null);

watch(showBlockConfirm, async (val) => {
  if (val) {
    blockReason.value = '';
    await nextTick();
    blockReasonInput.value?.focus();
  }
});

function confirmBlock() {
  const reason = blockReason.value.trim();
  if (!reason) return;
  // Add block note to activity stream
  const timestamp = new Date().toISOString();
  const noteEntry = `[${timestamp}] 🚫 BLOCKED: ${reason}`;
  const updatedNotes = props.task.notes
    ? noteEntry + '\n' + props.task.notes
    : noteEntry;
  emitUpdate({
    status: 'blocked',
    blocked_by: 'human_input',
    blocked_reason: reason,
    notes: updatedNotes,
  });
  showBlockConfirm.value = false;
  blockReason.value = '';
}

function cancelBlock() {
  showBlockConfirm.value = false;
  blockReason.value = '';
}

// ── Add note (does NOT close item) ──────────────────────────────────

const newNote = ref('');

function addNote() {
  const text = newNote.value.trim();
  if (!text) return;
  const timestamp = new Date().toISOString();
  const noteEntry = `[${timestamp}] ${text}`;
  // Prepend new note (reverse chronological)
  const updatedNotes = props.task.notes
    ? noteEntry + '\n' + props.task.notes
    : noteEntry;
  emitUpdate({ notes: updatedNotes });
  newNote.value = '';
}

// ── Notes parsing (already in reverse chronological from prepend) ────

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

