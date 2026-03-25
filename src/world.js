// OpenClaw World — Phase 2
// 4 AI bots walking around a sci-fi office/lab
// Real-time activity feed via Socket.io from 82.197.92.190:3001

// ─── Real-time activity connection ───────────────────────────────────────────
const ACTIVITY_SERVER = 'http://82.197.92.190:3001';

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
  }

  create() {
    this.drawWorld();
    this.createBots();
    this.startBotLoops();
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

  handleRealActivity(gameId, evt) {
    // Find the bot object
    const bot = this.bots.find(b => b.config.id === gameId);
    if (!bot || bot.isBusy) return;

    // Map station name to coordinates
    const coords = STATION_COORDS[evt.station] || STATION_COORDS.research;

    // Interrupt current loop and react to real event
    bot.isBusy = true;
    const detail = evt.detail ? `${evt.action}: ${evt.detail}` : evt.action;
    this.walkTo(bot, coords.x, coords.y).then(() => {
      this.showBubble(bot, detail, 3000).then(() => {
        bot.isBusy = false;
      });
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
      bot.phraseIndex = 0;
      bot.currentActivity = botDef.phrases[0];
      bot.isMoving = false;
      bot.bubble = null;
      bot.bubbleBg = null;
      bot.chatting = false;
      this.bots.push(bot);
    });
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

  startBotLoops() {
    BOTS.forEach((def, i) => {
      // Stagger initial start times
      this.time.delayedCall(i * 800 + Math.random() * 1000, () => {
        this.runBotLoop(this.bots[i], def);
      });
    });
  }

  runBotLoop(bot, def) {
    // Stop any existing walk bob and restart cleanly
    const loop = async () => {
      // 1. Walk to workstation
      await this.walkTo(bot, def.station.x, def.station.y);

      // 2. Show activity bubble
      const phrase = def.phrases[bot.phraseIndex % def.phrases.length];
      bot.phraseIndex++;
      bot.currentActivity = phrase;
      this.updateStatus(def.id, phrase);
      await this.showBubble(bot, phrase, 2500 + Math.random() * 1000);

      // 3. Walk to center
      const jitter = { x: (Math.random() - 0.5) * 80, y: (Math.random() - 0.5) * 80 };
      await this.walkTo(bot, CENTER.x + jitter.x, CENTER.y + jitter.y);

      // 4. 30% chance: walk toward another bot and chat
      if (Math.random() < 0.30) {
        const others = this.bots.filter(b => b !== bot && !b.chatting);
        if (others.length > 0) {
          const other = others[Math.floor(Math.random() * others.length)];
          const midX = (bot.x + other.x) / 2;
          const midY = (bot.y + other.y) / 2;
          bot.chatting = true;
          other.chatting = true;
          bot.currentActivity = 'Chatting...';
          other.currentActivity = 'Chatting...';
          this.updateStatus(def.id, 'Chatting...');
          this.updateStatus(other.def.id, 'Chatting...');
          await Promise.all([
            this.walkTo(bot, midX - 20, midY),
            this.walkTo(other, midX + 20, midY),
          ]);
          await Promise.all([
            this.showBubble(bot, '...', 2000),
            this.showBubble(other, '...', 2000),
          ]);
          bot.chatting = false;
          other.chatting = false;
        }
      }

      // 5. Walk back to station
      bot.currentActivity = 'Returning...';
      this.updateStatus(def.id, 'Returning...');
      await this.walkTo(bot, def.station.x, def.station.y);

      // 6. Short pause then repeat
      await this.wait(500 + Math.random() * 1000);
      loop();
    };

    loop();
  }

  walkTo(bot, targetX, targetY) {
    return new Promise(resolve => {
      const dx = targetX - bot.x;
      const dy = targetY - bot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 5) { resolve(); return; }

      const speed = 120 + Math.random() * 60; // pixels per second
      const duration = (dist / speed) * 1000;

      this.tweens.add({
        targets: bot,
        x: targetX,
        y: targetY,
        duration: Math.min(duration, 4000),
        ease: 'Linear',
        onComplete: () => resolve(),
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
