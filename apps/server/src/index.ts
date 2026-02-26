import { initDatabase, insertEvent, getFilterOptions, getRecentEvents, updateEventHITLResponse } from './db';
import type { HookEvent, HumanInTheLoopResponse } from './types';
import {
  createTheme,
  updateThemeById,
  getThemeById,
  searchThemes,
  deleteThemeById,
  exportThemeById,
  importTheme,
  getThemeStats
} from './theme';
import {
  createTask,
  getTask,
  getTaskWithChildren,
  getRootTasks,
  getBlockedTasks,
  updateTask,
  reorderTask,
  unblockTask,
  archiveTask,
  getUsageSummary,
  handleHookEvent,
  type TaskCreate,
  type TaskUpdate,
} from './tasks';
import { generateDigest, digestToMarkdown, digestToSlack } from './digest';
import {
  initResourceDB,
  acquireResource,
  heartbeatResource,
  releaseResource,
  getAllResourceState,
  registerResource,
} from './resources';
import {
  spawnAgent,
  listAgents,
  getAgent,
  stopAgent,
  cleanupFinishedAgents,
  getAgentStats,
  type SpawnOptions,
} from './agents';

// Initialize database
initDatabase();

// Initialize resource lock system (uses same DB file path pattern)
import { Database } from 'bun:sqlite';
const resourceDb = new Database('events.db');
initResourceDB(resourceDb);

// Store WebSocket clients
const wsClients = new Set<any>();

// Helper function to send response to agent via WebSocket
async function sendResponseToAgent(
  wsUrl: string,
  response: HumanInTheLoopResponse
): Promise<void> {
  console.log(`[HITL] Connecting to agent WebSocket: ${wsUrl}`);

  return new Promise((resolve, reject) => {
    let ws: WebSocket | null = null;
    let isResolved = false;

    const cleanup = () => {
      if (ws) {
        try {
          ws.close();
        } catch (e) {
          // Ignore close errors
        }
      }
    };

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (isResolved) return;
        console.log('[HITL] WebSocket connection opened, sending response...');

        try {
          ws!.send(JSON.stringify(response));
          console.log('[HITL] Response sent successfully');

          // Wait longer to ensure message fully transmits before closing
          setTimeout(() => {
            cleanup();
            if (!isResolved) {
              isResolved = true;
              resolve();
            }
          }, 500);
        } catch (error) {
          console.error('[HITL] Error sending message:', error);
          cleanup();
          if (!isResolved) {
            isResolved = true;
            reject(error);
          }
        }
      };

      ws.onerror = (error) => {
        console.error('[HITL] WebSocket error:', error);
        cleanup();
        if (!isResolved) {
          isResolved = true;
          reject(error);
        }
      };

      ws.onclose = () => {
        console.log('[HITL] WebSocket connection closed');
      };

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!isResolved) {
          console.error('[HITL] Timeout sending response to agent');
          cleanup();
          isResolved = true;
          reject(new Error('Timeout sending response to agent'));
        }
      }, 5000);

    } catch (error) {
      console.error('[HITL] Error creating WebSocket:', error);
      cleanup();
      if (!isResolved) {
        isResolved = true;
        reject(error);
      }
    }
  });
}

