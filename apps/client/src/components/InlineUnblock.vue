<template>
  <div class="flex gap-2">
    <input
      v-model="response"
      type="text"
      placeholder="Type your response to unblock..."
      class="flex-1 px-3 py-2 text-sm rounded bg-stone-900/60 border border-stone-600/40 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-400/30"
      @keydown.enter="submit"
    />
    <button
      @click="submit"
      :disabled="!response.trim()"
      class="px-4 py-2 text-xs font-semibold rounded bg-stone-200 hover:bg-white disabled:bg-stone-700 disabled:text-stone-500 disabled:cursor-not-allowed text-stone-900 transition-colors"
    >
      Unblock
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{
  submit: [response: string];
}>();

const response = ref('');

function submit() {
  const val = response.value.trim();
  if (val) {
    emit('submit', val);
    response.value = '';
  }
}
</script>
