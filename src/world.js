// OpenClaw World — Phase 4 LIVE
// 4 AI bots walking around a sci-fi office/lab
// Real-time activity feed via Socket.io from 82.197.92.190:3001

// ─── Real-time activity connection ───────────────────────────────────────────
const ACTIVITY_SERVER = 'https://manufacture-satisfied-sustainable-amplifier.trycloudflare.com';

// Map bot IDs between server (dan_pen) and game (danpen)
const BOT_ID_MAP = { dan_pen: 'danpen', mech: 'mech', wormy: 'wormy', orion: 'orion' };

// Station → game coordinates
const STATION_COORDS = {
  research: { x: 160, y: 120 },
  server:   { x: 1120, y: 120 },
  comms:    { x: 160, y: 600 },
  project:  { x: 1120, y: 600 },
  center:   { x: 640, y: 360 },
};

// Global activity feed (updated by socket, read by WorldScene)
window._ocActivity = {};
window._ocSocket = null;

function connectActivityFeed() {
  if (typeof io === 'undefined') {
    console.warn('[OC World] Socket.io not loaded — running in offline mode');
    return;
  }

  try {
    const socket = io(ACTIVITY_SERVER, {
      transports: ['polling', 'websocket'],
      reconnectionDelay: 3000,
      timeout: 5000,
    });
    window._ocSocket = socket;

    socket.on('connect', () => {
      console.log('[OC World] Connected to activity feed');
      document.getElementById('connection-dot')?.classList.add('live');
    });

    socket.on('disconnect', () => {
      console.log('[OC World] Disconnected from activity feed');
      document.getElementById('connection-dot')?.classList.remove('live');
    });

    socket.on('bot_event', (evt) => {
      const gameId = BOT_ID_MAP[evt.bot];
      if (!gameId) return;
      window._ocActivity[gameId] = evt;
      // Dispatch to scene if available
      if (window._ocScene) {
        window._ocScene.handleRealActivity(gameId, evt);
      }
    });

    socket.on('bot_state', (state) => {
      window._ocBotState = state;
      // Update status bar
      for (const [serverId, data] of Object.entries(state)) {
        const gameId = BOT_ID_MAP[serverId];
        if (!gameId) continue;
        const el = document.getElementById(`status-${gameId}`);
        if (el) el.textContent = data.activity?.slice(0, 35) || 'idle';
      }
    });

  } catch (e) {
    console.warn('[OC World] Could not connect to activity feed:', e.message);
  }
}

// Start connection attempt
connectActivityFeed();

const WORLD_W = 1280;
const WORLD_H = 720;

// ─── BotMind: Smallville-inspired memory + intention layer ───────────────────
class BotMind {
  constructor(botId, config) {
    this.botId = botId;
    this.config = config;
    this.memory = [];        // last 10 real events
    this.currentTask = null; // { action, detail, station, thought }
    this.intention = '';     // high-level goal, updated every 5 events
  }

  async onEvent(evt) {
    // 1. Store in memory
    this.memory.push({ ...evt, ts: Date.now() });
    if (this.memory.length > 10) this.memory.shift();

    // 2. Generate a thought using LLM
    const thought = await this.generateThought(evt);

    // 3. Update current task
    this.currentTask = {
      action: evt.action,
      detail: evt.detail,
      station: evt.station,
      thought: thought,
    };

    // 4. Every 5 events, reflect and update high-level intention
    if (this.memory.length % 5 === 0) {
      this.intention = await this.reflect();
    }

    return this.currentTask;
  }

  async generateThought(evt) {
    const recentMemory = this.memory.slice(-5)
      .map(m => `${m.action}: ${m.detail || '(no detail)'}`)
      .join('\n');

    const prompt = `You are ${this.config.name}, ${this.config.role}.
Recent activity:
${recentMemory}

Current action: ${evt.action}${evt.detail ? ': ' + evt.detail : ''}

Write a SHORT internal thought (max 8 words) that this bot would have right now.
Examples: "Found 3 good results, reading now", "Deploy looks clean, pushing", "User needs chapter 4"
Just the thought, no quotes, no explanation.`;

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer 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',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-flash-1.5-8b',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 20,
          temperature: 0.7,
        }),
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || evt.action;
    } catch {
      return `${evt.action}${evt.detail ? ': ' + evt.detail.slice(0, 30) : ''}`;
    }
  }

  async reflect() {
    if (this.memory.length < 3) return this.config.role;
    const actions = this.memory.map(m => m.action).join(', ');
    const prompt = `You are ${this.config.name}. Recent actions: ${actions}. Summarize your current focus in 5 words or less.`;
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer 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',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-flash-1.5-8b',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 15,
        }),
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || this.config.role;
    } catch {
      return this.config.role;
    }
  }
}

