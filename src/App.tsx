/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';

// --- Types & Interfaces ---

type EnemyType = 'BASIC' | 'FAST' | 'SPLITTER' | 'MINI';

interface Vector {
  x: number;
  y: number;
}

interface Entity {
  pos: Vector;
  vel: Vector;
  radius: number;
}

interface Bullet extends Entity {
  active: boolean;
}

interface Enemy extends Entity {
  type: EnemyType;
  active: boolean;
  speed: number;
  jitter?: number;
  phase?: number;
}

interface Particle {
  pos: Vector;
  vel: Vector;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

// --- Constants ---

const FRICTION = 0.96;
const RECOIL_FORCE = 15;
const BULLET_SPEED = 12;
const PLAYER_RADIUS = 20;
const BULLET_RADIUS = 5;
const SHAKE_DECAY = 0.9;

const DIFFICULTY_SETTINGS = {
  EASY: { spawnRate: 2000, speedMult: 0.7, scoreMult: 0.5 },
  MEDIUM: { spawnRate: 1500, speedMult: 1.0, scoreMult: 1.0 },
  HARD: { spawnRate: 1000, speedMult: 1.4, scoreMult: 2.0 },
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('recoil_riot_highscore');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);

  // Game State Refs
  const gameState = useRef({
    player: { pos: { x: 400, y: 300 }, vel: { x: 0, y: 0 }, radius: PLAYER_RADIUS, angle: 0 },
    bullets: [] as Bullet[],
    enemies: [] as Enemy[],
    particles: [] as Particle[],
    mouse: { x: 0, y: 0 },
    shake: 0,
    hitstop: 0,
    lastEnemySpawn: 0,
    dimensions: { width: 800, height: 600 },
    requestRef: 0,
  });

