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

      <!-- Usage Meter + Sort (STACK tab only) -->
      <div v-if="activeTab === 'prio'" class="px-4 py-2 flex items-center gap-4">
        <UsageMeter :usage="usage" :claude-usage="claudeUsage" class="flex-1" />
        <select
          v-model="sortBy"
          class="px-2 py-0.5 text-[10px] rounded bg-stone-800 border border-stone-700/50 text-stone-400 focus:outline-none focus:border-stone-500 cursor-pointer"
        >
          <option value="status">Sort: Status</option>
          <option value="priority">Sort: Priority</option>
          <option value="created">Sort: Created</option>
          <option value="updated">Sort: Updated</option>
          <option value="fit_score">Sort: Fit</option>
          <option value="roi_score">Sort: Impact</option>
          <option value="urgent_score">Sort: Urgency</option>
          <option value="time_score">Sort: Length</option>
          <option value="cost_score">Sort: Cost</option>
          <option value="risk_score">Sort: Risk</option>
        </select>
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
        @reject="handleReject"
        @done="handleDone"
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

      <!-- Usage velocity timeseries -->
      <div class="px-4 pt-3 pb-2 border-b border-stone-800 bg-stone-900/50">
        <div class="h-16 flex items-end gap-px">
          <div
            v-for="(bar, i) in activityBars"
            :key="i"
            class="flex-1 rounded-t transition-all duration-300 relative group"
            :style="{ height: bar.height + '%', backgroundColor: bar.color }"
            :title="bar.label"
          >
            <!-- Tooltip on hover -->
            <div class="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-stone-800 rounded text-[8px] text-stone-300 whitespace-nowrap z-10 pointer-events-none">
              {{ bar.label }}
            </div>
          </div>
        </div>
        <div class="flex justify-between text-[8px] text-stone-600 mt-1">
          <span>6h ago</span>
          <span>Now</span>
        </div>
      </div>

      <!-- Agent list -->
      <div class="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        <!-- No agents -->
        <div v-if="allAgents.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
          <div class="text-4xl mb-3 opacity-40">🤖</div>
          <div class="text-sm text-stone-500 mb-1">No agents running</div>
          <div class="text-xs text-stone-600">Spawn an agent from a task's detail panel in STACK</div>
        </div>

        <!-- Agent cards -->
        <div
          v-for="agent in sortedAgents"
          :key="agent.pid"
          class="rounded-lg border overflow-hidden transition-all duration-200"
          :class="agentCardClass(agent)"
        >
          <!-- ── FAILED/BLOCKED ALERT BANNER ── -->
          <div
            v-if="agent.status === 'failed'"
            class="px-3 py-2 bg-[#ff2d6f]/15 border-b border-[#ff2d6f]/30 flex items-center gap-2"
          >
            <span class="text-sm">💥</span>
            <span class="text-[10px] font-bold text-[#ff2d6f] uppercase tracking-wider animate-pulse">FAILED</span>
            <span class="text-[10px] text-red-300 truncate flex-1">
              {{ agent.errors?.length ? agent.errors[agent.errors.length - 1] : `Exit code ${agent.exit_code}` }}
            </span>
          </div>
          <div
            v-else-if="agent.is_stalled"
            class="px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2"
          >
            <span class="text-sm">⚠️</span>
            <span class="text-[10px] font-bold text-amber-400 uppercase tracking-wider animate-pulse">STALLED</span>
            <span class="text-[10px] text-amber-300/70">No output for {{ stalledDuration(agent) }}</span>
          </div>

          <!-- ── Compact header row ── -->
          <div
            class="px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-stone-800/30 transition-colors"
            @click="toggleAgentExpand(agent.pid)"
          >
            <!-- Status dot -->
            <span class="w-2.5 h-2.5 rounded-full shrink-0" :class="agentDotClass(agent)" />

            <!-- Phase icon -->
            <span class="text-xs shrink-0" :title="agent.detected_phase">{{ phaseIcon(agent.detected_phase) }}</span>

            <!-- Task title + phase label -->
            <div class="min-w-0 flex-1">
              <div class="text-xs font-medium text-stone-200 truncate">{{ agent.task_title }}</div>
              <div class="text-[10px] text-stone-500 flex items-center gap-1.5">
                <span>{{ agent.model || 'default' }}</span>
                <span class="text-stone-700">·</span>
                <span>{{ agentRuntime(agent) }}</span>
                <span v-if="agent.detected_phase && agent.status === 'running'" class="text-stone-700">·</span>
                <span v-if="agent.detected_phase && agent.status === 'running'" class="text-stone-400 italic">{{ agent.detected_phase }}</span>
                <span v-if="agent.output_line_count > 0" class="text-stone-700">·</span>
                <span v-if="agent.output_line_count > 0" class="text-stone-600">{{ agent.output_line_count }} lines</span>
              </div>
            </div>

            <!-- Progress bar (if estimated) -->
            <div v-if="agent.estimated_duration_ms && agent.status === 'running'" class="w-16 shrink-0" :title="progressTooltip(agent)">
              <div class="h-1.5 rounded-full bg-stone-800 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-1000"
                  :class="progressBarColor(agent)"
                  :style="{ width: Math.min(100, agentProgress(agent)) + '%' }"
                />
              </div>
              <div class="text-[8px] text-stone-600 text-right mt-0.5">{{ progressLabel(agent) }}</div>
            </div>
            <!-- Activity indicator (if no estimate) -->
            <div v-else-if="agent.status === 'running'" class="shrink-0 flex items-center gap-1" :title="'Last output ' + lastOutputAgo(agent)">
              <span class="text-[8px] text-stone-600">{{ agentRuntime(agent) }}</span>
              <span
                class="w-1.5 h-1.5 rounded-full"
                :class="lastOutputRecent(agent) ? 'bg-[#39ff14] animate-pulse' : 'bg-stone-600'"
              />
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
              @click.stop="handleStopAgent(agent.pid)"
              class="shrink-0 px-2 py-1 text-[10px] font-medium rounded bg-red-950/60 border border-red-500/30 text-red-400 hover:bg-red-950 transition-colors"
            >
              Stop
            </button>

            <!-- Dismiss button (finished agents only — persists until human reviews) -->
            <button
              v-if="agent.status !== 'running'"
              @click.stop="handleDismissAgent(agent.pid)"
              class="shrink-0 px-2 py-1 text-[10px] font-medium rounded bg-stone-800/60 border border-stone-600/30 text-stone-400 hover:bg-stone-700 hover:text-stone-200 transition-colors"
              title="Dismiss this agent from the list"
            >
              Dismiss
            </button>

            <!-- Expand chevron -->
            <span class="text-stone-600 text-[10px] shrink-0 transition-transform" :class="{ 'rotate-90': expandedAgentPid === agent.pid }">▸</span>
          </div>

          <!-- ── Tool badges (always visible, compact) ── -->
          <div v-if="agent.tools_used?.length > 0 && agent.status === 'running'" class="px-3 pb-1.5 flex flex-wrap gap-1">
            <span
              v-for="tool in agent.tools_used"
              :key="tool"
              class="text-[8px] px-1.5 py-0.5 rounded bg-stone-800/80 text-stone-500 font-mono"
            >{{ tool }}</span>
          </div>

          <!-- ── Expanded detail panel ── -->
          <div v-if="expandedAgentPid === agent.pid" class="border-t border-stone-800/60">

            <!-- Phase timeline -->
            <div v-if="agent.progress_signals?.length > 0" class="px-3 py-2 border-b border-stone-800/40">
              <div class="text-[9px] font-bold text-stone-600 uppercase tracking-wider mb-1.5">Phase Timeline</div>
              <div class="flex flex-wrap gap-1">
                <div
                  v-for="(sig, i) in agent.progress_signals.slice(-12)"
                  :key="i"
                  class="flex items-center gap-1 text-[9px] text-stone-500"
                >
                  <span>{{ phaseIcon(sig.phase) }}</span>
                  <span class="text-stone-400">{{ sig.phase }}</span>
                  <span class="text-stone-700">{{ formatAgentTime(sig.timestamp, agent.started_at) }}</span>
                  <span v-if="i < agent.progress_signals.slice(-12).length - 1" class="text-stone-800">→</span>
                </div>
              </div>
            </div>

            <!-- Files touched -->
            <div v-if="agent.files_touched?.length > 0" class="px-3 py-2 border-b border-stone-800/40">
              <div class="text-[9px] font-bold text-stone-600 uppercase tracking-wider mb-1">Files ({{ agent.files_touched.length }})</div>
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="file in agent.files_touched.slice(-15)"
                  :key="file"
                  class="text-[9px] font-mono text-stone-500 bg-stone-800/60 px-1.5 py-0.5 rounded truncate max-w-[200px]"
                  :title="file"
                >{{ file.split('/').pop() }}</span>
              </div>
            </div>

            <!-- Errors (if any) -->
            <div v-if="agent.errors?.length > 0" class="px-3 py-2 border-b border-stone-800/40 bg-red-950/10">
              <div class="text-[9px] font-bold text-red-500/70 uppercase tracking-wider mb-1">Errors ({{ agent.errors.length }})</div>
              <div class="space-y-0.5">
                <div
                  v-for="(err, i) in agent.errors.slice(-5)"
                  :key="i"
                  class="text-[9px] font-mono text-red-400/70 leading-tight truncate"
                  :title="err"
                >{{ err }}</div>
              </div>
            </div>

            <!-- Output tail -->
            <div class="px-3 py-2 border-b border-stone-800/40">
              <div class="text-[9px] font-bold text-stone-600 uppercase tracking-wider mb-1">Output (last {{ Math.min(agent.output_tail?.length || 0, 20) }} lines)</div>
              <div class="max-h-40 overflow-y-auto rounded bg-black/30 p-2">
                <div
                  v-for="(line, i) in (agent.output_tail || []).slice(-20)"
                  :key="i"
                  class="text-[9px] font-mono leading-tight"
                  :class="isErrorLine(line) ? 'text-red-400/70' : 'text-stone-500'"
                >{{ line }}</div>
                <div v-if="!agent.output_tail?.length" class="text-[9px] text-stone-600 italic">No output yet...</div>
              </div>
            </div>

            <!-- Prompt summary (expandable) -->
            <div class="px-3 py-2">
              <button
                @click.stop="togglePromptExpand(agent.pid)"
                class="text-[9px] font-bold text-stone-600 uppercase tracking-wider hover:text-stone-400 transition-colors flex items-center gap-1"
              >
                <span class="transition-transform" :class="{ 'rotate-90': expandedPromptPid === agent.pid }">▸</span>
                Prompt Assigned
              </button>
              <div v-if="expandedPromptPid === agent.pid" class="mt-1.5 max-h-60 overflow-y-auto rounded bg-black/30 p-2">
                <pre class="text-[9px] font-mono text-stone-500 whitespace-pre-wrap leading-tight">{{ agentDetailCache[agent.pid]?.full_prompt || agent.prompt_summary + '...' }}</pre>
              </div>
            </div>
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
import type { Task, TaskPriority, TaskStatus, AgentInfo, AgentDetail } from '../types';
import { useTaskTree } from '../composables/useTaskTree';
import { useUsage } from '../composables/useUsage';
import { useAgents } from '../composables/useAgents';
import { useHeartbeat } from '../composables/useHeartbeat';
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
  rejectTask,
  reorderTask,
} = useTaskTree();

