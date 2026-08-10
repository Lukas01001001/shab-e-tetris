"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const COLS = 10;
const ROWS = 20;
const EMPTY = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

const SHAPES: Record<number, number[][]> = {
  1: [[1, 1, 1, 1]],
  2: [[2, 2], [2, 2]],
  3: [[0, 3, 0], [3, 3, 3]],
  4: [[0, 4, 4], [4, 4, 0]],
  5: [[5, 5, 0], [0, 5, 5]],
  6: [[6, 0, 0], [6, 6, 6]],
  7: [[0, 0, 7], [7, 7, 7]],
};

const COLORS: Record<number, string> = {
  1: "#22b8c7", 2: "#f1c75b", 3: "#2959a8", 4: "#43a57a",
  5: "#c94f3d", 6: "#163d78", 7: "#e58b35",
};

const GLYPHS: Record<number, string> = {
  1: "𓂀", 2: "𓆣", 3: "𓅓", 4: "𓇳", 5: "𓋹", 6: "𓃭", 7: "𓆑",
};

type Piece = { shape: number[][]; type: number; x: number; y: number };

function randomPiece(): Piece {
  const type = Math.floor(Math.random() * 7) + 1;
  return { shape: SHAPES[type].map(r => [...r]), type, x: Math.floor((COLS - SHAPES[type][0].length) / 2), y: 0 };
}

function pieceOf(type: number): Piece {
  return { shape: SHAPES[type].map(r => [...r]), type, x: Math.floor((COLS - SHAPES[type][0].length) / 2), y: 0 };
}

function rotate(shape: number[][]) {
  return shape[0].map((_, i) => shape.map(row => row[i]).reverse());
}

function collision(board: number[][], piece: Piece, dx = 0, dy = 0, shape = piece.shape) {
  return shape.some((row, y) => row.some((cell, x) => {
    if (!cell) return false;
    const nx = piece.x + x + dx;
    const ny = piece.y + y + dy;
    return nx < 0 || nx >= COLS || ny >= ROWS || (ny >= 0 && board[ny][nx] !== 0);
  }));
}

function merge(board: number[][], piece: Piece) {
  const next = board.map(r => [...r]);
  piece.shape.forEach((row, y) => row.forEach((cell, x) => {
    if (cell && piece.y + y >= 0) next[piece.y + y][piece.x + x] = piece.type;
  }));
  return next;
}

function MiniPiece({ piece }: { piece: Piece }) {
  return <div className="mini-grid" aria-label="Next piece">
    {Array.from({ length: 16 }, (_, i) => {
      const y = Math.floor(i / 4), x = i % 4;
      const offsetX = Math.floor((4 - piece.shape[0].length) / 2);
      const offsetY = Math.floor((4 - piece.shape.length) / 2);
      const filled = piece.shape[y - offsetY]?.[x - offsetX];
      return <span key={i} className={filled ? "mini-cell filled" : "mini-cell"} data-glyph={filled ? GLYPHS[piece.type] : undefined} style={filled ? { "--cell-color": COLORS[piece.type] } as React.CSSProperties : undefined} />;
    })}
  </div>;
}

