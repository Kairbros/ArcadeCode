// LA TERMINAL (inspirada en el Depósito de autobuses de Tranzit): el edificio de la estación con su sala de espera, taquillas y
// oficina, el garaje de los autobuses con su portón, la gasolinera con tienda y un aparcamiento lleno de autobuses abandonados
// y barreras de hormigón. Se empieza en la sala de espera.
import { buildSpecDecor } from "../decor";
import type { MapDef } from "../mapdef";
import type { BuySpec, LightSpec, PropSpec, WallRun } from "../mapdata";
import { door, interiorOf, perimeter, roomOf, wall, wallsOf, win, type Building } from "./kit";

const B = { minX: -30, maxX: 30, minZ: -38, maxZ: 22 };

const estacion: Building = {
  name: "ESTACIÓN", x0: -26, z0: -24, x1: 6, z1: -6, mat: "plaster", floor: "tile",
  N: [win(12, "w_term_n1"), win(20, "w_term_n2"), win(27, "w_term_n3")],
  S: [win(2, "w_term_s1"), door(6, 3, "d_terminal", 500, "ESTACIÓN"), win(11, "w_term_s2"), win(16, "w_term_s3"), win(21, "w_term_s4"), win(26, "w_term_s5")],
  W: [win(11, "w_term_w1")],
  E: [win(4, "w_term_e1"), door(9, 2.5, "d_andenes", 750, "ANDENES")],
};
const garaje: Building = {
  name: "GARAJE", x0: 12, z0: -30, x1: 28, z1: -8, mat: "metal", floor: "concrete",
  N: [win(3, "w_gar_n1"), win(11, "w_gar_n2")],
  S: [win(1.5, "w_gar_s1"), door(5, 6, "d_garaje", 1250, "GARAJE"), win(12.5, "w_gar_s2")],
  W: [win(3, "w_gar_w1"), door(9, 2.5, "d_taller", 750, "TALLER")],
  E: [win(3, "w_gar_e1"), win(10, "w_gar_e2"), win(17, "w_gar_e3")],
};
const gasolinera: Building = {
  name: "GASOLINERA", x0: -27, z0: 8, x1: -15, z1: 17, mat: "brick", floor: "tile",
  N: [win(2, "w_gas_n1"), win(9, "w_gas_n2")],
  S: [door(4, 2, "d_gasolinera", 750, "GASOLINERA"), win(8, "w_gas_s")],
  W: [win(3, "w_gas_w")],
  E: [win(3, "w_gas_e")],
};

const walls: WallRun[] = [
  ...perimeter(B, "concrete", 5),
  ...wallsOf(estacion),
  // Oficina (esquina noroeste de la estación): su puerta se paga.
  wall(-26, -15, -16, -15, "concrete"),
  wall(-16, -24, -16, -15, "concrete", [door(3, 2.4, "d_oficina", 1000, "OFICINA")]),
  ...wallsOf(garaje),
  ...wallsOf(gasolinera),
];

const buys: BuySpec[] = [
  { id: "buy_smg", weaponId: "smg", x: -7, z: -6.38, facing: -Math.PI / 2 },
  { id: "buy_rifle", weaponId: "rifle", x: -9, z: -23.62, facing: Math.PI / 2 },
  { id: "buy_revolver", weaponId: "revolver", x: 5.62, z: -16, facing: Math.PI },
  { id: "buy_sniper", weaponId: "sniper", x: 12.38, z: -23.3, facing: 0 },
  { id: "buy_pistol_ammo", weaponId: "pistol", x: -21, z: 16.62, facing: -Math.PI / 2 },
  { id: "buy_shotgun", weaponId: "shotgun", x: 27.62, z: -15.6, facing: Math.PI },
];