const { usage, claudeUsage, timeseries } = useUsage();
const { agents: allAgents, stats: agentStats, stopAgent: stopAgentFn, dismissAgent: dismissAgentFn, fetchAgentDetail } = useAgents();
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

// ── AGENTS: Activity chart ──────────────────────────────────────────

const activityBars = computed(() => {
  const data = timeseries.value;
  if (data.length === 0) {
    // Generate empty bars
    return Array.from({ length: 72 }, () => ({
      height: 2,
      color: '#1c1917',
      label: 'No data',
    }));
  }

  // Find max for normalization
  const maxTotal = Math.max(1, ...data.map(b => b.total));

  return data.map(bucket => {
    const pct = (bucket.total / maxTotal) * 100;
    const time = new Date(bucket.timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    const label = `${time}: ${bucket.total} events (${bucket.tool_uses} tools, ${bucket.sessions} sessions)`;

    // Color: green when active, dim when idle, bright when intense
    let color: string;
    if (bucket.total === 0) {
      color = '#1c1917'; // stone-950
    } else if (pct > 70) {
      color = '#39ff14'; // bright green — high activity
    } else if (pct > 30) {
      color = '#39ff1480'; // semi-transparent green
    } else {
      color = '#39ff1440'; // faint green
    }

    return {
      height: Math.max(2, pct), // min 2% so empty bars still show
      color,
      label,
    };
  });
});

// ── AGENTS: State & Helpers ──────────────────────────────────────────

const expandedAgentPid = ref<number | null>(null);
const expandedPromptPid = ref<number | null>(null);
const agentDetailCache = reactive<Record<number, AgentDetail>>({});

const sortedAgents = computed(() => {
  return [...allAgents.value].sort((a, b) => {
    // Failed/stalled first (attention needed), then running, then rest
    const attentionA = a.status === 'failed' || a.status === 'exhausted' || a.is_stalled ? 0 : 1;
    const attentionB = b.status === 'failed' || b.status === 'exhausted' || b.is_stalled ? 0 : 1;
    if (attentionA !== attentionB) return attentionA - attentionB;
    // Running before completed/stopped
    if (a.status === 'running' && b.status !== 'running') return -1;
    if (b.status === 'running' && a.status !== 'running') return 1;
    return b.started_at - a.started_at;
  });
});

function agentCardClass(agent: AgentInfo): string {
  if (agent.status === 'failed') return 'border-[#ff2d6f]/40 bg-red-950/20';
  if (agent.status === 'exhausted') return 'border-amber-500/30 bg-amber-950/10';
  if (agent.is_stalled) return 'border-amber-500/30 bg-amber-950/10';
  switch (agent.status) {
    case 'running': return 'border-[#39ff14]/20 bg-stone-900/60';
    case 'completed': return 'border-stone-800/50 bg-stone-900/30 opacity-70';
    case 'stopped': return 'border-stone-800/50 bg-stone-900/30 opacity-50';
    default: return 'border-stone-800/50 bg-stone-900/30';
  }
}

function agentDotClass(agent: AgentInfo): Record<string, boolean> {
  return {
    'bg-[#39ff14] animate-pulse': agent.status === 'running' && !agent.is_stalled,
    'bg-amber-400 animate-pulse': agent.status === 'running' && agent.is_stalled,
    'bg-[#39ff14]': agent.status === 'completed',
    'bg-amber-400': agent.status === 'exhausted',
    'bg-[#ff2d6f] animate-pulse': agent.status === 'failed',
    'bg-stone-600': agent.status === 'stopped',
  };
}

function agentStatusBadgeClass(agent: AgentInfo): string {
  if (agent.is_stalled && agent.status === 'running') return 'bg-amber-500/10 text-amber-400';
  switch (agent.status) {
    case 'running': return 'bg-[#39ff14]/10 text-[#39ff14]';
    case 'completed': return 'bg-stone-800 text-stone-400';
    case 'exhausted': return 'bg-amber-500/10 text-amber-400';
    case 'failed': return 'bg-[#ff2d6f]/15 text-[#ff2d6f]';
    case 'stopped': return 'bg-stone-800 text-stone-500';
    default: return 'bg-stone-800 text-stone-500';
  }
}

function agentRuntime(agent: AgentInfo): string {
  const elapsed = Date.now() - agent.started_at;
  const secs = Math.floor(elapsed / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

const PHASE_ICONS: Record<string, string> = {
  initializing: '🔄',
  reading: '📖',
  writing: '✏️',
  editing: '✏️',
  executing: '⚡',
  searching: '🔍',
  testing: '🧪',
  installing: '📦',
  building: '🔨',
  committing: '📤',
  planning: '🧠',
  stalled: '⏸️',
  done: '✅',
  failed: '💥',
};

function phaseIcon(phase: string): string {
  return PHASE_ICONS[phase] || '⚙️';
}

function agentProgress(agent: AgentInfo): number {
  if (!agent.estimated_duration_ms) return 0;
  const elapsed = Date.now() - agent.started_at;
  return (elapsed / agent.estimated_duration_ms) * 100;
}

function progressBarColor(agent: AgentInfo): string {
  const pct = agentProgress(agent);
  if (pct > 120) return 'bg-amber-500'; // over estimate
  if (pct > 90) return 'bg-[#39ff14]'; // near completion
  return 'bg-[#39ff14]/70';
}

function progressLabel(agent: AgentInfo): string {
  if (!agent.estimated_duration_ms) return '';
  const remaining = agent.estimated_duration_ms - (Date.now() - agent.started_at);
  if (remaining <= 0) return 'overdue';
  const mins = Math.ceil(remaining / 60000);
  if (mins < 1) return '<1m left';
  return `~${mins}m left`;
}

function progressTooltip(agent: AgentInfo): string {
  const elapsed = agentRuntime(agent);
  const estMins = agent.estimated_duration_ms ? Math.round(agent.estimated_duration_ms / 60000) : '?';
  return `Elapsed: ${elapsed} / Est: ${estMins}m`;
}

function lastOutputAgo(agent: AgentInfo): string {
  if (!agent.last_output_at) return 'never';
  const ago = Date.now() - agent.last_output_at;
  const secs = Math.floor(ago / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

function lastOutputRecent(agent: AgentInfo): boolean {
  if (!agent.last_output_at) return false;
  return (Date.now() - agent.last_output_at) < 10000; // within last 10s
}

function stalledDuration(agent: AgentInfo): string {
  const lastActivity = agent.last_output_at || agent.started_at;
  const ago = Date.now() - lastActivity;
  const mins = Math.floor(ago / 60000);
  if (mins < 1) return '<1m';
  return `${mins}m`;
}

function formatAgentTime(timestamp: number, startedAt: number): string {
  const offset = Math.round((timestamp - startedAt) / 1000);
  if (offset < 60) return `+${offset}s`;
  return `+${Math.floor(offset / 60)}m${offset % 60}s`;
}

function isErrorLine(line: string): boolean {
  return /\berror\b|\bfailed\b|\bexception\b/i.test(line);
}

async function toggleAgentExpand(pid: number) {
  if (expandedAgentPid.value === pid) {
    expandedAgentPid.value = null;
    expandedPromptPid.value = null;
  } else {
    expandedAgentPid.value = pid;
    expandedPromptPid.value = null;
    // Fetch full detail if not cached
    if (!agentDetailCache[pid]) {
      const detail = await fetchAgentDetail(pid);
      if (detail) {
        agentDetailCache[pid] = detail;
      }
    }
  }
}

async function togglePromptExpand(pid: number) {
  if (expandedPromptPid.value === pid) {
    expandedPromptPid.value = null;
  } else {
    expandedPromptPid.value = pid;
    // Ensure detail is loaded
    if (!agentDetailCache[pid]) {
      const detail = await fetchAgentDetail(pid);
      if (detail) {
        agentDetailCache[pid] = detail;
      }
    }
  }
}

async function handleStopAgent(pid: number) {
  try {
    await stopAgentFn(pid);
  } catch (e: any) {
    console.error('Failed to stop agent:', e);
  }
}

async function handleDismissAgent(pid: number) {
  try {
    await dismissAgentFn(pid);
    // Close detail panel if this agent was expanded
    if (expandedAgentPid.value === pid) {
      expandedAgentPid.value = null;
    }
  } catch (e: any) {
    console.error('Failed to dismiss agent:', e);
  }
}

// ── Expand state (single expanded item, auto-scroll) ─────────────────

const expandedTaskId = ref<string | null>(null);
// Edit session: UUID generated on expand, groups all edits during this expand cycle
let editSessionId: string | null = null;

function handleToggleExpand(id: string) {
  if (expandedTaskId.value === id) {
    // Collapsing — clear edit session
    expandedTaskId.value = null;
    editSessionId = null;
  } else {
    // Expanding — start new edit session, scroll with buffer
    expandedTaskId.value = id;
    editSessionId = crypto.randomUUID();
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
    { status: 'discovered' as TaskStatus, label: 'New', dotClass: 'bg-[#00e5ff]', count: counts['discovered'] || 0 },
    { status: 'active' as TaskStatus, label: 'Active', dotClass: 'bg-[#ffee00]', count: counts['active'] || 0 },
    { status: 'queued' as TaskStatus, label: 'Queued', dotClass: 'bg-[#c084fc]', count: counts['queued'] || 0 },
    { status: 'complete' as TaskStatus, label: 'Done', dotClass: 'bg-[#39ff14]', count: counts['complete'] || 0 },
  ].filter(f => f.count > 0);
});

// ── Sorting ────────────────────────────────────────────────────────────

type SortKey = 'status' | 'priority' | 'created' | 'updated'
  | 'roi_score' | 'fit_score' | 'time_score' | 'cost_score' | 'risk_score' | 'urgent_score';

const sortBy = ref<SortKey>('status');

const statusTier: Record<string, number> = {
  blocked: 0,
  discovered: 1,  // "New" — surface right after blocked so they get rated
  active: 2,
  queued: 3,
  complete: 4,
};

const priorityNum = (p: string): number => {
  const n = parseInt(p.slice(1));
  return isNaN(n) ? 5 : n;
};

const sortedTasks = computed(() => {
  return [...tasks.value].sort((a, b) => {
    switch (sortBy.value) {
      case 'status': {
        const aTier = statusTier[a.status] ?? 4;
        const bTier = statusTier[b.status] ?? 4;
        if (aTier !== bTier) return aTier - bTier;
        if (priorityNum(a.priority) !== priorityNum(b.priority))
          return priorityNum(a.priority) - priorityNum(b.priority);
        return a.sort_order - b.sort_order;
      }
      case 'priority':
        if (priorityNum(a.priority) !== priorityNum(b.priority))
          return priorityNum(a.priority) - priorityNum(b.priority);
        return a.sort_order - b.sort_order;
      case 'created':
        return a.created_at - b.created_at; // oldest first
      case 'updated':
        return a.updated_at - b.updated_at; // most stale first
      case 'roi_score':
      case 'fit_score':
      case 'time_score':
      case 'cost_score':
      case 'risk_score':
      case 'urgent_score':
        return (b[sortBy.value] ?? 0) - (a[sortBy.value] ?? 0); // highest first
      default:
        return a.sort_order - b.sort_order;
    }
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

// ── Create form (auto P0, status discovered/New) ──────────────────────

const showCreateForm = ref(false);
const titleInput = ref<HTMLInputElement | null>(null);
const newTaskTitle = ref('');

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

  try {
    await createTask({
      title,
      priority: 'P0' as TaskPriority,
      status: 'discovered',
    });
    newTaskTitle.value = '';
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
    await updateTask(id, updates, editSessionId || undefined);
  } catch (e: any) {
    console.error('Failed to update task:', e);
  }
}

async function handleArchive(id: string) {
  try {
    await archiveTask(id);
    // If archiving the expanded item, clear edit session
    if (expandedTaskId.value === id) {
      expandedTaskId.value = null;
      editSessionId = null;
    }
  } catch (e: any) {
    console.error('Failed to archive task:', e);
  }
}

/** Reject/delete a task — captures full snapshot + reason for alignment learning */
async function handleReject(id: string, reason: string) {
  try {
    await rejectTask(id, reason);
    // If rejecting the expanded item, clear edit session
    if (expandedTaskId.value === id) {
      expandedTaskId.value = null;
      editSessionId = null;
    }
  } catch (e: any) {
    console.error('Failed to reject task:', e);
  }
}

/** DONE = mark complete + archive in one step */
async function handleDone(id: string) {
  try {
    await updateTask(id, { status: 'complete' }, editSessionId || undefined);
    await archiveTask(id);
    // Clear edit session since item is gone
    if (expandedTaskId.value === id) {
      expandedTaskId.value = null;
      editSessionId = null;
    }
  } catch (e: any) {
    console.error('Failed to complete+archive task:', e);
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
