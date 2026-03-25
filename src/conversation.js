// ─── Phase 3: Talking Avatars ─────────────────────────────────────────────────
// Conversation panel, pixel-art face with mouth animation, LLM via OpenRouter,
// and Text-to-Speech via Web Speech API.

const OPENROUTER_KEY = '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';

// ─── State ────────────────────────────────────────────────────────────────────
let currentBot     = null;
let chatHistory    = [];
let speakEnabled   = true;
let isAnimMouth    = false;
let mouthStateIdx  = 0;
let mouthTimer     = null;
let faceRafId      = null;
let currentMouth   = 'CLOSED';

const MOUTH_CYCLE = ['CLOSED', 'OPEN_SMALL', 'OPEN_MID', 'OPEN_LARGE', 'OPEN_MID', 'OPEN_SMALL'];

// ─── System prompts ───────────────────────────────────────────────────────────
const SYSTEM_PROMPTS = {
  danpen: "You are Dan Pen, the research and skill-building bot in the OpenClaw fleet. You run on a Hostinger VPS. You're direct, builder-minded, and love solving problems. Keep responses under 3 sentences.",
  mech:   "You are Mech, the fleet engineer bot. You manage deployments, health checks, and infrastructure. You're technical, precise, and efficient. Keep responses under 3 sentences.",
  wormy:  "You are Wormy, the user-facing BookWorm bot. You help users read and study books chapter by chapter. You're warm, encouraging, and knowledgeable. Keep responses under 3 sentences.",
  orion:  "You are Orion, the project manager bot. You track tasks, coordinate the fleet, and keep projects moving. You're organized, strategic, and focused. Keep responses under 3 sentences.",
};

// ─── LLM ─────────────────────────────────────────────────────────────────────
async function getBotResponse(botId, userMessage, history) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.href,
      'X-Title': 'OpenClaw World',
    },
    body: JSON.stringify({
      model: 'google/gemini-flash-1.5',
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS[botId] || SYSTEM_PROMPTS.danpen },
        ...history.slice(-4),
        { role: 'user', content: userMessage },
      ],
    }),
  });
  const data = await res.json();
  if (!data.choices || !data.choices[0]) {
    throw new Error(data.error?.message || 'No response from LLM');
  }
  return data.choices[0].message.content;
}

// ─── TTS ──────────────────────────────────────────────────────────────────────
function speakText(text) {
  if (!window.speechSynthesis || !speakEnabled) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate  = 0.9;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  utterance.onstart = () => startMouthAnim();
  utterance.onend   = () => stopMouthAnim();
  utterance.onerror = () => stopMouthAnim();
  window.speechSynthesis.speak(utterance);
}

// ─── Mouth animation ──────────────────────────────────────────────────────────
function startMouthAnim() {
  if (isAnimMouth) return;
  isAnimMouth   = true;
  mouthStateIdx = 0;
  (function tick() {
    if (!isAnimMouth) { currentMouth = 'CLOSED'; return; }
    currentMouth = MOUTH_CYCLE[mouthStateIdx % MOUTH_CYCLE.length];
    mouthStateIdx++;
    mouthTimer = setTimeout(tick, 80);
  })();
}

function stopMouthAnim() {
  isAnimMouth  = false;
  clearTimeout(mouthTimer);
  currentMouth = 'CLOSED';
}