const props: PropSpec[] = [
  // Sala de espera
  { kind: "bench", x: -12, z: -10, rot: 0 },
  { kind: "bench", x: -8, z: -10, rot: 0 },
  { kind: "bench", x: -12, z: -13.5, rot: Math.PI },
  { kind: "bench", x: -8, z: -13.5, rot: Math.PI },
  { kind: "counter", x: -12, z: -21, rot: 0 },
  { kind: "counter", x: -6, z: -21, rot: 0 },
  { kind: "vending", x: 4.6, z: -9.5, rot: -Math.PI / 2, v: 0 },
  { kind: "vending", x: 4.6, z: -22.4, rot: -Math.PI / 2, v: 2 },
  { kind: "luggage", x: -3, z: -11.5, v: 0 },
  { kind: "luggage", x: -1.5, z: -19, v: 2, rot: 0.6 },
  { kind: "corpse", x: -6, z: -16.5, rot: 0.4, v: 1 },
  { kind: "table", x: -15.5, z: -9.4 },
  // Oficina
  { kind: "desk", x: -24, z: -22.6, rot: 0.2 },
  { kind: "shelf", x: -19, z: -23.2, rot: 0 },
  { kind: "crate", x: -25, z: -17 },
  { kind: "corpse", x: -20, z: -17, rot: 2.2, v: 3 },
  // Garaje
  { kind: "bus", x: 20, z: -20.6, rot: 0 },
  { kind: "barrel", x: 14, z: -10, v: 2 },
  { kind: "barrel", x: 26, z: -28.6 },
  { kind: "crate", x: 14, z: -28.6 },
  { kind: "crate", x: 26.4, z: -9.4, v: 1 },
  { kind: "generator", x: 24.4, z: -9.8, rot: Math.PI },
  { kind: "tires", x: 23, z: -28 },
  // Gasolinera
  { kind: "counter", x: -17.8, z: 14.4, rot: Math.PI / 2 },
  { kind: "shelf", x: -24, z: 15.4, rot: 0 },
  { kind: "vending", x: -25.8, z: 11.6, rot: Math.PI / 2, v: 1 },
  // Aparcamiento
  { kind: "pump", x: -12, z: 8, v: 0 },
  { kind: "pump", x: -12, z: 11, v: 1 },
  { kind: "pump", x: -8.4, z: 8, v: 1 },
  { kind: "pump", x: -8.4, z: 11, v: 0 },
  { kind: "bus", x: 8, z: 2, rot: Math.PI / 2 },
  { kind: "bus", x: 17, z: 12, rot: -Math.PI / 2 + 0.1 },
  { kind: "bus", x: -2, z: 16, rot: Math.PI / 2 + 0.08 },
  { kind: "car", x: 24, z: 3, rot: 0.4, v: 2 },
  { kind: "car", x: -22, z: 0, rot: -0.3, v: 0 },
  { kind: "car", x: -4.6, z: -0.6, rot: 1.6, v: 3 },
  { kind: "jersey", x: -3, z: 7, rot: 0.1 },
  { kind: "jersey", x: 0.6, z: 7, rot: -0.1 },
  { kind: "jersey", x: 12, z: -3, rot: 0.1 },
  { kind: "jersey", x: 15, z: -3, rot: 0 },
  { kind: "jersey", x: 22, z: 8.5, rot: 0.2 },
  { kind: "cone", x: -5, z: 4, rot: 0.3 },
  { kind: "cone", x: -4.2, z: 4.8, rot: 1.1 },
  { kind: "barrelFire", x: 9, z: 8.6 },
  { kind: "barrelFire", x: -25, z: -2 },
  { kind: "streetlight", x: -14, z: 2, rot: 0 },
  { kind: "streetlight", x: 8, z: 12, rot: Math.PI, v: 1 },
  { kind: "streetlight", x: 26, z: 4, rot: Math.PI, v: 1 },
  { kind: "corpse", x: 5, z: 6, rot: 0.9, v: 2 },
  { kind: "corpse", x: -14, z: 14, rot: 2.2, v: 0 },
  { kind: "corpse", x: 20, z: -2, rot: 1.1, v: 1 },
  { kind: "dumpster", x: 9, z: -28, rot: 0 },
  { kind: "rubble", x: 8, z: -33 },
  { kind: "deadTree", x: -28, z: 4, v: 1 },
];

const lights: LightSpec[] = [
  { x: -10, z: -15, y: 3.4, color: 0xffe0b0, intensity: 18, distance: 14, flicker: true },
  { x: -18, z: -10, y: 3.4, color: 0xa0d8ff, intensity: 14, distance: 11 },
  { x: -1, z: -15, y: 3.4, color: 0xffa070, intensity: 14, distance: 11 },
  { x: -21, z: -19.5, y: 3.4, color: 0xffd9a0, intensity: 14, distance: 10 },
  { x: 20, z: -12, y: 4.0, color: 0xffc070, intensity: 20, distance: 14, flicker: true },
  { x: 20, z: -24, y: 4.0, color: 0xbfe0ff, intensity: 16, distance: 13 },
  { x: -21, z: 12.5, y: 3.4, color: 0xff9a5a, intensity: 14, distance: 10 },
  { x: -10, z: 10, y: 4.8, color: 0xffb066, intensity: 18, distance: 14 },
  { x: 2, z: 2, y: 4.8, color: 0xff7a4a, intensity: 18, distance: 15, flicker: true },
  { x: 14, z: 6, y: 4.8, color: 0xffd0a0, intensity: 16, distance: 14 },
  { x: 24, z: 8, y: 4.6, color: 0x9fd8ff, intensity: 12, distance: 12 },
  { x: 9, z: -14, y: 4.4, color: 0xff6a4a, intensity: 14, distance: 12, flicker: true },
  { x: -2, z: 14, y: 4.6, color: 0xffa070, intensity: 12, distance: 12 },
  { x: 0, z: -30, y: 4.4, color: 0xbfe0ff, intensity: 12, distance: 13 },
];