const BOTS = [
  {
    id: 'danpen',
    name: 'Dan Pen',
    role: 'Researcher',
    color: 0xf97316,
    colorHex: '#f97316',
    station: { x: 160, y: 120 },
    phrases: ['Researching...', 'Web search...', 'Reading docs...', 'Analyzing...'],
  },
  {
    id: 'mech',
    name: 'Mech',
    role: 'Engineer',
    color: 0x3b82f6,
    colorHex: '#3b82f6',
    station: { x: 1120, y: 120 },
    phrases: ['Deploying...', 'Fixing bug...', 'Fleet update...', 'Health check...'],
  },
  {
    id: 'wormy',
    name: 'Wormy',
    role: 'User-facing',
    color: 0x22c55e,
    colorHex: '#22c55e',
    station: { x: 160, y: 600 },
    phrases: ['Answering user...', 'Processing...', 'Sending reply...', 'Listening...'],
  },
  {
    id: 'orion',
    name: 'Orion',
    role: 'Project Manager',
    color: 0xa855f7,
    colorHex: '#a855f7',
    station: { x: 1120, y: 600 },
    phrases: ['Planning...', 'Tracking tasks...', 'Reviewing...', 'Coordinating...'],
  },
];

const CENTER = { x: WORLD_W / 2, y: WORLD_H / 2 };

class WorldScene extends Phaser.Scene {
  constructor() {
    super({ key: 'WorldScene' });
    this.bots = [];
    this.statusUpdateCallbacks = [];
    this.workstationGlowObjs = [];
    this.eventLog = null;
  }

  create() {
    this.drawWorld();
    this.addWorkstationGlowPulses();
    this.createBots();
    // Start intention-driven behavior loops for all bots
    for (const bot of this.bots) { this.runBotBehavior(bot); }
    this.startIdleChecks();
    // Update status cards from mind.intention every 10 seconds
    this.time.addEvent({
      delay: 10000,
      loop: true,
      callback: () => {
        for (const bot of this.bots) {
          if (bot.mind && bot.mind.intention) {
            const el = document.getElementById(`status-${bot.config.id}`);
            if (el) el.textContent = bot.mind.intention;
          }
        }
      },
    });
    this.eventLog = new EventLog(this);
    // Register scene for real-time events
    window._ocScene = this;
    // Show live indicator
    this.updateConnectionBadge();
  }

  updateConnectionBadge() {
    this.time.addEvent({
      delay: 2000,
      loop: true,
      callback: () => {
        const connected = window._ocSocket?.connected;
        const badge = document.getElementById('live-badge');
        if (badge) {
          badge.textContent = connected ? '● LIVE' : '○ OFFLINE';
          badge.style.color = connected ? '#22c55e' : '#ef4444';
        }
      }
    });
  }

  async handleRealActivity(gameId, evt) {
    const bot = this.bots.find(b => b.config.id === gameId);
    if (!bot) return;

    // Update the event log panel immediately
    if (this.eventLog) {
      this.eventLog.addEvent(gameId, evt.action || '', evt.detail || '');
    }

    // Show "..." bubble immediately while LLM generates thought (~300ms)
    this.showBubble(bot, '...', 1500);

    // Feed event to the bot's mind — generates an LLM thought
    const task = await bot.mind.onEvent(evt);

    // Update status bar with thought or raw action
    const el = document.getElementById(`status-${gameId}`);
    if (el) el.textContent = task.thought || task.action;
  }