// ─── Pixel-art face renderer ──────────────────────────────────────────────────
// 20×20 logical grid, scaled to canvas size (canvas is 160×160 → scale = 8)
function drawFace(canvas, botCfg, mouthState) {
  if (!canvas || !botCfg) return;
  const ctx = canvas.getContext('2d');
  const S   = canvas.width / 20; // scale factor per logical pixel

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ── Background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0a0f1e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ── Face plate (logical cols 4-15, rows 4-17) ────────────────────────────
  const fx = 4 * S, fy = 4 * S, fw = 12 * S, fh = 13 * S;
  const r  = S;

  // Dark base
  ctx.fillStyle = '#1e293b';
  roundRect(ctx, fx, fy, fw, fh, r);
  ctx.fill();

  // Tinted overlay with bot color
  ctx.fillStyle = hexToRgba(botCfg.colorHex, 0.18);
  roundRect(ctx, fx, fy, fw, fh, r);
  ctx.fill();

  // ── Antenna ──────────────────────────────────────────────────────────────
  ctx.strokeStyle = botCfg.colorHex;
  ctx.lineWidth   = Math.max(1, S * 0.7);
  ctx.beginPath();
  ctx.moveTo(10 * S, fy);
  ctx.lineTo(10 * S, 1 * S);
  ctx.stroke();

  // Antenna tip dot (2×2)
  ctx.fillStyle = botCfg.colorHex;
  ctx.fillRect(9 * S, 0, 2 * S, 2 * S);

  // ── Eyes ─────────────────────────────────────────────────────────────────
  // Left eye at logical (6, 7), right eye at (12, 7) — 2×2 white blocks
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(6 * S, 7 * S, 2 * S, 2 * S);
  ctx.fillRect(12 * S, 7 * S, 2 * S, 2 * S);

  // Pupils — 1×1 in bot accent color
  ctx.fillStyle = botCfg.colorHex;
  ctx.fillRect(7 * S, 8 * S, S, S);
  ctx.fillRect(13 * S, 8 * S, S, S);

  // Eye glow (subtle)
  ctx.fillStyle = hexToRgba(botCfg.colorHex, 0.25);
  ctx.fillRect(6 * S - 1, 7 * S - 1, 2 * S + 2, 2 * S + 2);
  ctx.fillRect(12 * S - 1, 7 * S - 1, 2 * S + 2, 2 * S + 2);

  // ── Mouth ─────────────────────────────────────────────────────────────────
  // Center of mouth at logical col 10, row 14
  const mx = 10 * S;
  const my = 14 * S;

  ctx.fillStyle = '#000000';

  switch (mouthState) {
    case 'CLOSED':
      // 4px wide, 1px tall line in accent color
      ctx.fillStyle = botCfg.colorHex;
      ctx.fillRect(mx - 2 * S, my, 4 * S, Math.max(1, S * 0.6));
      break;
    case 'OPEN_SMALL':
      ctx.fillRect(mx - 1.5 * S, my - 0.5 * S, 3 * S, 2 * S);
      // Teeth hint
      ctx.fillStyle = '#334155';
      ctx.fillRect(mx - S, my - 0.5 * S, 2 * S, 0.8 * S);
      break;
    case 'OPEN_MID':
      ctx.fillRect(mx - 2 * S, my - S, 4 * S, 3 * S);
      ctx.fillStyle = '#334155';
      ctx.fillRect(mx - 1.5 * S, my - S, 3 * S, S);
      break;
    case 'OPEN_LARGE':
      ctx.fillRect(mx - 2.5 * S, my - 1.5 * S, 5 * S, 4 * S);
      ctx.fillStyle = '#334155';
      ctx.fillRect(mx - 2 * S, my - 1.5 * S, 4 * S, S);
      break;
  }

  // ── Face border glow ──────────────────────────────────────────────────────
  ctx.strokeStyle = hexToRgba(botCfg.colorHex, 0.5);
  ctx.lineWidth   = Math.max(1, S * 0.3);
  roundRect(ctx, fx, fy, fw, fh, r);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hexToRgba(hex, alpha) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Face render loop ─────────────────────────────────────────────────────────
function startFaceLoop() {
  const canvas = document.getElementById('bot-face');
  if (!canvas) return;
  stopFaceLoop();

  (function loop() {
    if (!currentBot) return;
    drawFace(canvas, currentBot, currentMouth);
    faceRafId = requestAnimationFrame(loop);
  })();
}

function stopFaceLoop() {
  if (faceRafId) { cancelAnimationFrame(faceRafId); faceRafId = null; }
}

// ─── Chat helpers ─────────────────────────────────────────────────────────────
function addChatMessage(role, text) {
  const hist = document.getElementById('chat-history');
  if (!hist) return;

  const el = document.createElement('div');

  if (role === 'user') {
    el.style.cssText = 'margin-bottom:10px; padding:6px 10px; border-radius:6px; background:#334155; color:#e2e8f0; margin-left:24px; word-break:break-word;';
    el.textContent = '▸ ' + text;
  } else if (role === 'assistant') {
    const color = currentBot ? currentBot.colorHex : '#f97316';
    const name  = currentBot ? currentBot.name : 'Bot';
    el.style.cssText = `margin-bottom:10px; padding:6px 10px; border-radius:6px; background:${hexToRgba(color, 0.12)}; color:#e2e8f0; border-left:2px solid ${color}; margin-right:24px; word-break:break-word;`;
    el.innerHTML = `<span style="font-size:10px;opacity:0.65;">${name}:</span><br>${escapeHtml(text)}`;
  } else {
    // system / status
    el.style.cssText = 'margin-bottom:6px; padding:4px 8px; color:#64748b; font-style:italic; font-size:11px;';
    el.textContent = text;
  }

  hist.appendChild(el);
  hist.scrollTop = hist.scrollHeight;
  return el;
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

// ─── Open / close panel ───────────────────────────────────────────────────────
window.openConversationPanel = function(botConfig) {
  currentBot  = botConfig;
  chatHistory = [];

  const panel = document.getElementById('conv-panel');
  if (!panel) return;

  panel.style.setProperty('--bot-color', botConfig.colorHex);

  document.getElementById('conv-bot-name').textContent = botConfig.name.toUpperCase();
  document.getElementById('conv-bot-role').textContent = botConfig.role;
  document.getElementById('chat-history').innerHTML    = '';

  // Initial greeting
  addChatMessage('system', `${botConfig.name} is ready — type a message below!`);

  // Slide-up animation
  panel.style.display   = 'block';
  panel.style.opacity   = '0';
  panel.style.transform = 'translateX(-50%) translateY(30px)';

  requestAnimationFrame(() => requestAnimationFrame(() => {
    panel.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    panel.style.opacity    = '1';
    panel.style.transform  = 'translateX(-50%) translateY(0)';
  }));

  updateSpeakBtn();
  startFaceLoop();

  // Show "Talking with you…" bubble in-world
  if (window._ocScene) {
    const sceneBot = window._ocScene.bots.find(b => b.def && b.def.id === botConfig.id);
    if (sceneBot) {
      // Clear existing bubble first
      if (sceneBot.bubbleBg) { sceneBot.bubbleBg.destroy(); sceneBot.bubbleBg = null; sceneBot.bubble = null; }
      // Show persistent bubble (very long duration)
      window._ocScene.showBubble(sceneBot, 'Talking with you…', 300000);
    }
  }

  setTimeout(() => {
    const inp = document.getElementById('chat-input');
    if (inp) inp.focus();
  }, 320);
};

window.closeConvPanel = function() {
  const panel = document.getElementById('conv-panel');
  if (!panel || panel.style.display === 'none') return;

  panel.style.opacity   = '0';
  panel.style.transform = 'translateX(-50%) translateY(30px)';

  setTimeout(() => {
    panel.style.display    = 'none';
    panel.style.transition = '';

    stopFaceLoop();
    stopMouthAnim();
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    // Clear in-world bubble
    if (window._ocScene && currentBot) {
      const sceneBot = window._ocScene.bots.find(b => b.def && b.def.id === currentBot.id);
      if (sceneBot && sceneBot.bubbleBg) {
        sceneBot.bubbleBg.destroy();
        sceneBot.bubbleBg = null;
        sceneBot.bubble   = null;
      }
    }

    currentBot = null;
  }, 310);
};

// ─── Send message ─────────────────────────────────────────────────────────────
window.sendMessage = async function() {
  const inp  = document.getElementById('chat-input');
  const text = inp ? inp.value.trim() : '';
  if (!text || !currentBot) return;

  inp.value    = '';
  inp.disabled = true;

  addChatMessage('user', text);
  chatHistory.push({ role: 'user', content: text });

  // Thinking indicator
  const thinkEl = addChatMessage('system', '🤔 Thinking…');
  startMouthAnim();

  try {
    const reply = await getBotResponse(currentBot.id, text, chatHistory);

    if (thinkEl && thinkEl.parentNode) thinkEl.remove();
    stopMouthAnim();

    addChatMessage('assistant', reply);
    chatHistory.push({ role: 'assistant', content: reply });

    if (speakEnabled) {
      speakText(reply);
    }
  } catch (err) {
    console.error('[ConvPanel] LLM error:', err);
    if (thinkEl && thinkEl.parentNode) thinkEl.remove();
    stopMouthAnim();
    addChatMessage('system', '⚠️ Error: ' + (err.message || 'Could not get response'));
  }

  inp.disabled = false;
  inp.focus();
};

// ─── Speak toggle ─────────────────────────────────────────────────────────────
window.toggleSpeak = function() {
  speakEnabled = !speakEnabled;
  if (!speakEnabled) {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    stopMouthAnim();
  }
  updateSpeakBtn();
};

function updateSpeakBtn() {
  const btn = document.getElementById('speak-toggle');
  if (!btn) return;
  btn.textContent = speakEnabled ? '🔊 Speak: ON' : '🔇 Speak: OFF';
  btn.style.opacity = speakEnabled ? '1' : '0.5';
}

// ─── Click outside to close ───────────────────────────────────────────────────
document.addEventListener('click', (e) => {
  const panel = document.getElementById('conv-panel');
  if (!panel || panel.style.display === 'none') return;
  if (panel.contains(e.target)) return;

  // Only close if the click was on the game canvas or game wrapper
  const wrapper = document.getElementById('game-wrapper');
  if (wrapper && wrapper.contains(e.target)) {
    window.closeConvPanel();
  }
}, true);
