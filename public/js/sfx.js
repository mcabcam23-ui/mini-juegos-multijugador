/* Efectos de sonido temáticos por juego (Web Audio API) */
export const SFX = (() => {
  let enabled = localStorage.getItem('arcade_sound') !== 'off';
  let actx = null;
  const ac = () => (actx ||= new (window.AudioContext || window.webkitAudioContext)());

  function tone(freq, dur, type = 'sine', vol = 0.14, when = 0) {
    if (!enabled) return;
    try {
      const c = ac();
      const t = c.currentTime + when;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      o.connect(g);
      g.connect(c.destination);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t);
      o.stop(t + dur);
    } catch {}
  }

  function sweep(start, end, dur, type = 'sine', vol = 0.12, when = 0) {
    if (!enabled) return;
    try {
      const c = ac();
      const t = c.currentTime + when;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(start, t);
      o.frequency.exponentialRampToValueAtTime(end, t + dur);
      o.connect(g);
      g.connect(c.destination);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t);
      o.stop(t + dur);
    } catch {}
  }

  function noiseBurst(dur, vol = 0.07, freq = 900, when = 0, type = 'lowpass') {
    if (!enabled) return;
    try {
      const c = ac();
      const t = c.currentTime + when;
      const len = Math.floor(c.sampleRate * dur);
      const buffer = c.createBuffer(1, len, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      const src = c.createBufferSource();
      src.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      const g = c.createGain();
      src.connect(filter);
      filter.connect(g);
      g.connect(c.destination);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.start(t);
    } catch {}
  }

  function chord(notes, dur = 0.14, type = 'triangle', vol = 0.1, stagger = 0.06) {
    notes.forEach((f, i) => tone(f, dur, type, vol, i * stagger));
  }

  const turnSounds = {
    tictactoe: () => { tone(740, 0.05, 'sine', 0.08); tone(980, 0.04, 'sine', 0.06, 0.04); },
    connect4: () => { tone(330, 0.06, 'square', 0.07); tone(440, 0.05, 'triangle', 0.06, 0.05); },
    rps: () => { noiseBurst(0.04, 0.04, 600); tone(180, 0.08, 'square', 0.08); },
    hangman: () => { tone(520, 0.06, 'triangle', 0.08); },
    memory: () => { tone(880, 0.04, 'sine', 0.07); tone(660, 0.04, 'sine', 0.06, 0.04); },
    checkers: () => { tone(280, 0.05, 'triangle', 0.09); noiseBurst(0.03, 0.03, 400); },
    dots: () => { noiseBurst(0.04, 0.04, 1800, 0, 'highpass'); },
    trivia: () => { tone(880, 0.05, 'square', 0.07); tone(1100, 0.04, 'sine', 0.06, 0.05); },
    battleship: () => { sweep(420, 880, 0.12, 'sine', 0.08); },
    reversi: () => { tone(280, 0.05, 'triangle', 0.09); },
    mastermind: () => { tone(660, 0.05, 'sine', 0.08); tone(990, 0.04, 'triangle', 0.06, 0.05); },
    simon: () => { chord([523, 659], 0.08, 'sine', 0.08, 0.05); },
    wordrush: () => { tone(520, 0.05, 'triangle', 0.08); },
    dicey: () => { noiseBurst(0.03, 0.05, 500); tone(220, 0.06, 'square', 0.08); },
  };

  const winSounds = {
    tictactoe: () => chord([523, 659, 784, 988], 0.16, 'triangle', 0.11, 0.1),
    connect4: () => chord([392, 494, 587, 784, 988], 0.14, 'square', 0.09, 0.08),
    rps: () => { noiseBurst(0.1, 0.06, 700); chord([330, 415, 523, 659], 0.16, 'sawtooth', 0.08, 0.09); },
    hangman: () => chord([523, 659, 784], 0.18, 'triangle', 0.1, 0.12),
    memory: () => chord([659, 784, 988, 1175], 0.12, 'sine', 0.1, 0.07),
    checkers: () => { chord([440, 554, 659], 0.14, 'triangle', 0.1, 0.08); noiseBurst(0.08, 0.04, 500, 0.2); },
    dots: () => chord([523, 659, 784, 880], 0.13, 'triangle', 0.1, 0.07),
    trivia: () => { chord([523, 659, 784, 988, 1175], 0.11, 'triangle', 0.11, 0.06); noiseBurst(0.06, 0.05, 1200, 0.35); },
    battleship: () => { chord([294, 370, 440, 587, 784], 0.18, 'triangle', 0.1, 0.1); noiseBurst(0.15, 0.06, 350, 0.15); },
    reversi: () => chord([392, 494, 587, 784], 0.14, 'triangle', 0.1, 0.08),
    mastermind: () => { chord([523, 659, 784, 988], 0.12, 'sine', 0.1, 0.06); noiseBurst(0.05, 0.05, 1500, 0.2); },
    simon: () => chord([659, 784, 988, 1175], 0.11, 'triangle', 0.1, 0.07),
    wordrush: () => chord([523, 659, 784], 0.14, 'triangle', 0.11, 0.08),
    dicey: () => { noiseBurst(0.1, 0.07, 600); chord([440, 554, 659, 880], 0.14, 'square', 0.09, 0.08); },
  };

  const loseSounds = {
    default: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.09, i * 0.14)); },
    hangman: () => { sweep(220, 80, 0.5, 'sawtooth', 0.08); tone(110, 0.35, 'square', 0.06, 0.2); },
    trivia: () => { tone(180, 0.25, 'square', 0.1); tone(140, 0.3, 'sawtooth', 0.08, 0.15); },
    battleship: () => { sweep(180, 60, 0.45, 'sawtooth', 0.09); noiseBurst(0.2, 0.05, 280, 0.1); },
  };

  return {
    get enabled() { return enabled; },
    toggle() {
      enabled = !enabled;
      localStorage.setItem('arcade_sound', enabled ? 'on' : 'off');
      if (enabled) chord([660, 880], 0.1, 'triangle', 0.1, 0.05);
      return enabled;
    },

    move() { tone(440, 0.05, 'sine', 0.06); },
    turn() { tone(620, 0.1, 'triangle', 0.1); },
    turnFor(gameId) { (turnSounds[gameId] || turnSounds.tictactoe)(); },
    win() { chord([523, 659, 784, 1047], 0.18, 'triangle', 0.14, 0.1); },
    gameWin(gameId) { (winSounds[gameId] || winSounds.tictactoe)(); },
    lose() { loseSounds.default(); },
    gameLose(gameId) { (loseSounds[gameId] || loseSounds.default)(); },
    draw() { tone(440, 0.14, 'sine', 0.09); tone(330, 0.14, 'sine', 0.08, 0.14); },
    error() { tone(150, 0.18, 'square', 0.1); },
    msg() { tone(880, 0.06, 'sine', 0.09); },
    react() { tone(720, 0.08, 'sine', 0.1); },

    /** 3 en raya — tiza sobre pizarra */
    place() {
      noiseBurst(0.025, 0.06, 2800, 0, 'highpass');
      tone(1200, 0.03, 'sine', 0.05);
      sweep(900, 600, 0.04, 'triangle', 0.04, 0.01);
    },

    /** Conecta 4 — ficha plástica en ranura */
    c4Drop() {
      tone(95, 0.07, 'square', 0.1);
      sweep(420, 180, 0.1, 'triangle', 0.1, 0.02);
      noiseBurst(0.04, 0.04, 600, 0.05);
    },
    c4Win() {
      chord([440, 554, 659, 880, 988], 0.14, 'square', 0.09, 0.07);
      noiseBurst(0.08, 0.05, 800, 0.25);
    },

    /** Piedra Papel Tijera — arena */
    rpsPick() {
      noiseBurst(0.05, 0.07, 500);
      tone(140, 0.06, 'square', 0.1);
      sweep(200, 120, 0.05, 'sawtooth', 0.06, 0.02);
    },
    rpsCountdown(n) {
      if (n === 3) { tone(220, 0.12, 'square', 0.11); noiseBurst(0.04, 0.05, 300); }
      else if (n === 2) { tone(330, 0.1, 'triangle', 0.11); }
      else { tone(520, 0.08, 'sine', 0.12); tone(780, 0.06, 'triangle', 0.08, 0.05); }
    },
    rpsGo() {
      noiseBurst(0.14, 0.09, 900);
      tone(120, 0.16, 'square', 0.14);
      setTimeout(() => chord([660, 880, 1100], 0.12, 'triangle', 0.11, 0.05), 50);
    },
    rpsTension() { tone(90, 0.4, 'sawtooth', 0.035); sweep(90, 70, 0.35, 'sawtooth', 0.03); },
    rpsClash() {
      noiseBurst(0.08, 0.08, 700);
      tone(80, 0.1, 'square', 0.12);
      setTimeout(() => { noiseBurst(0.05, 0.06, 1200); tone(880, 0.1, 'triangle', 0.12); }, 70);
    },
    rpsRoundWin() { chord([523, 659, 784], 0.12, 'triangle', 0.11, 0.08); },
    rpsRoundLose() { tone(180, 0.22, 'sawtooth', 0.09); sweep(200, 100, 0.2, 'sawtooth', 0.07); },

    /** Ahorcado — cuerda y máquina de escribir */
    hangGood() {
      noiseBurst(0.02, 0.05, 1500, 0, 'bandpass');
      tone(880, 0.12, 'triangle', 0.12);
      tone(1175, 0.08, 'sine', 0.09, 0.08);
    },
    hangBad() {
      tone(200, 0.2, 'sawtooth', 0.1);
      sweep(180, 90, 0.25, 'square', 0.07, 0.05);
    },
    hangPart() {
      sweep(340, 180, 0.28, 'sawtooth', 0.06);
      noiseBurst(0.08, 0.03, 400, 0.05);
    },

    /** Memoria — cartas */
    memFlip() {
      sweep(1200, 400, 0.06, 'sine', 0.07);
      noiseBurst(0.03, 0.05, 2000, 0, 'highpass');
    },
    memMatch() {
      chord([659, 784, 988, 1175], 0.1, 'sine', 0.1, 0.06);
      noiseBurst(0.05, 0.04, 1500, 0.15);
    },
    memMiss() {
      tone(220, 0.1, 'square', 0.08);
      sweep(400, 200, 0.12, 'triangle', 0.06);
    },

    /** Damas — madera */
    chkMove() {
      tone(320, 0.04, 'triangle', 0.1);
      noiseBurst(0.025, 0.05, 350);
    },
    chkCapture() {
      noiseBurst(0.05, 0.06, 450);
      tone(240, 0.08, 'square', 0.11);
      sweep(520, 280, 0.1, 'triangle', 0.08, 0.04);
    },
    chkKing() {
      chord([440, 554, 659, 880], 0.14, 'triangle', 0.11, 0.08);
      sweep(660, 990, 0.12, 'sine', 0.07, 0.1);
    },

    /** Puntos y cajas — lápiz y sello */
    dotsLine() {
      noiseBurst(0.06, 0.05, 2200, 0, 'highpass');
      sweep(1800, 800, 0.05, 'sine', 0.04);
    },
    dotsBox() {
      tone(660, 0.06, 'triangle', 0.11);
      noiseBurst(0.04, 0.06, 600);
      chord([784, 988], 0.1, 'triangle', 0.1, 0.05);
    },

    /** Trivia — concurso TV */
    trivCorrect() {
      chord([523, 659, 784, 988, 1175], 0.11, 'triangle', 0.11, 0.05);
      noiseBurst(0.04, 0.05, 1800, 0.25);
    },
    trivWrong() {
      tone(200, 0.08, 'square', 0.12);
      tone(180, 0.08, 'square', 0.1, 0.08);
      tone(160, 0.08, 'square', 0.1, 0.16);
      tone(140, 0.2, 'sawtooth', 0.09, 0.24);
    },
    trivTick() {
      tone(1200, 0.015, 'square', 0.05);
      sweep(800, 400, 0.02, 'sine', 0.03, 0.01);
    },
    trivDice() {
      for (let i = 0; i < 5; i++) noiseBurst(0.025, 0.04, 900 + i * 100, i * 0.04);
      tone(440, 0.06, 'triangle', 0.08, 0.22);
    },

    /** Tocado y Hundido — impacto metálico */
    bsHit() {
      if (!enabled) return;
      try {
        const c = ac();
        const t = c.currentTime;
        const thud = c.createOscillator();
        const thudG = c.createGain();
        thud.type = 'square';
        thud.frequency.setValueAtTime(220, t);
        thud.frequency.exponentialRampToValueAtTime(70, t + 0.11);
        thud.connect(thudG);
        thudG.connect(c.destination);
        thudG.gain.setValueAtTime(0.16, t);
        thudG.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
        thud.start(t);
        thud.stop(t + 0.13);

        const ping = c.createOscillator();
        const pingG = c.createGain();
        ping.type = 'triangle';
        ping.frequency.setValueAtTime(1040, t + 0.015);
        ping.frequency.exponentialRampToValueAtTime(520, t + 0.09);
        ping.connect(pingG);
        pingG.connect(c.destination);
        pingG.gain.setValueAtTime(0.11, t + 0.015);
        pingG.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
        ping.start(t + 0.015);
        ping.stop(t + 0.11);
      } catch {}
    },

    bsSunk() {
      noiseBurst(0.28, 0.1, 420);
      tone(98, 0.34, 'sawtooth', 0.13);
      tone(62, 0.42, 'square', 0.09, 0.04);
      chord([294, 370, 440, 587], 0.22, 'triangle', 0.1, 0.12);
      tone(784, 0.35, 'triangle', 0.08, 0.38);
    },

    bsMiss() {
      if (!enabled) return;
      try {
        const c = ac();
        const drop = (startHz, endHz, vol, delay, dur) => {
          const t = c.currentTime + delay;
          const o = c.createOscillator();
          const g = c.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(startHz, t);
          o.frequency.exponentialRampToValueAtTime(endHz, t + dur * 0.55);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(vol, t + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          o.connect(g);
          g.connect(c.destination);
          o.start(t);
          o.stop(t + dur);
        };
        drop(920, 380, 0.1, 0, 0.16);
        drop(620, 260, 0.045, 0.07, 0.12);
      } catch {}
    },

    revPlace() { tone(320, 0.05, 'triangle', 0.1); noiseBurst(0.03, 0.04, 500); },
    mmPick() { tone(540, 0.04, 'sine', 0.08); },
    mmGood() { tone(660, 0.1, 'triangle', 0.1); tone(880, 0.08, 'sine', 0.08, 0.06); },
    mmBad() { tone(200, 0.12, 'sawtooth', 0.08); },
    mmWin() { chord([523, 659, 784, 988], 0.12, 'triangle', 0.11, 0.06); },
    simFlash() { tone(880, 0.06, 'square', 0.09); },
    simOk() { tone(720, 0.08, 'triangle', 0.1); },
    simFail() { tone(180, 0.2, 'sawtooth', 0.1); sweep(200, 100, 0.15, 'sawtooth', 0.07); },
    wrType() { tone(800, 0.02, 'square', 0.04); },
    wrGuess() { tone(440, 0.06, 'triangle', 0.08); },
    wrWin() { chord([523, 659, 784], 0.12, 'triangle', 0.11, 0.07); },
    dyRoll() { noiseBurst(0.05, 0.06, 700); [220, 280, 330].forEach((f, i) => tone(f, 0.04, 'square', 0.06, i * 0.02)); },
    dyHold() { tone(520, 0.04, 'sine', 0.07); },
    dyLock() { tone(380, 0.08, 'triangle', 0.1); },
    dyWinRound() { chord([523, 659, 784], 0.12, 'triangle', 0.1, 0.06); },
    dyLoseRound() { tone(220, 0.15, 'sawtooth', 0.08); },
  };
})();