  // ── Multi-bot meeting animation ─────────────────────────────────────────────
  async meetBots(botIdA, botIdB, message) {
    const botA = this.bots.find(b => b.config.id === botIdA);
    const botB = this.bots.find(b => b.config.id === botIdB);
    if (!botA || !botB) return;
    if (botA.isMeeting || botB.isMeeting) return;

    botA.isMeeting = true;
    botB.isMeeting = true;

    // Compute midpoint and direction
    const stA = botA.config.station;
    const stB = botB.config.station;
    const midX = (stA.x + stB.x) / 2;
    const midY = (stA.y + stB.y) / 2;
    const dx   = stB.x - stA.x;
    const dy   = stB.y - stA.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx   = dx / dist;
    const ny   = dy / dist;
    const gap  = 30; // each bot stops 30px from midpoint → 60px total

    // Walk toward each other
    await Promise.all([
      this.walkTo(botA, midX - nx * gap, midY - ny * gap),
      this.walkTo(botB, midX + nx * gap, midY + ny * gap),
    ]);

    // Draw pulsing connection line
    const lineG = this.add.graphics();
    const lineState = { alpha: 0 };
    const updateLine = () => {
      lineG.clear();
      if (!botA.active || !botB.active) return;
      lineG.lineStyle(2, 0xffffff, lineState.alpha);
      lineG.lineBetween(botA.x, botA.y, botB.x, botB.y);
    };
    this.tweens.add({
      targets: lineState,
      alpha: 0.8,
      duration: 250,
      yoyo: true,
      repeat: 7,           // ~4 pulses over ~2 seconds
      ease: 'Sine.easeInOut',
      onUpdate: updateLine,
      onComplete: () => lineG.destroy(),
    });

    // Speech bubbles simultaneously
    const trimmed = (message || '').slice(0, 40);
    await Promise.all([
      this.showBubble(botA, trimmed, 2000),
      this.showBubble(botB, '...', 2000),
    ]);

    await this.wait(200);

    // Walk back to stations
    await Promise.all([
      this.walkTo(botA, stA.x, stA.y),
      this.walkTo(botB, stB.x, stB.y),
    ]);

    botA.isMeeting = false;
    botB.isMeeting = false;
  }

  // ── Glow pulse (Wormy answering user) ──────────────────────────────────────
  glowBot(botId) {
    const bot = this.bots.find(b => b.config.id === botId);
    if (!bot) return;
    // Scale pulse
    this.tweens.add({
      targets: bot,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 180,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut',
    });
  }

