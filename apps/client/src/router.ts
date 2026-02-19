import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/command',
    },
    {
      path: '/command',
      name: 'command',
      component: () => import('./pages/CommandCenter.vue'),
    },
    {
      path: '/timeline',
      name: 'timeline',
      component: () => import('./pages/Timeline.vue'),
    },
  ],
});

export default router;