  // --- Initialization & Input ---

  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('recoil_riot_highscore', score.toString());
    }
  }, [score, highScore]);

  useEffect(() => {
    if (!difficulty) {
      return;
    }

    const handleResize = () => {
      if (canvasRef.current) {
        const parent = canvasRef.current.parentElement;
        if (parent) {
          canvasRef.current.width = parent.clientWidth;
          canvasRef.current.height = parent.clientHeight;
          gameState.current.dimensions = {
            width: parent.clientWidth,
            height: parent.clientHeight,
          };
          if (gameState.current.player.pos.x === 400 && gameState.current.player.pos.y === 300) {
             gameState.current.player.pos = { x: parent.clientWidth / 2, y: parent.clientHeight / 2 };
          }
        }
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    const handleMouseMove = (e: MouseEvent) => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        gameState.current.mouse = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
      }
    };

    const handleMouseDown = () => {
      if (gameOver) {
        resetGame();
        return;
      }
      shoot();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'r') {
        resetGame();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);

    const animate = (time: number) => {
      gameLoop(time);
      gameState.current.requestRef = requestAnimationFrame(animate);
    };
    gameState.current.requestRef = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(gameState.current.requestRef);
    };
  }, [gameOver, difficulty]);

  // --- Game Actions ---

  const resetGame = () => {
    gameState.current.player = {
      pos: { x: gameState.current.dimensions.width / 2, y: gameState.current.dimensions.height / 2 },
      vel: { x: 0, y: 0 },
      radius: PLAYER_RADIUS,
      angle: 0,
    };
    gameState.current.bullets = [];
    gameState.current.enemies = [];
    gameState.current.particles = [];
    gameState.current.shake = 0;
    gameState.current.hitstop = 0;
    gameState.current.lastEnemySpawn = 0;
    setScore(0);
    setGameOver(false);
  };

  const shoot = () => {
    const { player, mouse } = gameState.current;
    const dx = mouse.x - player.pos.x;
    const dy = mouse.y - player.pos.y;
    const angle = Math.atan2(dy, dx);

    player.vel.x -= Math.cos(angle) * RECOIL_FORCE;
    player.vel.y -= Math.sin(angle) * RECOIL_FORCE;

    gameState.current.bullets.push({
      pos: { ...player.pos },
      vel: {
        x: Math.cos(angle) * BULLET_SPEED,
        y: Math.sin(angle) * BULLET_SPEED,
      },
      radius: BULLET_RADIUS,
      active: true,
    });

    gameState.current.shake = 10;

    for (let i = 0; i < 5; i++) {
      spawnParticle(
        player.pos,
        {
          x: -Math.cos(angle) * 5 + (Math.random() - 0.5) * 4,
          y: -Math.sin(angle) * 5 + (Math.random() - 0.5) * 4,
        },
        '#fbbf24',
        20 + Math.random() * 20,
        2 + Math.random() * 2
      );
    }
  };

  const spawnParticle = (pos: Vector, vel: Vector, color: string, life: number, size: number) => {
    gameState.current.particles.push({
      pos: { ...pos },
      vel: { ...vel },
      color,
      life,
      maxLife: life,
      size,
    });
  };

  const spawnEnemy = (type?: EnemyType, pos?: Vector) => {
    const { dimensions } = gameState.current;
    const settings = DIFFICULTY_SETTINGS[difficulty || 'MEDIUM'];
    
    let x, y;
    if (pos) {
      x = pos.x;
      y = pos.y;
    } else {
      const side = Math.floor(Math.random() * 4);
      if (side === 0) { x = Math.random() * dimensions.width; y = -50; }
      else if (side === 1) { x = dimensions.width + 50; y = Math.random() * dimensions.height; }
      else if (side === 2) { x = Math.random() * dimensions.width; y = dimensions.height + 50; }
      else { x = -50; y = Math.random() * dimensions.height; }
    }

    const enemyType: EnemyType = type || (Math.random() > 0.7 ? (Math.random() > 0.5 ? 'FAST' : 'SPLITTER') : 'BASIC');
    
    let radius = 18;
    let speed = (0.5 + Math.random() * 1.5) * settings.speedMult;
    let color = '#991b1b';

    if (enemyType === 'FAST') {
      radius = 14;
      speed *= 2.2;
      color = '#ea580c'; // Orange
    } else if (enemyType === 'SPLITTER') {
      radius = 26;
      speed *= 0.6;
      color = '#7c3aed'; // Purple
    } else if (enemyType === 'MINI') {
      radius = 10;
      speed *= 1.8;
      color = '#c026d3'; // Pink
    }

    gameState.current.enemies.push({
      pos: { x, y },
      vel: { x: 0, y: 0 },
      radius,
      type: enemyType,
      active: true,
      speed,
      jitter: enemyType === 'FAST' ? 0.2 : 0,
      phase: Math.random() * Math.PI * 2,
    });
  };

  // --- Main Loop ---

  const gameLoop = (time: number) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !difficulty) return;

    const { player, bullets, enemies, particles, dimensions } = gameState.current;
    const settings = DIFFICULTY_SETTINGS[difficulty];

    if (gameState.current.hitstop > 0) {
      gameState.current.hitstop -= 16.67;
      return;
    }

    if (!gameOver) {
      player.vel.x *= FRICTION;
      player.vel.y *= FRICTION;
      player.pos.x += player.vel.x;
      player.pos.y += player.vel.y;

      if (player.pos.x < player.radius) { player.pos.x = player.radius; player.vel.x *= -0.5; }
      if (player.pos.x > dimensions.width - player.radius) { player.pos.x = dimensions.width - player.radius; player.vel.x *= -0.5; }
      if (player.pos.y < player.radius) { player.pos.y = player.radius; player.vel.y *= -0.5; }
      if (player.pos.y > dimensions.height - player.radius) { player.pos.y = dimensions.height - player.radius; player.vel.y *= -0.5; }

      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.pos.x += b.vel.x;
        b.pos.y += b.vel.y;
        if (b.pos.x < 0 || b.pos.x > dimensions.width || b.pos.y < 0 || b.pos.y > dimensions.height) {
          bullets.splice(i, 1);
        }
      }

      if (time - gameState.current.lastEnemySpawn > settings.spawnRate) {
        spawnEnemy();
        gameState.current.lastEnemySpawn = time;
      }

      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const dx = player.pos.x - e.pos.x;
        const dy = player.pos.y - e.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Movement logic
        let moveX = dx / dist;
        let moveY = dy / dist;

        if (e.type === 'FAST' && e.phase !== undefined) {
          e.phase += 0.15;
          const perpX = -moveY;
          const perpY = moveX;
          const wave = Math.sin(e.phase) * 0.8;
          moveX += perpX * wave;
          moveY += perpY * wave;
        }

        e.vel.x = moveX * e.speed;
        e.vel.y = moveY * e.speed;
        e.pos.x += e.vel.x;
        e.pos.y += e.vel.y;

        if (dist < player.radius + e.radius) {
          setGameOver(true);
          if (score > highScore) setHighScore(score);
        }

        for (let j = bullets.length - 1; j >= 0; j--) {
          const b = bullets[j];
          const bdx = b.pos.x - e.pos.x;
          const bdy = b.pos.y - e.pos.y;
          const bdist = Math.sqrt(bdx * bdx + bdy * bdy);

          if (bdist < b.radius + e.radius) {
            const killedType = e.type;
            const killedPos = { ...e.pos };
            
            enemies.splice(i, 1);
            bullets.splice(j, 1);
            
            const points = (killedType === 'FAST' ? 250 : killedType === 'SPLITTER' ? 300 : 100) * settings.scoreMult;
            setScore(s => s + points);
            
            gameState.current.hitstop = 50;

            // Splitting logic
            if (killedType === 'SPLITTER') {
              for (let k = 0; k < 3; k++) {
                spawnEnemy('MINI', {
                  x: killedPos.x + (Math.random() - 0.5) * 20,
                  y: killedPos.y + (Math.random() - 0.5) * 20,
                });
              }
            }

            const pColor = killedType === 'FAST' ? '#ea580c' : killedType === 'SPLITTER' ? '#7c3aed' : '#ef4444';
            for (let k = 0; k < 12; k++) {
              spawnParticle(
                killedPos,
                {
                  x: (Math.random() - 0.5) * 10,
                  y: (Math.random() - 0.5) * 10,
                },
                pColor,
                30 + Math.random() * 30,
                3 + Math.random() * 3
              );
            }
            break;
          }
        }
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.pos.x += p.vel.x;
      p.pos.y += p.vel.y;
      p.vel.x *= 0.98;
      p.vel.y *= 0.98;
      p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // --- Rendering ---

    ctx.clearRect(0, 0, dimensions.width, dimensions.height);
    
    ctx.save();
    if (gameState.current.shake > 0.5) {
      const sx = (Math.random() - 0.5) * gameState.current.shake;
      const sy = (Math.random() - 0.5) * gameState.current.shake;
      ctx.translate(sx, sy);
      gameState.current.shake *= SHAKE_DECAY;
    }

    particles.forEach(p => {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    bullets.forEach(b => {
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    enemies.forEach(e => {
      const color = e.type === 'FAST' ? '#ea580c' : e.type === 'SPLITTER' ? '#7c3aed' : e.type === 'MINI' ? '#c026d3' : '#991b1b';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, e.radius, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, e.radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'black';
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, e.radius * 0.2, 0, Math.PI * 2);
      ctx.fill();
    });

    const dx = gameState.current.mouse.x - player.pos.x;
    const dy = gameState.current.mouse.y - player.pos.y;
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate(player.pos.x, player.pos.y);
    ctx.rotate(angle);
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(10, -5, 25, 10);
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(8, -6, 4, 0, Math.PI * 2);
    ctx.arc(8, 6, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  };

  if (!difficulty) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-screen bg-slate-950 font-sans text-white">
        <h1 className="text-7xl font-black italic tracking-tighter mb-4 uppercase text-blue-500">Recoil Riot</h1>
        <p className="text-slate-400 mb-2 uppercase tracking-[0.3em]">Select Your Difficulty</p>
        
        <div className="flex gap-4 mb-12">
          {(['EASY', 'MEDIUM', 'HARD'] as Difficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => {
                setDifficulty(d);
                resetGame();
              }}
              className="px-8 py-4 border-2 border-white/20 hover:border-blue-500 hover:bg-blue-500 transition-all font-black tracking-widest uppercase cursor-pointer"
            >
              {d}
            </button>
          ))}
        </div>

        <div className="text-center p-6 border border-white/10 bg-white/5 rounded-lg">
          <div className="text-slate-500 text-xs uppercase tracking-widest mb-2">All-Time High Score</div>
          <div className="text-white text-3xl font-black italic tracking-tighter">
            {highScore.toLocaleString()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-slate-950 overflow-hidden font-sans select-none cursor-crosshair">
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
      />

      <div className="absolute top-6 left-6 pointer-events-none">
        <div className="text-slate-400 text-xs uppercase tracking-widest mb-1">Score ({difficulty})</div>
        <div className="text-white text-4xl font-black tracking-tighter italic">
          {Math.floor(score).toLocaleString()}
        </div>
      </div>

      <div className="absolute top-6 right-6 text-right pointer-events-none">
        <div className="text-slate-400 text-xs uppercase tracking-widest mb-1">High Score</div>
        <div className="text-white text-xl font-bold tracking-tight">
          {highScore.toLocaleString()}
        </div>
      </div>

      {gameOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="text-center animate-in fade-in zoom-in duration-300">
            <h1 className="text-white text-7xl font-black italic tracking-tighter mb-2 uppercase">
              Wrecked
            </h1>
            <p className="text-slate-400 text-lg mb-8 uppercase tracking-[0.2em]">
              Final Score: <span className="text-white font-bold">{Math.floor(score).toLocaleString()}</span>
            </p>
            <div className="flex flex-col gap-4">
              <button
                onClick={resetGame}
                className="px-8 py-4 bg-white text-slate-950 font-black uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-colors cursor-pointer"
              >
                Restart (R)
              </button>
              <button
                onClick={() => {
                  setDifficulty(null);
                  resetGame();
                }}
                className="text-slate-500 uppercase text-xs tracking-widest hover:text-white transition-colors cursor-pointer"
              >
                Change Difficulty
              </button>
            </div>
          </div>
        </div>
      )}

      {!gameOver && score === 0 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center pointer-events-none animate-pulse">
          <p className="text-slate-500 text-xs uppercase tracking-[0.3em]">
            Click to Shoot & Move
          </p>
        </div>
      )}
    </div>
  );
}
