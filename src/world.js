// OpenClaw World — Phase 5: Market Awareness Layer
// 4 AI bots + Market Horizon showing real outside-world signals
// BotMind (Smallville memory) layer preserved from Phase 4

// ─── Real-time activity connection ───────────────────────────────────────────
const ACTIVITY_SERVER = 'https://manufacture-satisfied-sustainable-amplifier.trycloudflare.com';

const BOT_ID_MAP = { dan_pen: 'danpen', mech: 'mech', wormy: 'wormy', orion: 'orion' };

// ─── World geometry ───────────────────────────────────────────────────────────
const WORLD_W        = 1280;
const WORLD_H        = 720;
const MARKET_PANEL_X = 1100;   // market panel occupies 1100-1280 (180px)
const MAIN_W         = MARKET_PANEL_X;   // usable main world: 0-1100
const CENTER         = { x: Math.round(MAIN_W / 2), y: Math.round(WORLD_H / 2) };  // 550, 360

// Station → game coordinates (right-side rooms shifted left for market panel)
const STATION_COORDS = {
  research: { x: 160, y: 120 },
  server:   { x: 950, y: 120 },    // was 1120 — shifted left
  comms:    { x: 160, y: 600 },
  project:  { x: 950, y: 600 },    // was 1120 — shifted left
  center:   { x: 550, y: 360 },
};

