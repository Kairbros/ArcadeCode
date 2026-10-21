// Simulación: crea el mundo desde el mapa procedural y ejecuta los sistemas.
// La usan el modo local y el anfitrión en red (el invitado solo dibuja snapshots).
import { Player } from "./components";
import { COLS, PLAYER_COLORS, PLAYER_NAMES, ROUND_END_DELAY, ROWS, enemiesFor, type RGB } from "./config";
import { World, type Entity, type System } from "./ecs";
import { SpatialIndex } from "./grid";
import type { IntentSource } from "./input";
import { CRATE, WALL, generateMap } from "./mapgen";
import { createCrate, createEnemy, createPlayer, createWall } from "./prefabs";
import { drawGame, enemiesLeft, type GameView } from "./render/frame";
import { Hud } from "./render/hud";
import { Renderer } from "./render/renderer";
import { Rng } from "../core/rng";
import { AISystem } from "./systems/ai";
import { BombPlacementSystem, BombSystem } from "./systems/bomb";
import { CrateSystem } from "./systems/crate";
import { DamageSystem } from "./systems/damage";
import { InputSystem } from "./systems/input";
import { DyingSystem, LifetimeSystem } from "./systems/lifetime";
import { MovementSystem } from "./systems/movement";
import { PowerUpSystem } from "./systems/powerup";

export type GameMode = "local" | "host";

const HINTS: Record<GameMode, string> = {
  local: "J1: WASD + ESPACIO   |   J2: FLECHAS + ENTER   |   R nuevo mapa · 1/2 jugadores · P pausa",
  host: "Muévete con WASD o FLECHAS · Bomba: ESPACIO o ENTER   |   R nuevo mapa · P pausa",
};
const OVER_SUBTITLES: Record<GameMode, string> = {
  local: "R: nuevo mapa  ·  T: repetir mapa  ·  1/2: jugadores  ·  J: cambiar juego",
  host: "R: nuevo mapa  ·  T: repetir mapa  ·  J: cambiar juego",
};

export class Game {
  world!: World;
  systems: System[] = [];
  playerIds: Entity[] = [];
  seed = 0;
  over = false;
  result: [string, RGB] | null = null;
  paused = false;
  roundTime = 0;
  /** Lo rellena el anfitrión con el estado de las conexiones. */
  netLabel = "";
  private endTimer: number | null = null;
  private readonly renderer = new Renderer();
  private readonly hud = new Hud();

  /**
   * sources[i] controla al jugador i. En modo local se usan los nPlayers primeros
   * (1/2 cambia el número); en modo anfitrión juegan todos.
   */
  constructor(
    private sources: IntentSource[],
    public nPlayers: number,
    seed?: number,
    readonly mode: GameMode = "local",
  ) {
    this.newRound(seed);
  }

  newRound(seed?: number) {
    this.seed = seed ?? 1 + Math.floor(Math.random() * 999_999);
    const data = generateMap(COLS, ROWS, this.seed, this.nPlayers, enemiesFor(this.nPlayers));

    const world = new World();
    world.mapInfo = data;
    world.index = new SpatialIndex(world, data.cols, data.rows);
    data.tiles.forEach((row, y) =>
      row.forEach((tile, x) => {
        if (tile === WALL) createWall(world, x, y);
        else if (tile === CRATE) createCrate(world, x, y, data.loot[y][x]);
      }),
    );
    this.playerIds = data.playerSpawns.map(([c, r], i) => createPlayer(world, i, c, r, this.sources[i]));
    for (const [c, r] of data.enemySpawns) createEnemy(world, c, r);
    this.world = world;

    // El orden importa: intención -> acción -> consecuencias -> limpieza.
    this.systems = [
      new InputSystem(),
      new AISystem(new Rng(this.seed ^ 0x9e3779b9)),
      new BombPlacementSystem(),
      new MovementSystem(),
      new BombSystem(),
      new CrateSystem(),
      new PowerUpSystem(),
      new DamageSystem(),
      new DyingSystem(),
      new LifetimeSystem(),
    ];
    this.renderer.reset();
    this.over = false;
    this.result = null;
    this.endTimer = null;
    this.roundTime = 0;
    this.paused = false;
  }

  /** Atajos de partida (las teclas de movimiento las lee la fuente de intención). */
  handleKey(code: string) {
    if (code === "KeyR") this.newRound();
    else if (code === "KeyT") this.newRound(this.seed);
    else if (code === "KeyP") this.paused = !this.paused;
    else if (this.mode === "local" && (code === "Digit1" || code === "Digit2")) {
      this.nPlayers = code === "Digit1" ? 1 : 2;
      this.newRound();
    }
  }

  update(dt: number) {
    if (this.paused) return;
    this.roundTime += dt;
    for (const system of this.systems) {
      system.update(this.world, dt);
      this.world.flush();
    }
    this.renderer.update(dt);
    if (!this.over) this.checkRoundEnd(dt);
  }

  // --- estado de la ronda ---
  private alivePlayers(): Player[] {
    return this.playerIds.map((e) => this.world.get(e, Player)).filter((p): p is Player => !!p && p.alive);
  }

  private checkRoundEnd(dt: number) {
    const alive = this.alivePlayers();
    const finished = this.nPlayers === 1 ? !alive.length || enemiesLeft(this.world) === 0 : alive.length <= 1;
    if (!finished) return;
    this.endTimer ??= ROUND_END_DELAY;
    this.endTimer -= dt;
    if (this.endTimer <= 0) {
      this.over = true;
      this.result = this.computeResult();
    }
  }

  private computeResult(): [string, RGB] {
    const alive = this.alivePlayers();
    if (this.nPlayers === 1) return alive.length ? ["¡VICTORIA!", [255, 220, 80]] : ["GAME OVER", [255, 80, 80]];
    if (!alive.length) return ["¡EMPATE!", [235, 235, 245]];
    return [`¡GANA ${(PLAYER_NAMES[alive[0].index] ?? alive[0].name).toUpperCase()}!`, PLAYER_COLORS[alive[0].index]];
  }

  get view(): GameView {
    return {
      world: this.world,
      playerIds: this.playerIds,
      roundTime: this.roundTime,
      over: this.over,
      result: this.result,
      paused: this.paused,
      hint: HINTS[this.mode],
      overSubtitle: OVER_SUBTITLES[this.mode],
      localIndex: this.mode === "host" ? 0 : null,
      netLabel: this.netLabel,
    };
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale: number) {
    drawGame(ctx, pixelScale, this.view, this.renderer, this.hud);
  }
}