  drawWorld() {
    const g = this.add.graphics();

    // Background
    g.fillStyle(0x0f172a);
    g.fillRect(0, 0, WORLD_W, WORLD_H);

    // Grid lines (subtle)
    g.lineStyle(1, 0x1e293b, 0.6);
    for (let x = 0; x < WORLD_W; x += 40) {
      g.lineBetween(x, 0, x, WORLD_H);
    }
    for (let y = 0; y < WORLD_H; y += 40) {
      g.lineBetween(0, y, WORLD_W, y);
    }

    // Room definitions
    const rooms = [
      { x: 0, y: 0, w: 320, h: 240, color: 0xf97316, fill: 0x1a0e05, label: 'RESEARCH STATION', accent: 0xf97316 },
      { x: WORLD_W - 320, y: 0, w: 320, h: 240, color: 0x3b82f6, fill: 0x050d1a, label: 'SERVER ROOM', accent: 0x3b82f6 },
      { x: 0, y: WORLD_H - 240, w: 320, h: 240, color: 0x22c55e, fill: 0x051a0a, label: 'COMMS HUB', accent: 0x22c55e },
      { x: WORLD_W - 320, y: WORLD_H - 240, w: 320, h: 240, color: 0xa855f7, fill: 0x0d0519, label: 'PROJECT BOARD', accent: 0xa855f7 },
    ];

    rooms.forEach(room => {
      // Room floor
      g.fillStyle(room.fill);
      g.fillRect(room.x, room.y, room.w, room.h);

      // Room border (glowing effect with multiple layers)
      g.lineStyle(4, room.color, 0.2);
      g.strokeRect(room.x + 2, room.y + 2, room.w - 4, room.h - 4);
      g.lineStyle(2, room.color, 0.7);
      g.strokeRect(room.x, room.y, room.w, room.h);
      g.lineStyle(1, room.color, 1.0);
      g.strokeRect(room.x + 1, room.y + 1, room.w - 2, room.h - 2);

      // Corner accent marks
      const cs = 16;
      g.lineStyle(3, room.color, 1.0);
      // top-left corner
      g.lineBetween(room.x, room.y, room.x + cs, room.y);
      g.lineBetween(room.x, room.y, room.x, room.y + cs);
      // top-right corner
      g.lineBetween(room.x + room.w, room.y, room.x + room.w - cs, room.y);
      g.lineBetween(room.x + room.w, room.y, room.x + room.w, room.y + cs);
      // bottom-left corner
      g.lineBetween(room.x, room.y + room.h, room.x + cs, room.y + room.h);
      g.lineBetween(room.x, room.y + room.h, room.x, room.y + room.h - cs);
      // bottom-right corner
      g.lineBetween(room.x + room.w, room.y + room.h, room.x + room.w - cs, room.y + room.h);
      g.lineBetween(room.x + room.w, room.y + room.h, room.x + room.w, room.y + room.h - cs);

      // Room label
      this.add.text(room.x + room.w / 2, room.y + 14, room.label, {
        fontSize: '10px',
        fontFamily: 'monospace',
        color: Phaser.Display.Color.IntegerToColor(room.color).rgba,
        alpha: 0.7,
      }).setOrigin(0.5, 0.5).setAlpha(0.7);
    });

    // Workstations (glowing rectangles)
    const workstations = [
      { x: 120, y: 100, color: 0xf97316 },
      { x: WORLD_W - 120, y: 100, color: 0x3b82f6 },
      { x: 120, y: WORLD_H - 100, color: 0x22c55e },
      { x: WORLD_W - 120, y: WORLD_H - 100, color: 0xa855f7 },
    ];

    workstations.forEach(ws => {
      // Glow aura
      g.fillStyle(ws.color, 0.06);
      g.fillRect(ws.x - 36, ws.y - 22, 72, 44);
      g.fillStyle(ws.color, 0.12);
      g.fillRect(ws.x - 28, ws.y - 16, 56, 32);
      // Desk surface
      g.fillStyle(0x1e293b);
      g.fillRect(ws.x - 22, ws.y - 10, 44, 20);
      g.lineStyle(1.5, ws.color, 0.9);
      g.strokeRect(ws.x - 22, ws.y - 10, 44, 20);
      // Monitor
      g.fillStyle(0x0f172a);
      g.fillRect(ws.x - 12, ws.y - 22, 24, 14);
      g.lineStyle(1, ws.color, 0.7);
      g.strokeRect(ws.x - 12, ws.y - 22, 24, 14);
      // Screen glow
      g.fillStyle(ws.color, 0.3);
      g.fillRect(ws.x - 10, ws.y - 20, 20, 10);
    });

    // Central area — hub circle
    g.lineStyle(1, 0x334155, 0.5);
    g.strokeCircle(CENTER.x, CENTER.y, 120);
    g.lineStyle(1, 0x334155, 0.3);
    g.strokeCircle(CENTER.x, CENTER.y, 80);
    // Center dot
    g.fillStyle(0x334155, 0.6);
    g.fillCircle(CENTER.x, CENTER.y, 6);

    // Connection lines from center to rooms (dashed look with small rects)
    const connColor = 0x1e293b;
    const connections = [
      { x1: CENTER.x, y1: CENTER.y, x2: 320, y2: 240 },
      { x1: CENTER.x, y1: CENTER.y, x2: WORLD_W - 320, y2: 240 },
      { x1: CENTER.x, y1: CENTER.y, x2: 320, y2: WORLD_H - 240 },
      { x1: CENTER.x, y1: CENTER.y, x2: WORLD_W - 320, y2: WORLD_H - 240 },
    ];
    g.lineStyle(1, 0x1e293b, 0.4);
    connections.forEach(c => {
      g.lineBetween(c.x1, c.y1, c.x2, c.y2);
    });

    // Decorative elements — server rack in Server Room
    const srX = WORLD_W - 300;
    g.fillStyle(0x1e293b);
    g.fillRect(srX, 30, 60, 100);
    g.lineStyle(1, 0x3b82f6, 0.5);
    g.strokeRect(srX, 30, 60, 100);
    for (let i = 0; i < 5; i++) {
      g.fillStyle(0x3b82f6, 0.4);
      g.fillRect(srX + 4, 34 + i * 18, 52, 12);
      g.fillStyle(0x22c55e, 0.8);
      g.fillRect(srX + 50, 38 + i * 18, 4, 4);
    }

    // Research bookshelf (top-left room)
    for (let i = 0; i < 5; i++) {
      const bColors = [0xf97316, 0xfbbf24, 0xef4444, 0xf97316, 0xfde68a];
      g.fillStyle(bColors[i], 0.7);
      g.fillRect(20 + i * 14, 40, 12, 22);
    }
    g.lineStyle(1, 0xf97316, 0.3);
    g.strokeRect(18, 38, 74, 26);

    // Project board (bottom-right room)
    const pbX = WORLD_W - 300;
    const pbY = WORLD_H - 220;
    g.fillStyle(0x1e293b);
    g.fillRect(pbX, pbY, 80, 60);
    g.lineStyle(1, 0xa855f7, 0.5);
    g.strokeRect(pbX, pbY, 80, 60);
    // Sticky notes
    const noteColors = [0xa855f7, 0xc084fc, 0x7c3aed];
    for (let i = 0; i < 3; i++) {
      g.fillStyle(noteColors[i], 0.4);
      g.fillRect(pbX + 4 + i * 26, pbY + 6, 22, 16);
    }
    for (let i = 0; i < 3; i++) {
      g.fillStyle(noteColors[i], 0.3);
      g.fillRect(pbX + 4 + i * 26, pbY + 28, 22, 16);
    }

    // Scanlines overlay (very subtle)
    for (let y = 0; y < WORLD_H; y += 4) {
      g.lineStyle(1, 0x000000, 0.04);
      g.lineBetween(0, y, WORLD_W, y);
    }
  }