// Global activity feed (updated by socket, read by WorldScene)
window._ocActivity = {};
window._ocSocket   = null;

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
      if (window._ocScene) window._ocScene.handleRealActivity(gameId, evt);
    });
    socket.on('bot_state', (state) => {
      window._ocBotState = state;
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

connectActivityFeed();

// ─── BotMind: Smallville-inspired memory + intention layer ───────────────────
class BotMind {
  constructor(botId, config) {
    this.botId      = botId;
    this.config     = config;
    this.memory     = [];        // last 10 real events
    this.currentTask = null;    // { action, detail, station, thought }
    this.intention  = '';        // high-level goal, updated every 5 events
  }

  async onEvent(evt) {
    this.memory.push({ ...evt, ts: Date.now() });
    if (this.memory.length > 10) this.memory.shift();

    const thought = await this.generateThought(evt);
    this.currentTask = {
      action:  evt.action,
      detail:  evt.detail,
      station: evt.station,
      thought,
    };

    if (this.memory.length % 5 === 0) this.intention = await this.reflect();
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

// ─── Bot definitions (right-side stations shifted for market panel) ───────────
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
    station: { x: 950, y: 120 },   // was 1120
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
    station: { x: 950, y: 600 },   // was 1120
    phrases: ['Planning...', 'Tracking tasks...', 'Reviewing...', 'Coordinating...'],
  },
];

// ─── Real market signal types (grounded in actual contractor pain points) ─────
const MARKET_SECTORS = [
  {
    name:     'Slow Responders',
    label:    '🏃 SLOW RESPONDERS',
    color:    0xef4444,
    colorHex: '#ef4444',
    message:  'HVAC co. losing leads — needs 60s response',
  },
  {
    name:     'Hiring Signals',
    label:    '💼 HIRING SIGNALS',
    color:    0x3b82f6,
    colorHex: '#3b82f6',
    message:  'Contractor hiring sales admin — automation gap',
  },
  {
    name:     'Missed Calls',
    label:    '📞 MISSED CALLS',
    color:    0xf97316,
    colorHex: '#f97316',
    message:  '12 missed calls this week — needs AI',
  },
  {
    name:     'New Readers',
    label:    '📚 NEW READERS',
    color:    0x22c55e,
    colorHex: '#22c55e',
    message:  'New BookWorm subscriber',
  },
  {
    name:     'Revenue Opp',
    label:    '💰 REVENUE OPP',
    color:    0xeab308,
    colorHex: '#eab308',
    message:  'Qualified prospect — $500/mo opportunity',
  },
];

// ─── WorldScene ───────────────────────────────────────────────────────────────
class WorldScene extends Phaser.Scene {
  constructor() {
    super({ key: 'WorldScene' });
    this.bots = [];
    this.workstationGlowObjs = [];
    this.eventLog = null;

    // Market counters (start at 0, increment on signals)
    this.leadsCount   = 0;
    this.pipeline     = { prospects: 0, contacted: 0, replies: 0, closed: 0 };
    this.readersCount = 0;
    this.dailyMsgs    = 0;
    this.clientsCount = 0;

    // Live text refs
    this._leadsText      = null;
    this._pipelineTexts  = null;
    this._clientsText    = null;
    this._readersText    = null;
    this._dailyMsgsText  = null;
    this._revTodayText   = null;
    this._revMonthText   = null;
  }

  create() {
    this.drawWorld();
    this.drawMarketHorizon();
    this.addWorkstationGlowPulses();
    this.addRoomDetails();
    this.addRevenueTicker();
    this.createBots();

    for (const bot of this.bots) this.runBotBehavior(bot);
    this.startIdleChecks();
    this.startMarketSignals();

    // Keep HTML status bar in sync with bot minds
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
    window._ocScene = this;
    this.updateConnectionBadge();
  }

  // ── Connection badge ─────────────────────────────────────────────────────
  updateConnectionBadge() {
    this.time.addEvent({
      delay: 2000,
      loop: true,
      callback: () => {
        const connected = window._ocSocket?.connected;
        const badge = document.getElementById('live-badge');
        if (badge) {
          badge.textContent  = connected ? '● LIVE' : '○ OFFLINE';
          badge.style.color  = connected ? '#22c55e' : '#ef4444';
        }
      },
    });
  }

  // ── Handle real activity feed events ────────────────────────────────────
  async handleRealActivity(gameId, evt) {
    const bot = this.bots.find(b => b.config.id === gameId);
    if (!bot) return;

    if (this.eventLog) this.eventLog.addEvent(gameId, evt.action || '', evt.detail || '');

    // Immediate "..." bubble while LLM generates thought
    this.showBubble(bot, '...', 1500);

    // Feed event to BotMind
    const task = await bot.mind.onEvent(evt);
    const el = document.getElementById(`status-${gameId}`);
    if (el) el.textContent = task.thought || task.action;

    // Wormy activity → tick daily message counter
    if (gameId === 'wormy') {
      this.dailyMsgs++;
      if (this._dailyMsgsText) this._dailyMsgsText.setText(`DAILY MSGS: ${this.dailyMsgs}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  MARKET HORIZON PANEL
  // ══════════════════════════════════════════════════════════════════════════
  drawMarketHorizon() {
    const px = MARKET_PANEL_X;
    const pw = WORLD_W - px;   // 180

    // ── Static background & borders ────────────────────────────────────────
    const bg = this.add.graphics().setDepth(5);
    bg.fillStyle(0x060d1a, 1);
    bg.fillRect(px, 0, pw, WORLD_H);

    // Left separator
    bg.lineStyle(1, 0x1e293b, 0.8);
    bg.lineBetween(px, 0, px, WORLD_H);

    // ── Pulsing right-edge glow ────────────────────────────────────────────
    const borderGlow = this.add.graphics().setDepth(6);
    const bState = { alpha: 0.3 };
    this.tweens.add({
      targets: bState,
      alpha: 0.9,
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        borderGlow.clear();
        borderGlow.lineStyle(3, 0xf97316, bState.alpha);
        borderGlow.lineBetween(WORLD_W - 2, 0, WORLD_W - 2, WORLD_H);
      },
    });

    // ── "MARKET" label ─────────────────────────────────────────────────────
    this.add.text(px + pw / 2, 14, 'MARKET', {
      fontSize: '10px', fontFamily: 'monospace', color: '#f97316',
    }).setOrigin(0.5, 0.5).setDepth(10);

    const divG = this.add.graphics().setDepth(10);
    divG.lineStyle(1, 0xf97316, 0.3);
    divG.lineBetween(px + 8, 26, WORLD_W - 8, 26);

    // ── Signal cards ───────────────────────────────────────────────────────
    const cardX   = px + 20;
    const cardW   = 140;
    const cardH   = 36;
    const cardGap = 10;
    let cardY     = 34;

    MARKET_SECTORS.forEach((sector, i) => {
      const cy = cardY + i * (cardH + cardGap);

      // Card fill
      const cg = this.add.graphics().setDepth(11);
      cg.fillStyle(sector.color, 0.10);
      cg.fillRoundedRect(cardX, cy, cardW, cardH, 4);

      // Pulsing border
      const pState = { alpha: 0.4 };
      const pulseG  = this.add.graphics().setDepth(11);
      this.tweens.add({
        targets: pState,
        alpha: 1.0,
        duration: 1400 + i * 280,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          pulseG.clear();
          pulseG.lineStyle(1, sector.color, pState.alpha);
          pulseG.strokeRoundedRect(cardX, cy, cardW, cardH, 4);
        },
      });

      // Label
      this.add.text(cardX + 6, cy + cardH / 2, sector.label, {
        fontSize: '8px', fontFamily: 'monospace', color: sector.colorHex,
      }).setOrigin(0, 0.5).setDepth(12);

      // Signal strength: 5 dots, 2-4 lit depending on index
      const dotLit = 2 + (i % 3);
      for (let d = 0; d < 5; d++) {
        const dotG = this.add.graphics().setDepth(12);
        dotG.fillStyle(sector.color, d < dotLit ? 0.9 : 0.15);
        dotG.fillCircle(cardX + cardW - 8 - (4 - d) * 7, cy + cardH - 9, 2.5);
      }
    });

    // ── "OUTSIDE WORLD →" vertical text ────────────────────────────────────
    const owText = this.add.text(WORLD_W - 6, WORLD_H / 2, 'OUTSIDE WORLD →', {
      fontSize: '8px', fontFamily: 'monospace', color: '#f97316',
    }).setOrigin(0.5, 0.5).setDepth(10).setAlpha(0.22);
    owText.setAngle(-90);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  MARKET SIGNAL PARTICLES
  // ══════════════════════════════════════════════════════════════════════════
  startMarketSignals() {
    const spawnNext = () => {
      this.spawnMarketSignal();
      // Random interval: 8-15 seconds between signals
      this.time.delayedCall(8000 + Math.random() * 7000, spawnNext);
    };
    // First signal after 4 seconds (after boot finishes animating)
    this.time.delayedCall(4000, spawnNext);
  }

  spawnMarketSignal() {
    const sector = MARKET_SECTORS[Math.floor(Math.random() * MARKET_SECTORS.length)];

    // Spawn at a random y inside the market panel, x just inside the left edge
    const startX = MARKET_PANEL_X + 10 + Math.random() * 130;
    const startY = 40 + Math.random() * (WORLD_H - 80);

    const dot = this.add.circle(startX, startY, 6, sector.color).setAlpha(0.9).setDepth(20);

    // Pulse while traveling
    this.tweens.add({ targets: dot, alpha: 0.25, duration: 600, yoyo: true, repeat: -1 });

    // Travel toward center hub over ~3.5 seconds
    const targetX = CENTER.x + (Math.random() - 0.5) * 80;
    const targetY = CENTER.y + (Math.random() - 0.5) * 40;

    this.tweens.add({
      targets: dot,
      x: targetX,
      y: targetY,
      duration: 3500,
      ease: 'Linear',
      onComplete: () => {
        // Absorption flash
        this.tweens.add({
          targets: dot,
          alpha: 0, scaleX: 4, scaleY: 4,
          duration: 400,
          ease: 'Quad.easeOut',
          onComplete: () => dot.destroy(),
        });
        this.handleMarketSignal(sector);
      },
    });
  }

  // ── Process an absorbed market signal ───────────────────────────────────
  handleMarketSignal(sector) {
    // ── Update counters ──────────────────────────────────────────────────
    this.leadsCount++;
    if (this._leadsText) this._leadsText.setText(`📋 LEADS: ${this.leadsCount}`);

    this.pipeline.prospects++;
    if (this._pipelineTexts) {
      this._pipelineTexts.prospects.setText(`→ PROSPECTS: ${this.pipeline.prospects}`);
    }

    if (sector.name === 'New Readers') {
      this.readersCount++;
      if (this._readersText) this._readersText.setText(`📚 READERS: ${this.readersCount}`);
    }

    // ── Flash at hub ─────────────────────────────────────────────────────
    const flash = this.add.circle(CENTER.x, CENTER.y, 20, sector.color, 0.55).setDepth(25);
    this.tweens.add({
      targets: flash,
      alpha: 0, scaleX: 3.5, scaleY: 3.5,
      duration: 600,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });

    // ── Log to fleet status panel ─────────────────────────────────────────
    if (this.eventLog) this.eventLog.addEvent('danpen', sector.name, sector.message.slice(0, 30));

    // ── Bot responds (prefer Dan Pen or Orion if idle) ────────────────────
    const responder =
      this.bots.find(b => !b.isBusy && (b.config.id === 'danpen' || b.config.id === 'orion')) ||
      this.bots.find(b => !b.isBusy);
    if (!responder) return;

    responder.isBusy = true;
    this.walkTo(
      responder,
      CENTER.x + (Math.random() - 0.5) * 80,
      CENTER.y + (Math.random() - 0.5) * 40,
    ).then(() => this.showBubble(responder, sector.message, 3000))
     .then(() => {
       responder.isBusy = false;
       if (responder.mind) {
         responder.mind.onEvent({
           action:  'market signal received',
           detail:  sector.name,
           station: 'center',
         });
       }
     });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  REVENUE TICKER (below Server Room, top-right of main world)
  // ══════════════════════════════════════════════════════════════════════════
  addRevenueTicker() {
    const rx = 808, ry = 252, rw = 175, rh = 58;

    const g = this.add.graphics().setDepth(15);
    g.fillStyle(0x061a0e, 0.92);
    g.fillRoundedRect(rx, ry, rw, rh, 4);
    g.lineStyle(1, 0x22c55e, 0.45);
    g.strokeRoundedRect(rx, ry, rw, rh, 4);

    this.add.text(rx + rw / 2, ry + 10, '💰 REVENUE', {
      fontSize: '9px', fontFamily: 'monospace', color: '#22c55e',
    }).setOrigin(0.5, 0.5).setDepth(16);

    this._revTodayText = this.add.text(rx + 10, ry + 26, '$0 today', {
      fontSize: '11px', fontFamily: 'monospace', color: '#22c55e',
    }).setDepth(16);

    this._revMonthText = this.add.text(rx + 10, ry + 42, '$0 this month', {
      fontSize: '10px', fontFamily: 'monospace', color: '#4ade80',
    }).setDepth(16).setAlpha(0.75);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  ROOM DETAIL OVERLAYS
  // ══════════════════════════════════════════════════════════════════════════
  addRoomDetails() {
    // ── Dan Pen's Research Station (top-left: x=0-300, y=0-240) ───────────

    // PITCH STAT panel (real data: 60s vs 47min avg = 400% more conversions)
    const psX = 8, psY = 138, psW = 205, psH = 55;
    const psG = this.add.graphics().setDepth(14);
    psG.fillStyle(0x1a0e05, 0.95);
    psG.fillRoundedRect(psX, psY, psW, psH, 4);
    psG.lineStyle(1, 0xf97316, 0.45);
    psG.strokeRoundedRect(psX, psY, psW, psH, 4);

    this.add.text(psX + psW / 2, psY + 10, '⚡ 60 SEC RESPONSE', {
      fontSize: '8px', fontFamily: 'monospace', color: '#f97316',
    }).setOrigin(0.5, 0.5).setDepth(15);
    this.add.text(psX + psW / 2, psY + 25, 'vs avg 47 MIN', {
      fontSize: '8px', fontFamily: 'monospace', color: '#fbbf24',
    }).setOrigin(0.5, 0.5).setDepth(15);
    this.add.text(psX + psW / 2, psY + 40, '= 400% MORE CONVERSIONS', {
      fontSize: '8px', fontFamily: 'monospace', color: '#22c55e',
    }).setOrigin(0.5, 0.5).setDepth(15);

    // LEADS counter
    this._leadsText = this.add.text(10, 200, '📋 LEADS: 0', {
      fontSize: '9px', fontFamily: 'monospace', color: '#f97316',
    }).setDepth(15);

    // Target label
    this.add.text(10, 216, 'TARGET: HVAC / HOME SVCS', {
      fontSize: '8px', fontFamily: 'monospace', color: '#f97316',
    }).setDepth(15).setAlpha(0.55);

    // Blinking cursor on Dan Pen's terminal screen
    // Screen is drawn at (ws.x-10, ws.y-20) = (110, 80), size 20×10
    const cursor = this.add.rectangle(124, 84, 1, 7, 0xf97316).setDepth(16);
    this.time.addEvent({
      delay: 500, loop: true,
      callback: () => cursor.setVisible(!cursor.visible),
    });

    // ── Mech's Server Room (top-right: x=800-1100, y=0-240) ───────────────
    const mechX = 800;

    const cdG = this.add.graphics().setDepth(14);
    cdG.fillStyle(0x050d1a, 0.95);
    cdG.fillRoundedRect(mechX + 8, 194, 168, 44, 4);
    cdG.lineStyle(1, 0x3b82f6, 0.45);
    cdG.strokeRoundedRect(mechX + 8, 194, 168, 44, 4);

    this._clientsText = this.add.text(mechX + 14, 203, '⚙ CLIENTS: 0', {
      fontSize: '9px', fontFamily: 'monospace', color: '#3b82f6',
    }).setDepth(15);

    this.add.text(mechX + 14, 218, 'CAPACITY: 500', {
      fontSize: '8px', fontFamily: 'monospace', color: '#60a5fa',
    }).setDepth(15).setAlpha(0.65);

    // Capacity bar (empty for now)
    const capG = this.add.graphics().setDepth(15);
    capG.fillStyle(0x1e3a5f, 1);
    capG.fillRect(mechX + 14, 230, 148, 4);
    // Filled portion (0% = not visible yet)
    this._capacityBarG = this.add.graphics().setDepth(15);

    // ── Wormy's Comms Hub (bottom-left: x=0-300, y=480-720) ───────────────
    const wY = WORLD_H - 240;  // 480

    const wuG = this.add.graphics().setDepth(14);
    wuG.fillStyle(0x051a0a, 0.95);
    wuG.fillRoundedRect(8, wY + 140, 195, 50, 4);
    wuG.lineStyle(1, 0x22c55e, 0.45);
    wuG.strokeRoundedRect(8, wY + 140, 195, 50, 4);

    this._readersText = this.add.text(14, wY + 150, '📚 READERS: 0', {
      fontSize: '9px', fontFamily: 'monospace', color: '#22c55e',
    }).setDepth(15);

    this._dailyMsgsText = this.add.text(14, wY + 166, 'DAILY MSGS: 0', {
      fontSize: '9px', fontFamily: 'monospace', color: '#4ade80',
    }).setDepth(15).setAlpha(0.7);

    // ── Orion's Project Board (bottom-right: x=800-1100, y=480-720) ────────
    const orX = 800;
    const orY = WORLD_H - 240;  // 480

    const plG = this.add.graphics().setDepth(14);
    plG.fillStyle(0x0d0519, 0.95);
    plG.fillRoundedRect(orX + 8, orY + 108, 175, 98, 4);
    plG.lineStyle(1, 0xa855f7, 0.45);
    plG.strokeRoundedRect(orX + 8, orY + 108, 175, 98, 4);

    this.add.text(orX + 16, orY + 117, 'PIPELINE', {
      fontSize: '9px', fontFamily: 'monospace', color: '#a855f7',
    }).setDepth(15);

    const plLineY  = orY + 132;
    const plSpacing = 18;
    this._pipelineTexts = {
      prospects: this.add.text(orX + 16, plLineY,                    '→ PROSPECTS: 0', { fontSize: '9px', fontFamily: 'monospace', color: '#22c55e' }).setDepth(15),
      contacted:  this.add.text(orX + 16, plLineY + plSpacing,       '→ CONTACTED: 0', { fontSize: '9px', fontFamily: 'monospace', color: '#22c55e' }).setDepth(15).setAlpha(0.75),
      replies:    this.add.text(orX + 16, plLineY + plSpacing * 2,   '→ REPLIES: 0',   { fontSize: '9px', fontFamily: 'monospace', color: '#22c55e' }).setDepth(15).setAlpha(0.6),
      closed:     this.add.text(orX + 16, plLineY + plSpacing * 3,   '→ CLOSED: 0',    { fontSize: '9px', fontFamily: 'monospace', color: '#22c55e' }).setDepth(15).setAlpha(0.45),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  DRAW WORLD (rooms, grid, decorative elements — all shifted for market panel)
  // ══════════════════════════════════════════════════════════════════════════
  drawWorld() {
    const g = this.add.graphics();

    // Background (main area 0-MARKET_PANEL_X only)
    g.fillStyle(0x0f172a);
    g.fillRect(0, 0, MAIN_W, WORLD_H);

    // Grid lines
    g.lineStyle(1, 0x1e293b, 0.6);
    for (let x = 0; x <= MAIN_W; x += 40) g.lineBetween(x, 0, x, WORLD_H);
    for (let y = 0; y <= WORLD_H; y += 40) g.lineBetween(0, y, MAIN_W, y);

    // ── Room definitions (right rooms at x=800, was x=960) ────────────────
    const rooms = [
      { x: 0,    y: 0,             w: 300, h: 240, color: 0xf97316, fill: 0x1a0e05, label: 'RESEARCH STATION' },
      { x: 800,  y: 0,             w: 300, h: 240, color: 0x3b82f6, fill: 0x050d1a, label: 'SERVER ROOM' },
      { x: 0,    y: WORLD_H - 240, w: 300, h: 240, color: 0x22c55e, fill: 0x051a0a, label: 'COMMS HUB' },
      { x: 800,  y: WORLD_H - 240, w: 300, h: 240, color: 0xa855f7, fill: 0x0d0519, label: 'PROJECT BOARD' },
    ];

    rooms.forEach(room => {
      g.fillStyle(room.fill);
      g.fillRect(room.x, room.y, room.w, room.h);

      g.lineStyle(4, room.color, 0.2);
      g.strokeRect(room.x + 2, room.y + 2, room.w - 4, room.h - 4);
      g.lineStyle(2, room.color, 0.7);
      g.strokeRect(room.x, room.y, room.w, room.h);
      g.lineStyle(1, room.color, 1.0);
      g.strokeRect(room.x + 1, room.y + 1, room.w - 2, room.h - 2);

      const cs = 16;
      g.lineStyle(3, room.color, 1.0);
      g.lineBetween(room.x, room.y, room.x + cs, room.y);
      g.lineBetween(room.x, room.y, room.x, room.y + cs);
      g.lineBetween(room.x + room.w, room.y, room.x + room.w - cs, room.y);
      g.lineBetween(room.x + room.w, room.y, room.x + room.w, room.y + cs);
      g.lineBetween(room.x, room.y + room.h, room.x + cs, room.y + room.h);
      g.lineBetween(room.x, room.y + room.h, room.x, room.y + room.h - cs);
      g.lineBetween(room.x + room.w, room.y + room.h, room.x + room.w - cs, room.y + room.h);
      g.lineBetween(room.x + room.w, room.y + room.h, room.x + room.w, room.y + room.h - cs);

      this.add.text(room.x + room.w / 2, room.y + 14, room.label, {
        fontSize: '10px', fontFamily: 'monospace',
        color: Phaser.Display.Color.IntegerToColor(room.color).rgba,
      }).setOrigin(0.5, 0.5).setAlpha(0.7);
    });

    // ── Workstations (updated positions for right-side rooms) ─────────────
    const workstations = [
      { x: 120,  y: 100,           color: 0xf97316 },
      { x: 950,  y: 100,           color: 0x3b82f6 },
      { x: 120,  y: WORLD_H - 100, color: 0x22c55e },
      { x: 950,  y: WORLD_H - 100, color: 0xa855f7 },
    ];

    workstations.forEach(ws => {
      g.fillStyle(ws.color, 0.06);
      g.fillRect(ws.x - 36, ws.y - 22, 72, 44);
      g.fillStyle(ws.color, 0.12);
      g.fillRect(ws.x - 28, ws.y - 16, 56, 32);
      g.fillStyle(0x1e293b);
      g.fillRect(ws.x - 22, ws.y - 10, 44, 20);
      g.lineStyle(1.5, ws.color, 0.9);
      g.strokeRect(ws.x - 22, ws.y - 10, 44, 20);
      g.fillStyle(0x0f172a);
      g.fillRect(ws.x - 12, ws.y - 22, 24, 14);
      g.lineStyle(1, ws.color, 0.7);
      g.strokeRect(ws.x - 12, ws.y - 22, 24, 14);
      g.fillStyle(ws.color, 0.3);
      g.fillRect(ws.x - 10, ws.y - 20, 20, 10);
    });

    // ── Central hub (shifted to MAIN_W center: x=550) ─────────────────────
    g.lineStyle(1, 0x334155, 0.5);
    g.strokeCircle(CENTER.x, CENTER.y, 120);
    g.lineStyle(1, 0x334155, 0.3);
    g.strokeCircle(CENTER.x, CENTER.y, 80);
    g.fillStyle(0x334155, 0.6);
    g.fillCircle(CENTER.x, CENTER.y, 6);

    // Connection lines from center to room corners
    g.lineStyle(1, 0x1e293b, 0.4);
    g.lineBetween(CENTER.x, CENTER.y, 300, 240);
    g.lineBetween(CENTER.x, CENTER.y, 800, 240);
    g.lineBetween(CENTER.x, CENTER.y, 300, WORLD_H - 240);
    g.lineBetween(CENTER.x, CENTER.y, 800, WORLD_H - 240);

    // ── Decorative: server rack (Server Room now at x=800) ────────────────
    const srX = 812;
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

    // ── Decorative: research bookshelf (top-left) ─────────────────────────
    for (let i = 0; i < 5; i++) {
      const bColors = [0xf97316, 0xfbbf24, 0xef4444, 0xf97316, 0xfde68a];
      g.fillStyle(bColors[i], 0.7);
      g.fillRect(20 + i * 14, 40, 12, 22);
    }
    g.lineStyle(1, 0xf97316, 0.3);
    g.strokeRect(18, 38, 74, 26);

    // ── Decorative: project sticky notes (Project Board now at x=800) ─────
    const pbX = 812;
    const pbY = WORLD_H - 220;
    g.fillStyle(0x1e293b);
    g.fillRect(pbX, pbY, 80, 60);
    g.lineStyle(1, 0xa855f7, 0.5);
    g.strokeRect(pbX, pbY, 80, 60);
    const noteColors = [0xa855f7, 0xc084fc, 0x7c3aed];
    for (let i = 0; i < 3; i++) {
      g.fillStyle(noteColors[i], 0.4);
      g.fillRect(pbX + 4 + i * 26, pbY + 6, 22, 16);
    }
    for (let i = 0; i < 3; i++) {
      g.fillStyle(noteColors[i], 0.3);
      g.fillRect(pbX + 4 + i * 26, pbY + 28, 22, 16);
    }

    // Scanlines (subtle CRT effect)
    for (let y = 0; y < WORLD_H; y += 4) {
      g.lineStyle(1, 0x000000, 0.04);
      g.lineBetween(0, y, MAIN_W, y);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  WORKSTATION GLOW PULSES
  // ══════════════════════════════════════════════════════════════════════════
  addWorkstationGlowPulses() {
    const workstations = [
      { x: 120,  y: 100,           color: 0xf97316 },
      { x: 950,  y: 100,           color: 0x3b82f6 },
      { x: 120,  y: WORLD_H - 100, color: 0x22c55e },
      { x: 950,  y: WORLD_H - 100, color: 0xa855f7 },
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

  // ══════════════════════════════════════════════════════════════════════════
  //  BOT CREATION
  // ══════════════════════════════════════════════════════════════════════════
  createBots() {
    BOTS.forEach(botDef => {
      const bot = this.createBotSprite(botDef);
      bot.def    = botDef;
      bot.config = botDef;
      bot.phraseIndex      = 0;
      bot.currentActivity  = botDef.phrases[0];
      bot.isMoving         = false;
      bot.bubble           = null;
      bot.bubbleBg         = null;
      bot.chatting         = false;
      bot.isMeeting        = false;
      bot.isBusy           = false;
      bot.lastMoveTime     = Date.now();
      bot.mind             = new BotMind(botDef.id, botDef);
      this.bots.push(bot);

      bot.setInteractive(
        new Phaser.Geom.Rectangle(-15, -22, 30, 52),
        Phaser.Geom.Rectangle.Contains
      );
      bot.on('pointerdown', () => {
        if (typeof window.openConversationPanel === 'function') window.openConversationPanel(botDef);
      });
      bot.on('pointerover', () => {
        document.body.style.cursor = 'pointer';
        this.tweens.add({ targets: bot, scaleX: 1.08, scaleY: 1.08, duration: 120, ease: 'Quad.easeOut' });
      });
      bot.on('pointerout', () => {
        document.body.style.cursor = 'default';
        this.tweens.add({ targets: bot, scaleX: 1, scaleY: 1, duration: 120, ease: 'Quad.easeOut' });
      });
    });
  }

  clearBotBubble(botId) {
    const bot = this.bots.find(b => b.def && b.def.id === botId);
    if (!bot) return;
    if (bot.bubbleBg) { bot.bubbleBg.destroy(); bot.bubbleBg = null; }
    if (bot.bubble)   { bot.bubble = null; }
  }

  createBotSprite(def) {
    const container = this.add.container(def.station.x, def.station.y);
    container.setDepth(30);
    const g = this.add.graphics();

    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(0, 18, 22, 8);

    g.fillStyle(def.color);
    g.fillRect(-10, -4, 20, 28);

    g.fillStyle(0xffffff, 0.15);
    g.fillRect(-8, -2, 6, 12);

    g.fillStyle(0x000000, 0.2);
    g.fillRect(-10, 10, 20, 3);

    g.fillStyle(def.color);
    g.fillCircle(0, -12, 9);

    g.fillStyle(0xffffff, 0.2);
    g.fillCircle(-3, -15, 4);

    g.fillStyle(0xffffff);
    g.fillRect(-5, -15, 3, 4);
    g.fillRect(2, -15, 3, 4);

    g.fillStyle(def.color, 0.8);
    g.fillRect(-4, -14, 2, 2);
    g.fillRect(3, -14, 2, 2);

    g.lineStyle(1.5, def.color, 0.8);
    g.lineBetween(0, -21, 0, -28);
    g.fillStyle(def.color);
    g.fillCircle(0, -29, 2.5);

    container.add(g);

    const nameTag = this.add.text(0, 28, def.name, {
      fontSize: '9px',
      fontFamily: 'monospace',
      color: Phaser.Display.Color.IntegerToColor(def.color).rgba,
      stroke: '#0f172a',
      strokeThickness: 3,
    }).setOrigin(0.5, 0);
    container.add(nameTag);

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

  // ══════════════════════════════════════════════════════════════════════════
  //  SMALLVILLE INTENTION-DRIVEN BEHAVIOR LOOP (preserved from Phase 4)
  // ══════════════════════════════════════════════════════════════════════════
  async runBotBehavior(bot) {
    await this.delay(
      bot.config.id === 'danpen' ? 0 :
      bot.config.id === 'mech'   ? 600 :
      bot.config.id === 'wormy'  ? 1200 : 1800
    );

    while (true) {
      const mind = bot.mind;

      if (mind.currentTask) {
        const coords = STATION_COORDS[mind.currentTask.station] || bot.config.station;
        await this.walkTo(bot, coords.x, coords.y);
        const display = mind.currentTask.thought || mind.currentTask.action;
        await this.showBubble(bot, display, 3000);
        mind.currentTask = null;
      } else if (mind.intention) {
        if (Math.random() < 0.3) await this.showBubble(bot, mind.intention, 2000);
        const jitter = {
          x: bot.x + (Math.random() - 0.5) * 20,
          y: bot.y + (Math.random() - 0.5) * 10,
        };
        await this.walkTo(bot, jitter.x, jitter.y);
        await this.delay(2000 + Math.random() * 3000);
      } else {
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
      const dx   = targetX - bot.x;
      const dy   = targetY - bot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 5) { resolve(); return; }

      bot.lastMoveTime = Date.now();
      const speed    = 120 + Math.random() * 60;
      const duration = (dist / speed) * 1000;

      this.tweens.add({
        targets: bot,
        x: targetX,
        y: targetY,
        duration: Math.min(duration, 4000),
        ease: 'Linear',
        onComplete: () => { bot.lastMoveTime = Date.now(); resolve(); },
      });
    });
  }

  showBubble(bot, text, duration) {
    return new Promise(resolve => {
      if (bot.bubble)   bot.bubble.destroy();
      if (bot.bubbleBg) bot.bubbleBg.destroy();

      const padding = { x: 10, y: 6 };
      const style   = { fontSize: '11px', fontFamily: 'monospace', color: '#1e293b' };

      const txt = this.add.text(0, 0, text, style);
      const tw  = txt.width  + padding.x * 2;
      const th  = txt.height + padding.y * 2;

      const bg = this.add.graphics();
      const drawBubble = (alpha) => {
        bg.clear();
        bg.fillStyle(0xffffff, alpha * 0.95);
        bg.fillRoundedRect(-tw / 2, -th - 6, tw, th, 6);
        bg.fillTriangle(-5, -6, 5, -6, 0, 0);
        bg.lineStyle(1, 0xcccccc, alpha * 0.5);
        bg.strokeRoundedRect(-tw / 2, -th - 6, tw, th, 6);
      };
      drawBubble(1);

      txt.setOrigin(0.5, 1).setPosition(0, -8);

      const yOffset = -50;
      const bubbleContainer = this.add.container(bot.x, bot.y + yOffset);
      bubbleContainer.setDepth(60);
      bubbleContainer.add(bg);
      bubbleContainer.add(txt);

      bot.bubble   = txt;
      bot.bubbleBg = bubbleContainer;

      const updatePos = () => {
        if (bubbleContainer.active) bubbleContainer.setPosition(bot.x, bot.y + yOffset);
      };
      this.events.on('update', updatePos);

      bubbleContainer.setAlpha(0);
      this.tweens.add({ targets: bubbleContainer, alpha: 1, duration: 200, ease: 'Linear' });

      this.time.delayedCall(duration - 300, () => {
        this.tweens.add({
          targets: bubbleContainer,
          alpha: 0,
          duration: 300,
          ease: 'Linear',
          onComplete: () => {
            this.events.off('update', updatePos);
            bubbleContainer.destroy();
            bot.bubble   = null;
            bot.bubbleBg = null;
            resolve();
          },
        });
      });
    });
  }

  // ── Multi-bot meeting animation (preserved) ──────────────────────────────
  async meetBots(botIdA, botIdB, message) {
    const botA = this.bots.find(b => b.config.id === botIdA);
    const botB = this.bots.find(b => b.config.id === botIdB);
    if (!botA || !botB || botA.isMeeting || botB.isMeeting) return;

    botA.isMeeting = true;
    botB.isMeeting = true;

    const stA  = botA.config.station;
    const stB  = botB.config.station;
    const midX = (stA.x + stB.x) / 2;
    const midY = (stA.y + stB.y) / 2;
    const dx   = stB.x - stA.x;
    const dy   = stB.y - stA.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx   = dx / dist;
    const ny   = dy / dist;
    const gap  = 30;

    await Promise.all([
      this.walkTo(botA, midX - nx * gap, midY - ny * gap),
      this.walkTo(botB, midX + nx * gap, midY + ny * gap),
    ]);

    const lineG     = this.add.graphics();
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
      repeat: 7,
      ease: 'Sine.easeInOut',
      onUpdate: updateLine,
      onComplete: () => lineG.destroy(),
    });

    const trimmed = (message || '').slice(0, 40);
    await Promise.all([
      this.showBubble(botA, trimmed, 2000),
      this.showBubble(botB, '...', 2000),
    ]);
    await this.wait(200);

    await Promise.all([
      this.walkTo(botA, stA.x, stA.y),
      this.walkTo(botB, stB.x, stB.y),
    ]);
    botA.isMeeting = false;
    botB.isMeeting = false;
  }

  glowBot(botId) {
    const bot = this.bots.find(b => b.config.id === botId);
    if (!bot) return;
    this.tweens.add({
      targets: bot,
      scaleX: 1.25, scaleY: 1.25,
      duration: 180, yoyo: true, repeat: 3,
      ease: 'Sine.easeInOut',
    });
  }

  // ── Ambient idle animations ─────────────────────────────────────────────
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
        this.tweens.add({
          targets: bot,
          x: bot.x + (Math.random() - 0.5) * 6,
          y: bot.y + (Math.random() - 0.5) * 6,
          duration: 400, ease: 'Sine.easeInOut', yoyo: true,
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
    // Bubble following handled by event listener in showBubble
  }
}

// ─── EventLog: Fleet Status panel (center-bottom, avoids market panel) ────────
class EventLog {
  constructor(scene) {
    this.scene      = scene;
    this.events     = [];
    this.maxEvents  = 5;

    this.panelW  = 210;
    this.panelH  = 140;
    this.panelX  = 450;                         // center-bottom of main world
    this.panelY  = WORLD_H - 10 - this.panelH;

    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.72);
    bg.fillRoundedRect(this.panelX, this.panelY, this.panelW, this.panelH, 5);
    bg.lineStyle(1, 0x1e293b, 1);
    bg.strokeRoundedRect(this.panelX, this.panelY, this.panelW, this.panelH, 5);
    bg.setDepth(50);

    const title = scene.add.text(this.panelX + 8, this.panelY + 6, 'FLEET STATUS', {
      fontSize: '8px', fontFamily: 'monospace', color: '#475569',
    }).setDepth(51);

    const div = scene.add.graphics().setDepth(51);
    div.lineStyle(1, 0x1e293b, 0.8);
    div.lineBetween(this.panelX + 6, this.panelY + 19, this.panelX + this.panelW - 6, this.panelY + 19);

    this.textLines = [];
    for (let i = 0; i < this.maxEvents; i++) {
      const line = scene.add.text(
        this.panelX + 8,
        this.panelY + 24 + i * 22,
        '',
        {
          fontSize: '10px', fontFamily: 'monospace', color: '#64748b',
          wordWrap: { width: this.panelW - 16 },
        }
      ).setDepth(52);
      this.textLines.push(line);
    }
  }

  addEvent(botId, action, detail) {
    const BOT_EMOJIS = { danpen: '🔬', mech: '⚙️', wormy: '💬', orion: '📋' };
    const BOT_COLORS = { danpen: '#f97316', mech: '#3b82f6', wormy: '#22c55e', orion: '#a855f7' };
    const emoji = BOT_EMOJIS[botId] || '🤖';
    const color = BOT_COLORS[botId]  || '#94a3b8';
    const label = `${emoji} ${(action || '').slice(0, 18)}`;
    const sub   = detail ? `: ${detail.slice(0, 20)}` : '';

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

// ─── BootScene ────────────────────────────────────────────────────────────────
class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'BootScene' }); }

  create() {
    const g = this.add.graphics();
    g.fillStyle(0x0f172a);
    g.fillRect(0, 0, WORLD_W, WORLD_H);

    this.add.text(WORLD_W / 2, WORLD_H / 2 - 30, '⚡ OPENCLAW WORLD', {
      fontSize: '32px', fontFamily: 'monospace', color: '#f97316',
    }).setOrigin(0.5);

    const sub = this.add.text(WORLD_W / 2, WORLD_H / 2 + 20, 'Scanning market feed...', {
      fontSize: '14px', fontFamily: 'monospace', color: '#64748b',
    }).setOrigin(0.5);

    this.time.addEvent({ delay: 500, repeat: 4, callback: () => sub.setVisible(!sub.visible) });
    this.time.delayedCall(2500, () => this.scene.start('WorldScene'));
  }
}

// ─── Boot the game ────────────────────────────────────────────────────────────
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

  window._ocGame = new Phaser.Game(config);
});