export const TERMINAL: MapDef = {
  id: "terminal",
  name: "LA TERMINAL",
  tagline: "AUTOBUSES",
  desc: "Estación, garaje con portón y gasolinera.",
  bounds: B,
  ground: "asphalt",
  sky: "city",
  rooms: [estacion, garaje, gasolinera].map(roomOf),
  interiors: [estacion, garaje, gasolinera].map(interiorOf),
  floors: [
    { x0: 6, z0: -8, x1: 28, z1: 0, mat: "concrete" },
    { x0: -27, z0: -6, x1: 6, z1: -3.5, mat: "concrete" },
    { x0: -30, z0: 6, x1: -6, z1: 14, mat: "concrete" },
  ],
  playerSpawn: { x: -10, y: 0, z: -16.5, yaw: Math.PI },
  walls,
  spawns: [
    { x: -28.5, z: 19 }, { x: -14, z: 20.5 }, { x: 0, z: 20.5 }, { x: 14, z: 20.5 },
    { x: 28.5, z: 19 }, { x: 28.8, z: 2 }, { x: 28.8, z: -34 }, { x: 14, z: -35 },
    { x: -14, z: -35 }, { x: -28.5, z: -30 }, { x: -28.5, z: -12 }, { x: 9, z: -34 },
  ],
  buys,
  boxSpots: [
    { x: -3, z: -15, rot: Math.PI, dais: false, name: "SALA DE ESPERA" },
    { x: 3, z: 0.5, rot: 0, dais: false, name: "APARCAMIENTO" },
    { x: 20.5, z: -10.6, rot: 0, dais: false, name: "GARAJE" },
    { x: -21, z: 12.6, rot: 0, dais: false, name: "GASOLINERA" },
    { x: -21, z: -19.5, rot: Math.PI, dais: false, name: "OFICINA" },
    { x: 9, z: -20.5, rot: Math.PI / 2, dais: false, name: "ANDENES" },
  ],
  upgrader: { x: 12.9, z: -14, facing: 0 },
  powerSwitch: { x: -21, z: -23.6, facing: Math.PI / 2 },
  perkSpots: {
    quickRevive: { x: -25.4, z: -8.5, rot: Math.PI / 2 },
    juggernog: { x: 21.4, z: -29.4, rot: 0 },
    speedCola: { x: 27.4, z: -22.5, rot: -Math.PI / 2 },
    doubleTap: { x: -21, z: 8.575, rot: 0 },
  },
  props,
  lights,
  decorate: (root, dyn, animated) =>
    buildSpecDecor(root, dyn, animated, {
      seed: 777,
      texts: [
        { x: -10, z: -5.8, nx: 0, nz: 1, y: 3.0, text: "ESTACIÓN CENTRAL", color: "#dfe6ee", w: 4.6 },
        { x: -18.5, z: -5.8, nx: 0, nz: 1, y: 2.0, text: "ENTRADA", color: "#ffd75e", w: 2.2 },
        { x: 20, z: -7.8, nx: 0, nz: 1, y: 3.4, text: "GARAJE", color: "#ffb03a", w: 3.2 },
        { x: -21, z: 17.2, nx: 0, nz: 1, y: 3.0, text: "GASOLINERA", color: "#7ac8ff", w: 3.2 },
        { x: -9, z: -6.2, nx: 0, nz: -1, y: 2.4, text: "ANDÉN 3", color: "#dfe6ee", w: 2.4 },
        { x: -21, z: -15.2, nx: 0, nz: -1, y: 2.4, text: "MEJORADOR", color: "#3ac8ff", w: 2.6 },
        { x: -21, z: -23.8, nx: 0, nz: 1, y: 2.2, text: "ACTIVA LA ENERGÍA", color: "#ffb03a", w: 3.4 },
        { x: 6, z: -12, nx: -1, nz: 0, y: 2.2, text: "NO HAY SALIDA", color: "#b8141b", w: 3.0 },
        { x: 29.8, z: 8, nx: -1, nz: 0, y: 2.6, text: "SIN SERVICIO", color: "#b8141b", w: 3.4 },
        { x: 0, z: 21.8, nx: 0, nz: -1, y: 2.6, text: "NINGÚN AUTOBÚS LLEGARÁ", color: "#dfe6ee", w: 5.0 },
      ],
      hands: [[-25.8, -14, 1, 0, 1.2], [5.8, -13, -1, 0, 1.3], [12.2, -19, 1, 0, 1.2], [-26.8, 12, 1, 0, 1.3]],
      claws: [[-10, -23.8, 0, 1, 1.4], [20, -29.8, 0, 1, 1.3], [-16.2, -19, 1, 0, 1.4], [-21, 16.8, 0, -1, 1.2]],
      blood: [
        { x0: -26, z0: -24, x1: 6, z1: -6 }, { x0: 12, z0: -30, x1: 28, z1: -8 }, { x0: -27, z0: 8, x1: -15, z1: 17 },
        { x0: -26, z0: -4, x1: 28, z1: 20 },
      ],
      bloodCount: 66,
      trails: [[-6, 10, -8, -2], [10, 6, 20, -4], [-14, -8, -4, -18], [20, -10, 20, -22], [-20, 4, -16, 12]],
      puddles: [[-4, 6, 2.6], [12, 4, 2.2], [24, 12, 2.4], [-18, 0, 2.0], [2, 14, 2.8], [-26, 14, 1.8], [8, -4, 1.6], [26, -2, 1.8]],
      papers: { x0: -28, z0: -34, x1: 28, z1: 20 },
    }),
};