  createBots() {
    BOTS.forEach((botDef, index) => {
      const bot = this.createBotSprite(botDef);
      bot.def = botDef;
      bot.config = botDef;          // alias used by conversation panel
      bot.phraseIndex = 0;
      bot.currentActivity = botDef.phrases[0];
      bot.isMoving = false;
      bot.bubble = null;
      bot.bubbleBg = null;
      bot.chatting = false;
      bot.isMeeting = false;
      bot.isBusy = false;
      bot.lastMoveTime = Date.now();
      // Smallville: each bot has a mind for memory-driven behavior
      bot.mind = new BotMind(botDef.id, botDef);
      this.bots.push(bot);

      // ── Click-to-talk interactivity ─────────────────────────────────────
      bot.setInteractive(
        new Phaser.Geom.Rectangle(-15, -22, 30, 52),
        Phaser.Geom.Rectangle.Contains
      );

      bot.on('pointerdown', () => {
        if (typeof window.openConversationPanel === 'function') {
          window.openConversationPanel(botDef);
        }
      });

      bot.on('pointerover', () => {
        document.body.style.cursor = 'pointer';
        // Subtle scale-up on hover
        this.tweens.add({ targets: bot, scaleX: 1.08, scaleY: 1.08, duration: 120, ease: 'Quad.easeOut' });
      });

      bot.on('pointerout', () => {
        document.body.style.cursor = 'default';
        this.tweens.add({ targets: bot, scaleX: 1, scaleY: 1, duration: 120, ease: 'Quad.easeOut' });
      });
    });
  }

  // Expose for conversation panel to cleanly clear a bubble
  clearBotBubble(botId) {
    const bot = this.bots.find(b => b.def && b.def.id === botId);
    if (!bot) return;
    if (bot.bubbleBg) { bot.bubbleBg.destroy(); bot.bubbleBg = null; }
    if (bot.bubble)   { bot.bubble   = null; }
  }

