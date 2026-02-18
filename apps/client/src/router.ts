import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'timeline',
      component: () => import('./pages/Timeline.vue'),
    },
    {
      path: '/command',
      name: 'command',
      component: () => import('./pages/CommandCenter.vue'),
    },
  ],
});

export default router;