export default function Home() {
  const [board, setBoard] = useState(EMPTY);
  const [piece, setPiece] = useState<Piece>(() => pieceOf(3));
  const [next, setNext] = useState<Piece>(() => pieceOf(6));
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [best, setBest] = useState(0);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState<"idle" | "playing" | "paused" | "over">("idle");
  const boardRef = useRef(board), pieceRef = useRef(piece), nextRef = useRef(next), statusRef = useRef(status);
  const audioRef = useRef<AudioContext | null>(null);
  const level = Math.floor(lines / 10) + 1;

  useEffect(() => { boardRef.current = board; }, [board]);
  useEffect(() => { pieceRef.current = piece; }, [piece]);
  useEffect(() => { nextRef.current = next; }, [next]);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => {
    setBest(Number(localStorage.getItem("shab-tetris-best") || 0));
    setMuted(localStorage.getItem("shab-tetris-muted") === "true");
  }, []);

  const playSound = useCallback((kind: "move" | "rotate" | "drop" | "line" | "start" | "pause" | "over") => {
    if (muted || typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = audioRef.current ?? new AudioContextClass();
    audioRef.current = ctx;
    if (ctx.state === "suspended") void ctx.resume();
    const notes: Record<typeof kind, Array<[number, number, number]>> = {
      move: [[165, 0, .035]],
      rotate: [[330, 0, .045], [440, .035, .055]],
      drop: [[220, 0, .045], [110, .04, .09]],
      line: [[392, 0, .09], [523, .08, .11], [659, .18, .16]],
      start: [[196, 0, .08], [294, .08, .1], [392, .18, .16]],
      pause: [[330, 0, .07], [247, .07, .11]],
      over: [[294, 0, .13], [220, .12, .15], [147, .26, .25]],
    };
    const now = ctx.currentTime;
    notes[kind].forEach(([frequency, delay, duration]) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = kind === "line" || kind === "start" ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, now + delay);
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(.055, now + delay + .008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + duration + .02);
    });
  }, [muted]);

  const endGame = useCallback((finalScore: number) => {
    setStatus("over");
    playSound("over");
    setBest(old => {
      const value = Math.max(old, finalScore);
      localStorage.setItem("shab-tetris-best", String(value));
      return value;
    });
  }, [playSound]);

  const lockPiece = useCallback(() => {
    const merged = merge(boardRef.current, pieceRef.current);
    const remaining = merged.filter(row => row.some(cell => cell === 0));
    const cleared = ROWS - remaining.length;
    const updated = [...Array.from({ length: cleared }, () => Array(COLS).fill(0)), ...remaining];
    const gained = [0, 100, 300, 500, 800][cleared] * (Math.floor(lines / 10) + 1);
    const newScore = score + gained;
    const newPiece = { ...nextRef.current, x: Math.floor((COLS - nextRef.current.shape[0].length) / 2), y: 0 };
    const newNext = randomPiece();
    setBoard(updated); boardRef.current = updated;
    setScore(newScore); setLines(v => v + cleared);
    setPiece(newPiece); pieceRef.current = newPiece;
    setNext(newNext); nextRef.current = newNext;
    playSound(cleared > 0 ? "line" : "drop");
    if (collision(updated, newPiece)) endGame(newScore);
  }, [endGame, lines, playSound, score]);

  const move = useCallback((dx: number) => {
    if (statusRef.current !== "playing") return;
    if (!collision(boardRef.current, pieceRef.current, dx, 0)) {
      setPiece(p => ({ ...p, x: p.x + dx }));
      playSound("move");
    }
  }, [playSound]);

  const drop = useCallback((hard = false, manual = false) => {
    if (statusRef.current !== "playing") return;
    if (hard) {
      let distance = 0;
      while (!collision(boardRef.current, pieceRef.current, 0, distance + 1)) distance++;
      const landed = { ...pieceRef.current, y: pieceRef.current.y + distance };
      setPiece(landed); pieceRef.current = landed;
      setScore(v => v + distance * 2);
      lockPiece();
    } else if (!collision(boardRef.current, pieceRef.current, 0, 1)) {
      setPiece(p => ({ ...p, y: p.y + 1 }));
      if (manual) playSound("move");
    } else lockPiece();
  }, [lockPiece, playSound]);

  const turn = useCallback(() => {
    if (statusRef.current !== "playing") return;
    const turned = rotate(pieceRef.current.shape);
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collision(boardRef.current, pieceRef.current, kick, 0, turned)) {
        setPiece(p => ({ ...p, shape: turned, x: p.x + kick }));
        playSound("rotate");
        return;
      }
    }
  }, [playSound]);

  const start = () => {
    const p = randomPiece(), n = randomPiece();
    setBoard(EMPTY.map(r => [...r])); setPiece(p); setNext(n);
    boardRef.current = EMPTY.map(r => [...r]); pieceRef.current = p; nextRef.current = n;
    setScore(0); setLines(0); setStatus("playing");
    playSound("start");
  };

  const pause = () => setStatus(s => {
    if (s === "playing" || s === "paused") playSound("pause");
    return s === "playing" ? "paused" : s === "paused" ? "playing" : s;
  });

  const toggleSound = () => setMuted(value => {
    const nextMuted = !value;
    localStorage.setItem("shab-tetris-muted", String(nextMuted));
    return nextMuted;
  });

  useEffect(() => {
    if (status !== "playing") return;
    const timer = setInterval(() => drop(), Math.max(120, 800 - (level - 1) * 65));
    return () => clearInterval(timer);
  }, [drop, level, status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const keys = ["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " ", "p", "P"];
      if (keys.includes(e.key)) e.preventDefault();
      if (e.key === "ArrowLeft") move(-1);
      if (e.key === "ArrowRight") move(1);
      if (e.key === "ArrowDown") drop(false, true);
      if (e.key === "ArrowUp") turn();
      if (e.key === " ") drop(true);
      if (e.key.toLowerCase() === "p") pause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drop, move, turn]);

  const display = board.map(r => [...r]);
  if (status !== "idle" && status !== "over") piece.shape.forEach((row, y) => row.forEach((cell, x) => {
    const py = piece.y + y, px = piece.x + x;
    if (cell && py >= 0 && py < ROWS && px >= 0 && px < COLS) display[py][px] = piece.type;
  }));

  return <main data-design-version="egypt-7-flat-no-palms">
    <div className="desert-sky" />
    <div className="sun-disc" />
    <div className="pyramid pyramid-left" />
    <div className="pyramid pyramid-right" />
    <div className="nile"><span>NILE</span></div>
    <div className="dunes" />
    <header className="masthead">
      <div className="sun-mark">𓂀</div>
      <div>
        <p className="eyebrow">𓇳 𓂀 𓆣 · GAME OF THE PHARAOHS · 𓆣 𓂀 𓇳</p>
        <h1>Tetris <em>of the Nile</em></h1>
        <p className="subtitle">Awaken the stones of the eternal kingdom</p>
      </div>
      <div className="sun-mark">𓂀</div>
    </header>

    <section className="game-shell">
      <aside className="side left-side">
        <div className="panel score-panel"><span>SCORE</span><strong>{score.toLocaleString("en-US")}</strong><small>𓏤 ROYAL TALLY 𓏤</small></div>
        <div className="two-stats">
          <div className="panel"><span>LINES</span><strong>{lines}</strong></div>
          <div className="panel"><span>LEVEL</span><strong>{level}</strong></div>
        </div>
        <div className="panel best-panel"><span>HIGH SCORE</span><strong>{best.toLocaleString("en-US")}</strong><small>𓂀 ETERNAL RECORD 𓂀</small></div>
        <div className="quote">“To speak the name of the dead is to make them live again.”<span>— Ancient Egyptian saying</span></div>
      </aside>

      <div className="board-wrap">
        <div className="temple-bar">
          <span className="temple-bar-symbol">𓇳</span>
          <button className="sound-toggle" onClick={toggleSound} aria-label={muted ? "Turn sound on" : "Mute sound"} title={muted ? "Sound off" : "Sound on"}>{muted ? "🔇" : "🔊"}</button>
        </div>
        <div className="board" role="grid" aria-label="Tetris board">
          {display.flatMap((row, y) => row.map((cell, x) => <span key={`${y}-${x}`} className={cell ? "cell filled" : "cell"} data-glyph={cell ? GLYPHS[cell] : undefined} style={cell ? { "--cell-color": COLORS[cell] } as React.CSSProperties : undefined} />))}
          {status !== "playing" && <div className="overlay">
            <div className="overlay-ornament">𓂀</div>
            <h2>{status === "paused" ? "The sands stand still" : status === "over" ? "The dynasty has fallen" : "Enter the royal tomb"}</h2>
            <p>{status === "paused" ? "𓇳 · GAME PAUSED · 𓇳" : status === "over" ? `Your royal tally: ${score.toLocaleString("en-US")}` : "Stack the sacred stones and defy eternity"}</p>
            <button onClick={status === "paused" ? pause : start}>{status === "paused" ? "RETURN TO THE NILE" : status === "over" ? "RISE AGAIN" : "AWAKEN THE TOMB"}</button>
          </div>}
        </div>
        <div className="board-base"><span>𓅓</span><span>𓆣</span><span>𓂀</span><span>𓆣</span><span>𓅓</span></div>
      </div>

      <aside className="side right-side">
        <div className="panel next-panel"><span>NEXT RELIC</span><MiniPiece piece={next} /><small>𓏏 SACRED STONE 𓏏</small></div>
        <div className="panel controls-info">
          <span>CONTROLS</span>
          <div><kbd>←</kbd><kbd>→</kbd><b>move</b></div>
          <div><kbd>↑</kbd><b>rotate</b></div>
          <div><kbd>↓</kbd><b>soft drop</b></div>
          <div><kbd>SPACE</kbd><b>hard drop</b></div>
        </div>
        <button className="pause" onClick={pause} disabled={status === "idle" || status === "over"}>{status === "paused" ? "▶ CONTINUE" : "Ⅱ PAUSE"}</button>
      </aside>
    </section>

    <section className="mobile-controls" aria-label="Touch controls">
      <button onClick={() => move(-1)} aria-label="Move left">←</button>
      <button onClick={turn} aria-label="Rotate">↻</button>
      <button onClick={() => move(1)} aria-label="Move right">→</button>
      <button onClick={() => drop(false, true)} aria-label="Move down">↓</button>
      <button className="drop-button" onClick={() => drop(true)} aria-label="Hard drop">◆</button>
    </section>
    <footer><span>𓂀</span> FORGED BESIDE THE ETERNAL NILE <span>𓂀</span></footer>
  </main>;
}