  createBotSprite(def) {
    const container = this.add.container(def.station.x, def.station.y);
    const g = this.add.graphics();

    // Shadow
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(0, 18, 22, 8);

    // Body (rectangle)
    g.fillStyle(def.color);
    g.fillRect(-10, -4, 20, 28);

    // Body shine
    g.fillStyle(0xffffff, 0.15);
    g.fillRect(-8, -2, 6, 12);

    // Belt/waist line
    g.fillStyle(0x000000, 0.2);
    g.fillRect(-10, 10, 20, 3);

    // Head (circle)
    g.fillStyle(def.color);
    g.fillCircle(0, -12, 9);

    // Head shine
    g.fillStyle(0xffffff, 0.2);
    g.fillCircle(-3, -15, 4);

    // Eyes
    g.fillStyle(0xffffff);
    g.fillRect(-5, -15, 3, 4);
    g.fillRect(2, -15, 3, 4);

    // Eye glow (pupils)
    g.fillStyle(def.color, 0.8);
    g.fillRect(-4, -14, 2, 2);
    g.fillRect(3, -14, 2, 2);

    // Antenna
    g.lineStyle(1.5, def.color, 0.8);
    g.lineBetween(0, -21, 0, -28);
    g.fillStyle(def.color);
    g.fillCircle(0, -29, 2.5);

    container.add(g);

    // Name tag below bot
    const nameTag = this.add.text(0, 28, def.name, {
      fontSize: '9px',
      fontFamily: 'monospace',
      color: Phaser.Display.Color.IntegerToColor(def.color).rgba,
      stroke: '#0f172a',
      strokeThickness: 3,
    }).setOrigin(0.5, 0);
    container.add(nameTag);

    // Walk bob tween
    this.tweens.add({
      targets: container,
      y: container.y + 3,
      duration: 300 + Math.random() * 100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return container;
  }

  // ── Smallville intention-driven behavior loop ──────────────────────────────
  async runBotBehavior(bot) {
    // Stagger bot starts slightly
    await this.delay(bot.config.id === 'danpen' ? 0 :
                     bot.config.id === 'mech'   ? 600 :
                     bot.config.id === 'wormy'  ? 1200 : 1800);

    while (true) {
      const mind = bot.mind;

      if (mind.currentTask) {
        // Move to the correct station for this task
        const coords = STATION_COORDS[mind.currentTask.station] || bot.config.station;
        await this.walkTo(bot, coords.x, coords.y);

        // Show the LLM-generated thought (not a random phrase)
        const display = mind.currentTask.thought || mind.currentTask.action;
        await this.showBubble(bot, display, 3000);

        // Clear after showing
        mind.currentTask = null;

      } else if (mind.intention) {
        // Occasionally show high-level intention as idle thought
        if (Math.random() < 0.3) {
          await this.showBubble(bot, mind.intention, 2000);
        }
        // Idle micro-movement near current position
        const jitter = {
          x: bot.x + (Math.random() - 0.5) * 20,
          y: bot.y + (Math.random() - 0.5) * 10,
        };
        await this.walkTo(bot, jitter.x, jitter.y);
        await this.delay(2000 + Math.random() * 3000);

      } else {
        // No task, no intention — drift back to home station and wait
        await this.walkTo(bot, bot.config.station.x, bot.config.station.y);
        await this.delay(3000 + Math.random() * 4000);
      }
    }
  }

  delay(ms) {
    return new Promise(r => this.time.delayedCall(ms, r));
  }

  walkTo(bot, targetX, targetY) {
    return new Promise(resolve => {
      const dx = targetX - bot.x;
      const dy = targetY - bot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 5) { resolve(); return; }

      // Track last movement time (for idle animations)
      bot.lastMoveTime = Date.now();

      const speed = 120 + Math.random() * 60; // pixels per second
      const duration = (dist / speed) * 1000;

      this.tweens.add({
        targets: bot,
        x: targetX,
        y: targetY,
        duration: Math.min(duration, 4000),
        ease: 'Linear',
        onComplete: () => {
          bot.lastMoveTime = Date.now(); // reset on arrival
          resolve();
        },
      });
    });
  }

  showBubble(bot, text, duration) {
    return new Promise(resolve => {
      // Remove existing bubble
      if (bot.bubble) bot.bubble.destroy();
      if (bot.bubbleBg) bot.bubbleBg.destroy();

      const padding = { x: 10, y: 6 };
      const style = {
        fontSize: '11px',
        fontFamily: 'monospace',
        color: '#1e293b',
      };

      // Create text first to measure
      const txt = this.add.text(0, 0, text, style);
      const tw = txt.width + padding.x * 2;
      const th = txt.height + padding.y * 2;

      // Bubble background
      const bg = this.add.graphics();

      const drawBubble = (alpha) => {
        bg.clear();
        bg.fillStyle(0xffffff, alpha * 0.95);
        bg.fillRoundedRect(-tw / 2, -th - 6, tw, th, 6);
        // Tail
        bg.fillTriangle(
          -5, -6,
          5, -6,
          0, 0
        );
        // Border
        bg.lineStyle(1, 0xcccccc, alpha * 0.5);
        bg.strokeRoundedRect(-tw / 2, -th - 6, tw, th, 6);
      };

      drawBubble(1);

      // Position text
      txt.setOrigin(0.5, 1);
      txt.setPosition(0, -8);

      // Bot offset Y for bubble above head
      const yOffset = -50;

      // Create a container for the bubble at bot position
      const bubbleContainer = this.add.container(bot.x, bot.y + yOffset);
      bubbleContainer.add(bg);
      bubbleContainer.add(txt);

      bot.bubble = txt;
      bot.bubbleBg = bubbleContainer;

      // Bind bubble position to bot
      const updatePos = () => {
        if (bubbleContainer.active) {
          bubbleContainer.setPosition(bot.x, bot.y + yOffset);
        }
      };
      const posListener = this.events.on('update', updatePos);

      // Fade in
      bubbleContainer.setAlpha(0);
      this.tweens.add({
        targets: bubbleContainer,
        alpha: 1,
        duration: 200,
        ease: 'Linear',
      });

      // Fade out after duration
      this.time.delayedCall(duration - 300, () => {
        this.tweens.add({
          targets: bubbleContainer,
          alpha: 0,
          duration: 300,
          ease: 'Linear',
          onComplete: () => {
            this.events.off('update', updatePos);
            bubbleContainer.destroy();
            bot.bubble = null;
            bot.bubbleBg = null;
            resolve();
          },
        });
      });
    });
  }

  // ── Workstation glow pulse animations ─────────────────────────────────────
  addWorkstationGlowPulses() {
    const workstations = [
      { x: 120,             y: 100,            color: 0xf97316 },
      { x: WORLD_W - 120,   y: 100,            color: 0x3b82f6 },
      { x: 120,             y: WORLD_H - 100,  color: 0x22c55e },
      { x: WORLD_W - 120,   y: WORLD_H - 100,  color: 0xa855f7 },
    ];

    workstations.forEach((ws, i) => {
      const glow = this.add.graphics();
      glow.fillStyle(ws.color, 0.18);
      glow.fillRect(ws.x - 36, ws.y - 22, 72, 44);
      glow.setAlpha(0.3);

      this.tweens.add({
        targets: glow,
        alpha: { from: 0.3, to: 0.7 },
        duration: 2200 + i * 350,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: i * 500,
      });

      this.workstationGlowObjs.push(glow);
    });
  }

  // ── Ambient idle animations ────────────────────────────────────────────────
  startIdleChecks() {
    this.bots.forEach(bot => {
      bot.lastMoveTime = Date.now();
      this.scheduleIdleMicro(bot);
      this.scheduleIdleThink(bot);
    });
  }

  scheduleIdleMicro(bot) {
    const delay = 2000 + Math.random() * 1000;
    this.time.delayedCall(delay, () => {
      const idleMs = Date.now() - (bot.lastMoveTime || 0);
      if (idleMs > 5000 && !bot.isBusy && !bot.isMeeting && bot.active) {
        const shiftX = (Math.random() - 0.5) * 6;
        const shiftY = (Math.random() - 0.5) * 6;
        this.tweens.add({
          targets: bot,
          x: bot.x + shiftX,
          y: bot.y + shiftY,
          duration: 400,
          ease: 'Sine.easeInOut',
          yoyo: true,
        });
      }
      this.scheduleIdleMicro(bot);
    });
  }

  scheduleIdleThink(bot) {
    const delay = 8000 + Math.random() * 4000;
    this.time.delayedCall(delay, () => {
      const idleMs = Date.now() - (bot.lastMoveTime || 0);
      if (idleMs > 5000 && !bot.isBusy && !bot.isMeeting && !bot.bubble && bot.active) {
        this.showBubble(bot, '...', 1800);
      }
      this.scheduleIdleThink(bot);
    });
  }

  wait(ms) {
    return new Promise(resolve => this.time.delayedCall(ms, resolve));
  }

  updateStatus(botId, activity) {
    const el = document.getElementById(`status-${botId}`);
    if (el) el.textContent = activity;
  }

  update() {
    // Keep bubbles following bots (handled by event listener in showBubble)
  }
}

// ─── EventLog: Fleet Status panel (bottom-right, Phaser Text) ─────────────────
class EventLog {
  constructor(scene) {
    this.scene   = scene;
    this.events  = [];
    this.maxEvents = 5;

    const PAD    = 10;
    this.panelW  = 220;
    this.panelH  = 150;
    this.panelX  = WORLD_W - PAD - this.panelW;
    this.panelY  = WORLD_H - PAD - this.panelH;

    // Background panel
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.72);
    bg.fillRoundedRect(this.panelX, this.panelY, this.panelW, this.panelH, 5);
    bg.lineStyle(1, 0x1e293b, 1);
    bg.strokeRoundedRect(this.panelX, this.panelY, this.panelW, this.panelH, 5);
    bg.setDepth(50);