// Create Bun server with HTTP and WebSocket support
const server = Bun.serve({
  port: parseInt(process.env.SERVER_PORT || '4000'),
  
  async fetch(req: Request) {
    const url = new URL(req.url);
    
    // Handle CORS
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers });
    }
    
    // POST /events - Receive new events
    if (url.pathname === '/events' && req.method === 'POST') {
      try {
        const event: HookEvent = await req.json();
        
        // Validate required fields
        if (!event.source_app || !event.session_id || !event.hook_event_type || !event.payload) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        
        // Insert event into database
        const savedEvent = insertEvent(event);

        // Auto-update tasks and usage from hook events
        try {
          const payloadStr = JSON.stringify(event.payload);
          handleHookEvent(event.session_id, event.hook_event_type, payloadStr.length);
        } catch {
          // Don't fail event ingestion if task update fails
        }

        // Broadcast to all WebSocket clients
        const message = JSON.stringify({ type: 'event', data: savedEvent });
        wsClients.forEach(client => {
          try {
            client.send(message);
          } catch (err) {
            // Client disconnected, remove from set
            wsClients.delete(client);
          }
        });
        
        return new Response(JSON.stringify(savedEvent), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error processing event:', error);
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // GET /events/filter-options - Get available filter options
    if (url.pathname === '/events/filter-options' && req.method === 'GET') {
      const options = getFilterOptions();
      return new Response(JSON.stringify(options), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // GET /events/recent - Get recent events
    if (url.pathname === '/events/recent' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '300');
      const events = getRecentEvents(limit);
      return new Response(JSON.stringify(events), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /events/:id/respond - Respond to HITL request
    if (url.pathname.match(/^\/events\/\d+\/respond$/) && req.method === 'POST') {
      const id = parseInt(url.pathname.split('/')[2]);

      try {
        const response: HumanInTheLoopResponse = await req.json();
        response.respondedAt = Date.now();

        // Update event in database
        const updatedEvent = updateEventHITLResponse(id, response);

        if (!updatedEvent) {
          return new Response(JSON.stringify({ error: 'Event not found' }), {
            status: 404,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        // Send response to agent via WebSocket
        if (updatedEvent.humanInTheLoop?.responseWebSocketUrl) {
          try {
            await sendResponseToAgent(
              updatedEvent.humanInTheLoop.responseWebSocketUrl,
              response
            );
          } catch (error) {
            console.error('Failed to send response to agent:', error);
            // Don't fail the request if we can't reach the agent
          }
        }

        // Broadcast updated event to all connected clients
        const message = JSON.stringify({ type: 'event', data: updatedEvent });
        wsClients.forEach(client => {
          try {
            client.send(message);
          } catch (err) {
            wsClients.delete(client);
          }
        });

        return new Response(JSON.stringify(updatedEvent), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error processing HITL response:', error);
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // Theme API endpoints
    
    // POST /api/themes - Create a new theme
    if (url.pathname === '/api/themes' && req.method === 'POST') {
      try {
        const themeData = await req.json();
        const result = await createTheme(themeData);
        
        const status = result.success ? 201 : 400;
        return new Response(JSON.stringify(result), {
          status,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error creating theme:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Invalid request body' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // GET /api/themes - Search themes
    if (url.pathname === '/api/themes' && req.method === 'GET') {
      const query = {
        query: url.searchParams.get('query') || undefined,
        isPublic: url.searchParams.get('isPublic') ? url.searchParams.get('isPublic') === 'true' : undefined,
        authorId: url.searchParams.get('authorId') || undefined,
        sortBy: url.searchParams.get('sortBy') as any || undefined,
        sortOrder: url.searchParams.get('sortOrder') as any || undefined,
        limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined,
        offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : undefined,
      };
      
      const result = await searchThemes(query);
      return new Response(JSON.stringify(result), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // GET /api/themes/:id - Get a specific theme
    if (url.pathname.startsWith('/api/themes/') && req.method === 'GET') {
      const id = url.pathname.split('/')[3];
      if (!id) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Theme ID is required' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      const result = await getThemeById(id);
      const status = result.success ? 200 : 404;
      return new Response(JSON.stringify(result), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // PUT /api/themes/:id - Update a theme
    if (url.pathname.startsWith('/api/themes/') && req.method === 'PUT') {
      const id = url.pathname.split('/')[3];
      if (!id) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Theme ID is required' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      try {
        const updates = await req.json();
        const result = await updateThemeById(id, updates);
        
        const status = result.success ? 200 : 400;
        return new Response(JSON.stringify(result), {
          status,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error updating theme:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Invalid request body' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // DELETE /api/themes/:id - Delete a theme
    if (url.pathname.startsWith('/api/themes/') && req.method === 'DELETE') {
      const id = url.pathname.split('/')[3];
      if (!id) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Theme ID is required' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      const authorId = url.searchParams.get('authorId');
      const result = await deleteThemeById(id, authorId || undefined);
      
      const status = result.success ? 200 : (result.error?.includes('not found') ? 404 : 403);
      return new Response(JSON.stringify(result), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // GET /api/themes/:id/export - Export a theme
    if (url.pathname.match(/^\/api\/themes\/[^\/]+\/export$/) && req.method === 'GET') {
      const id = url.pathname.split('/')[3];
      
      const result = await exportThemeById(id);
      if (!result.success) {
        const status = result.error?.includes('not found') ? 404 : 400;
        return new Response(JSON.stringify(result), {
          status,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify(result.data), {
        headers: { 
          ...headers, 
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${result.data.theme.name}.json"`
        }
      });
    }
    
    // POST /api/themes/import - Import a theme
    if (url.pathname === '/api/themes/import' && req.method === 'POST') {
      try {
        const importData = await req.json();
        const authorId = url.searchParams.get('authorId');
        
        const result = await importTheme(importData, authorId || undefined);
        
        const status = result.success ? 201 : 400;
        return new Response(JSON.stringify(result), {
          status,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error importing theme:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Invalid import data' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // GET /api/themes/stats - Get theme statistics
    if (url.pathname === '/api/themes/stats' && req.method === 'GET') {
      const result = await getThemeStats();
      return new Response(JSON.stringify(result), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // ── Command Center: Task API ─────────────────────────────────────────

    // GET /tasks - List root tasks (add ?children=true for full tree)
    if (url.pathname === '/tasks' && req.method === 'GET') {
      const includeChildren = url.searchParams.get('children') === 'true';
      const tasks = getRootTasks(includeChildren);
      return new Response(JSON.stringify(tasks), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /tasks/blocked - Blocked tasks sorted by priority + ROI
    if (url.pathname === '/tasks/blocked' && req.method === 'GET') {
      const tasks = getBlockedTasks();
      return new Response(JSON.stringify(tasks), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /tasks/:id - Single task with children
    if (url.pathname.match(/^\/tasks\/[^\/]+$/) && req.method === 'GET') {
      const id = url.pathname.split('/')[2];
      const task = getTaskWithChildren(id);
      if (!task) {
        return new Response(JSON.stringify({ error: 'Task not found' }), {
          status: 404,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify(task), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /tasks - Create task
    if (url.pathname === '/tasks' && req.method === 'POST') {
      try {
        const input: TaskCreate = await req.json();
        if (!input.title) {
          return new Response(JSON.stringify({ error: 'title is required' }), {
            status: 400,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        const task = createTask(input);

        // Broadcast to WebSocket clients
        const message = JSON.stringify({ type: 'task_update', data: task });
        wsClients.forEach(client => {
          try { client.send(message); } catch { wsClients.delete(client); }
        });

        return new Response(JSON.stringify(task), {
          status: 201,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // PUT /tasks/:id - Update task
    if (url.pathname.match(/^\/tasks\/[^\/]+$/) && req.method === 'PUT') {
      const id = url.pathname.split('/')[2];
      try {
        const updates: TaskUpdate = await req.json();
        const task = updateTask(id, updates);
        if (!task) {
          return new Response(JSON.stringify({ error: 'Task not found' }), {
            status: 404,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        const message = JSON.stringify({ type: 'task_update', data: task });
        wsClients.forEach(client => {
          try { client.send(message); } catch { wsClients.delete(client); }
        });

        return new Response(JSON.stringify(task), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // PATCH /tasks/:id/reorder - Reorder task
    if (url.pathname.match(/^\/tasks\/[^\/]+\/reorder$/) && req.method === 'PATCH') {
      const id = url.pathname.split('/')[2];
      try {
        const { sort_order } = await req.json() as { sort_order: number };
        const task = reorderTask(id, sort_order);
        if (!task) {
          return new Response(JSON.stringify({ error: 'Task not found' }), {
            status: 404,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        const message = JSON.stringify({ type: 'task_update', data: task });
        wsClients.forEach(client => {
          try { client.send(message); } catch { wsClients.delete(client); }
        });

        return new Response(JSON.stringify(task), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // POST /tasks/:id/unblock - Unblock task with response
    if (url.pathname.match(/^\/tasks\/[^\/]+\/unblock$/) && req.method === 'POST') {
      const id = url.pathname.split('/')[2];
      try {
        const { response } = await req.json() as { response: string };
        const task = unblockTask(id, response || 'Unblocked');
        if (!task) {
          return new Response(JSON.stringify({ error: 'Task not found' }), {
            status: 404,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        const message = JSON.stringify({ type: 'task_update', data: task });
        wsClients.forEach(client => {
          try { client.send(message); } catch { wsClients.delete(client); }
        });

        return new Response(JSON.stringify(task), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // DELETE /tasks/:id - Archive task
    if (url.pathname.match(/^\/tasks\/[^\/]+$/) && req.method === 'DELETE') {
      const id = url.pathname.split('/')[2];
      const success = archiveTask(id);
      if (!success) {
        return new Response(JSON.stringify({ error: 'Task not found' }), {
          status: 404,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }

      const message = JSON.stringify({ type: 'task_archived', data: { id } });
      wsClients.forEach(client => {
        try { client.send(message); } catch { wsClients.delete(client); }
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ── Command Center: Agent Spawner API ────────────────────────────────

    // POST /tasks/:id/assign - Spawn an agent for a task
    if (url.pathname.match(/^\/tasks\/[^\/]+\/assign$/) && req.method === 'POST') {
      const id = url.pathname.split('/')[2];
      try {
        const body = await req.json() as SpawnOptions;
        const result = spawnAgent(id, body);

        if ('error' in result) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: 400,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        // Broadcast task update (status changed to active)
        const task = getTaskWithChildren(id);
        if (task) {
          const message = JSON.stringify({ type: 'task_update', data: task });
          wsClients.forEach(client => {
            try { client.send(message); } catch { wsClients.delete(client); }
          });
        }

        // Broadcast agent update
        const agentMsg = JSON.stringify({ type: 'agent_spawned', data: result });
        wsClients.forEach(client => {
          try { client.send(agentMsg); } catch { wsClients.delete(client); }
        });

        return new Response(JSON.stringify(result), {
          status: 201,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // GET /agents - List all tracked agents
    if (url.pathname === '/agents' && req.method === 'GET') {
      const agentList = listAgents();
      return new Response(JSON.stringify(agentList), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /agents/stats - Agent statistics
    if (url.pathname === '/agents/stats' && req.method === 'GET') {
      const stats = getAgentStats();
      return new Response(JSON.stringify(stats), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /agents/:pid - Get single agent info
    if (url.pathname.match(/^\/agents\/\d+$/) && req.method === 'GET') {
      const pid = parseInt(url.pathname.split('/')[2]);
      const agent = getAgent(pid);
      if (!agent) {
        return new Response(JSON.stringify({ error: 'Agent not found' }), {
          status: 404,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify(agent), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /agents/:pid/stop - Stop a running agent
    if (url.pathname.match(/^\/agents\/\d+\/stop$/) && req.method === 'POST') {
      const pid = parseInt(url.pathname.split('/')[2]);
      const stopped = stopAgent(pid);

      if (!stopped) {
        return new Response(JSON.stringify({ error: 'Agent not found' }), {
          status: 404,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }

      // Broadcast agent stopped
      const agent = getAgent(pid);
      const message = JSON.stringify({ type: 'agent_stopped', data: { pid, agent } });
      wsClients.forEach(client => {
        try { client.send(message); } catch { wsClients.delete(client); }
      });

      return new Response(JSON.stringify({ stopped: true, pid }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /agents/cleanup - Remove finished agent records older than 1 hour
    if (url.pathname === '/agents/cleanup' && req.method === 'POST') {
      const cleaned = cleanupFinishedAgents();
      return new Response(JSON.stringify({ cleaned }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ── Command Center: Usage API ──────────────────────────────────────

    // GET /usage/summary — estimated usage from hook events (legacy/supplementary)
    if (url.pathname === '/usage/summary' && req.method === 'GET') {
      const summary = getUsageSummary();
      return new Response(JSON.stringify(summary), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /usage/claude — receive real Claude usage data from bridge script
    if (url.pathname === '/usage/claude' && req.method === 'POST') {
      try {
        const data = await req.json();
        // Store in memory (volatile but fine — refreshed frequently)
        (globalThis as any).__claude_usage_cache = {
          ...data,
          cached_at: Date.now(),
        };

        // Broadcast to WS clients
        const message = JSON.stringify({ type: 'claude_usage', data: (globalThis as any).__claude_usage_cache });
        wsClients.forEach(client => {
          try { client.send(message); } catch { wsClients.delete(client); }
        });

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // GET /usage/claude — return cached real Claude usage data
    if (url.pathname === '/usage/claude' && req.method === 'GET') {
      const cached = (globalThis as any).__claude_usage_cache || null;
      return new Response(JSON.stringify(cached), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ── Daily Digest API ──────────────────────────────────────────────

    // GET /digest - Generate daily digest (JSON)
    if (url.pathname === '/digest' && req.method === 'GET') {
      const format = url.searchParams.get('format') || 'json';
      const digest = generateDigest();

      if (format === 'markdown' || format === 'md') {
        const md = digestToMarkdown(digest);
        return new Response(md, {
          headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }

      if (format === 'slack') {
        const slack = digestToSlack(digest);
        return new Response(slack, {
          headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }

      return new Response(JSON.stringify(digest), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ── Shared Resource Lock API ───────────────────────────────────────

    // GET /resources - Get all resource states (locks, waiters)
    if (url.pathname === '/resources' && req.method === 'GET') {
      const state = getAllResourceState();
      return new Response(JSON.stringify(state), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /resources/:id/acquire - Acquire a resource lock
    if (url.pathname.match(/^\/resources\/[^\/]+\/acquire$/) && req.method === 'POST') {
      const resourceId = url.pathname.split('/')[2];
      try {
        const body = await req.json() as { session_id: string; description?: string; ttl_ms?: number };
        if (!body.session_id) {
          return new Response(JSON.stringify({ error: 'session_id is required' }), {
            status: 400,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        const result = acquireResource(resourceId, body.session_id, body.description || '', body.ttl_ms);

        // Broadcast lock state change to all WS clients
        const state = getAllResourceState();
        const message = JSON.stringify({ type: 'resource_update', data: state });
        wsClients.forEach(client => {
          try { client.send(message); } catch { wsClients.delete(client); }
        });

        return new Response(JSON.stringify(result), {
          status: result.acquired ? 200 : 409,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // POST /resources/:id/heartbeat - Extend a lock lease
    if (url.pathname.match(/^\/resources\/[^\/]+\/heartbeat$/) && req.method === 'POST') {
      const resourceId = url.pathname.split('/')[2];
      try {
        const body = await req.json() as { session_id: string; ttl_ms?: number };
        const lock = heartbeatResource(resourceId, body.session_id, body.ttl_ms);
        if (!lock) {
          return new Response(JSON.stringify({ error: 'Lock not held or expired' }), {
            status: 404,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify(lock), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // POST /resources/:id/release - Release a lock
    if (url.pathname.match(/^\/resources\/[^\/]+\/release$/) && req.method === 'POST') {
      const resourceId = url.pathname.split('/')[2];
      try {
        const body = await req.json() as { session_id: string };
        const released = releaseResource(resourceId, body.session_id);

        // Broadcast
        const state = getAllResourceState();
        const message = JSON.stringify({ type: 'resource_update', data: state });
        wsClients.forEach(client => {
          try { client.send(message); } catch { wsClients.delete(client); }
        });

        return new Response(JSON.stringify({ released }), {
          status: released ? 200 : 404,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // POST /resources/register - Register a new shared resource
    if (url.pathname === '/resources/register' && req.method === 'POST') {
      try {
        const body = await req.json() as {
          resource_id: string;
          display_name: string;
          description?: string;
          default_ttl_ms?: number;
        };
        registerResource(body.resource_id, body.display_name, body.description, body.default_ttl_ms);
        return new Response(JSON.stringify({ success: true }), {
          status: 201,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // WebSocket upgrade
    if (url.pathname === '/stream') {
      const success = server.upgrade(req);
      if (success) {
        return undefined;
      }
    }
    
    // Default response
    return new Response('Multi-Agent Observability Server', {
      headers: { ...headers, 'Content-Type': 'text/plain' }
    });
  },
  
  websocket: {
    open(ws) {
      console.log('WebSocket client connected');
      wsClients.add(ws);
      
      // Send recent events on connection
      const events = getRecentEvents(300);
      ws.send(JSON.stringify({ type: 'initial', data: events }));
    },
    
    message(ws, message) {
      // Handle any client messages if needed
      console.log('Received message:', message);
    },
    
    close(ws) {
      console.log('WebSocket client disconnected');
      wsClients.delete(ws);
    },
    
    error(ws, error) {
      console.error('WebSocket error:', error);
      wsClients.delete(ws);
    }
  }
});

console.log(`🚀 Server running on http://localhost:${server.port}`);
console.log(`📊 WebSocket endpoint: ws://localhost:${server.port}/stream`);
console.log(`📮 POST events to: http://localhost:${server.port}/events`);