    // Title
    const title = scene.add.text(
      this.panelX + 8, this.panelY + 6,
      'FLEET STATUS',
      { fontSize: '8px', fontFamily: 'monospace', color: '#475569' }
    );
    title.setDepth(51);

    // Divider
    const div = scene.add.graphics();
    div.lineStyle(1, 0x1e293b, 0.8);
    div.lineBetween(this.panelX + 6, this.panelY + 19, this.panelX + this.panelW - 6, this.panelY + 19);
    div.setDepth(51);

    // Text lines for events
    this.textLines = [];
    for (let i = 0; i < this.maxEvents; i++) {
      const line = scene.add.text(
        this.panelX + 8,
        this.panelY + 24 + i * 24,
        '',
        {
          fontSize: '10px',
          fontFamily: 'monospace',
          color: '#64748b',
          wordWrap: { width: this.panelW - 16 },
        }
      );
      line.setDepth(52);
      this.textLines.push(line);
    }
  }

  addEvent(botId, action, detail) {
    const BOT_EMOJIS = { danpen: '🔬', mech: '⚙️', wormy: '💬', orion: '📋' };
    const BOT_COLORS = { danpen: '#f97316', mech: '#3b82f6', wormy: '#22c55e', orion: '#a855f7' };
    const emoji  = BOT_EMOJIS[botId] || '🤖';
    const color  = BOT_COLORS[botId] || '#94a3b8';
    const label  = `${emoji} ${(action || '').slice(0, 18)}`;
    const sub    = detail ? `: ${detail.slice(0, 20)}` : '';

    this.events.unshift({ text: label + sub, color });
    if (this.events.length > this.maxEvents) this.events.length = this.maxEvents;
    this._render();
  }

  _render() {
    for (let i = 0; i < this.maxEvents; i++) {
      const evt = this.events[i];
      if (evt) {
        this.textLines[i].setText(evt.text);
        this.textLines[i].setColor(evt.color);
        this.textLines[i].setAlpha(Math.max(0.2, 1 - i * 0.18));
      } else {
        this.textLines[i].setText('');
      }
    }
  }
}

// Boot scene with loading screen
class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create() {
    const g = this.add.graphics();
    g.fillStyle(0x0f172a);
    g.fillRect(0, 0, WORLD_W, WORLD_H);

    const title = this.add.text(WORLD_W / 2, WORLD_H / 2 - 30, '⚡ OPENCLAW WORLD', {
      fontSize: '32px',
      fontFamily: 'monospace',
      color: '#f97316',
    }).setOrigin(0.5);

    const sub = this.add.text(WORLD_W / 2, WORLD_H / 2 + 20, 'Initializing bots...', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#64748b',
    }).setOrigin(0.5);

    // Blinking cursor effect
    this.time.addEvent({
      delay: 500,
      repeat: 4,
      callback: () => { sub.setVisible(!sub.visible); },
    });

    this.time.delayedCall(2500, () => {
      this.scene.start('WorldScene');
    });
  }
}

// Start the game
window.addEventListener('load', () => {
  const config = {
    type: Phaser.AUTO,
    width: WORLD_W,
    height: WORLD_H,
    backgroundColor: '#0f172a',
    parent: 'game-container',
    scene: [BootScene, WorldScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: true,
      pixelArt: false,
    },
  };

  const game = new Phaser.Game(config);
  window._ocGame = game;
});
