// EL PUEBLO (inspirado en Town de Black Ops 2): una calle principal con fuente y la torre del reloj al fondo, la tienda por donde se
// empieza, el bar, el banco con su cámara acorazada, correos, la posada y la ferretería con el generador. Entre los edificios hay
// callejones que dan a una franja trasera, así que los zombis llegan por delante, por detrás y por los lados.
import { buildSpecDecor } from "../decor";
import type { MapDef } from "../mapdef";
import type { BuySpec, LightSpec, PropSpec, WallRun } from "../mapdata";
import { door, interiorOf, perimeter, roomOf, wall, wallsOf, win, type Building } from "./kit";

const B = { minX: -30, maxX: 30, minZ: -40, maxZ: 22 };
// Hileras de edificios: oeste (x −27..−10) y este (x 10..27) con la calle entre medias.
const WX0 = -27, WX1 = -10, EX0 = 10, EX1 = 27;
const WC = (WX0 + WX1) / 2; // centro de cada hilera en X
const EC = (EX0 + EX1) / 2;

const tienda: Building = {
  name: "TIENDA", x0: WX0, z0: 2, x1: WX1, z1: 16, mat: "plaster", floor: "tile",
  N: [win(3, "w_tienda_n1"), win(12, "w_tienda_n2")],
  S: [win(3, "w_tienda_s1"), win(12, "w_tienda_s2")],
  W: [win(3, "w_tienda_w1"), win(9, "w_tienda_w2")],
  E: [win(2, "w_tienda_e1"), door(5.5, 2.5, "d_tienda", 500, "TIENDA"), win(10, "w_tienda_e2")],
};
const bar: Building = {
  name: "BAR", x0: WX0, z0: -14, x1: WX1, z1: -2, mat: "brick", floor: "wood",
  N: [win(3, "w_bar_n1"), win(12, "w_bar_n2")],
  S: [win(3, "w_bar_s1"), win(12, "w_bar_s2")],
  W: [win(3, "w_bar_w1"), win(8, "w_bar_w2")],
  E: [win(1.5, "w_bar_e1"), door(5, 2.5, "d_bar", 750, "BAR"), win(9, "w_bar_e2")],
};
const banco: Building = {
  name: "BANCO", x0: WX0, z0: -30, x1: WX1, z1: -18, mat: "plaster", floor: "tile",
  N: [win(10, "w_banco_n")],
  S: [win(3, "w_banco_s1"), win(12, "w_banco_s2")],
  W: [win(8, "w_banco_w")],
  E: [win(1.5, "w_banco_e1"), door(5, 2.5, "d_banco", 1000, "BANCO"), win(9, "w_banco_e2")],
};
const correos: Building = {
  name: "CORREOS", x0: EX0, z0: 2, x1: EX1, z1: 16, mat: "brick", floor: "wood",
  N: [win(3, "w_correos_n1"), win(12, "w_correos_n2")],
  S: [win(3, "w_correos_s1"), win(12, "w_correos_s2")],
  W: [win(2, "w_correos_w1"), door(5.5, 2.5, "d_correos", 750, "CORREOS"), win(10, "w_correos_w2")],
  E: [win(3, "w_correos_e1"), win(9, "w_correos_e2")],
};
const posada: Building = {
  name: "POSADA", x0: EX0, z0: -14, x1: EX1, z1: -2, mat: "siding", floor: "wood",
  N: [win(3, "w_posada_n1"), win(12, "w_posada_n2")],
  S: [win(3, "w_posada_s1"), win(12, "w_posada_s2")],
  W: [win(1.5, "w_posada_w1"), door(5, 2.5, "d_posada", 1250, "POSADA"), win(9, "w_posada_w2")],
  E: [win(3, "w_posada_e1"), win(8, "w_posada_e2")],
};
const ferre: Building = {
  name: "FERRETERÍA", x0: EX0, z0: -30, x1: EX1, z1: -18, mat: "concrete", floor: "concrete",
  N: [win(3, "w_ferre_n1"), win(12, "w_ferre_n2")],
  S: [win(3, "w_ferre_s1"), win(12, "w_ferre_s2")],
  W: [win(1.5, "w_ferre_w1"), door(5, 2.5, "d_ferre", 1500, "FERRETERÍA"), win(9, "w_ferre_w2")],
  E: [win(3, "w_ferre_e1"), win(8, "w_ferre_e2")],
};

const walls: WallRun[] = [
  ...perimeter(B, "concrete", 5),
  ...wallsOf(tienda), ...wallsOf(bar), ...wallsOf(banco), ...wallsOf(correos), ...wallsOf(posada), ...wallsOf(ferre),
  // Cámara acorazada del banco (esquina noroeste): su puerta se paga aparte.
  wall(WX0, -25, WX0 + 8, -25, "concrete"),
  wall(WX0 + 8, -30, WX0 + 8, -25, "concrete", [door(1.2, 2.4, "d_boveda", 1500, "CÁMARA ACORAZADA")]),
];

const buys: BuySpec[] = [
  { id: "buy_smg", weaponId: "smg", x: WC, z: 2.38, facing: Math.PI / 2 },
  { id: "buy_pistol_ammo", weaponId: "pistol", x: WC, z: 15.62, facing: -Math.PI / 2 },
  { id: "buy_rifle", weaponId: "rifle", x: WC, z: -13.62, facing: Math.PI / 2 },
  { id: "buy_shotgun", weaponId: "shotgun", x: WX1 - 2.2, z: -29.62, facing: Math.PI / 2 },
  { id: "buy_revolver", weaponId: "revolver", x: EC, z: 2.38, facing: Math.PI / 2 },
  { id: "buy_sniper", weaponId: "sniper", x: EC, z: 15.62, facing: -Math.PI / 2 },
];

const props: PropSpec[] = [
  // Calle principal
  { kind: "fountain", x: 0, z: -12 },
  { kind: "car", x: -3.5, z: 11, rot: 0.15, v: 1 },
  { kind: "car", x: 4.2, z: 16.5, rot: -0.2, v: 2 },
  { kind: "car", x: 3.2, z: -2.6, rot: 1.45, v: 0 },
  { kind: "van", x: -4.6, z: -21, rot: 0.1 },
  { kind: "bus", x: 4.5, z: -22, rot: Math.PI / 2 + 0.06 },
  { kind: "bench", x: -6.4, z: 17, rot: Math.PI / 2 },
  { kind: "bench", x: 6.4, z: 6, rot: -Math.PI / 2 },
  { kind: "bench", x: -6.4, z: -5, rot: Math.PI / 2 },
  { kind: "streetlight", x: -7.2, z: 8, rot: Math.PI / 2 },
  { kind: "streetlight", x: 7.2, z: -4, rot: -Math.PI / 2, v: 1 },
  { kind: "streetlight", x: -7.2, z: -16, rot: Math.PI / 2 },
  { kind: "streetlight", x: 7.2, z: -28, rot: -Math.PI / 2, v: 1 },
  { kind: "streetlight", x: -7.2, z: 19, rot: Math.PI / 2, v: 1 },
  { kind: "corpse", x: 1, z: 6, rot: 0.8, v: 1 },
  { kind: "corpse", x: -2, z: -1, rot: 2.6, v: 2 },
  { kind: "corpse", x: 3, z: -30, rot: 0.5, v: 3 },
  { kind: "cone", x: -1.2, z: 14, rot: 0.2 },
  { kind: "cone", x: 0.6, z: 14.6, rot: 1.1 },
  { kind: "tires", x: 6.3, z: -9.5 },
  { kind: "barrelFire", x: -6.2, z: -34 },
  { kind: "barrelFire", x: 6.4, z: -34.6 },
  { kind: "clocktower", x: 0, z: -37 },
  { kind: "sandbag", x: -2.2, z: -31.5, rot: 0 },
  { kind: "sandbag", x: 2.2, z: -31.5, rot: 0 },
  // Callejones y franja trasera
  { kind: "dumpster", x: WC + 2, z: 0, rot: 0.1 },
  { kind: "crate", x: WC - 4, z: -0.6 },
  { kind: "dumpster", x: EC - 3, z: 0, rot: -0.1 },
  { kind: "barrel", x: EC + 3, z: -0.4 },
  { kind: "dumpster", x: WC + 2, z: -16, rot: 0.2 },
  { kind: "crate", x: EC + 1, z: -16.2, v: 1 },
  { kind: "container", x: -28.4, z: 14, rot: 0 },
  { kind: "container", x: 28.4, z: -24, rot: 0 },
  { kind: "deadTree", x: -28.5, z: -8, v: 2 },
  { kind: "deadTree", x: 28.5, z: 8, v: 1 },
  { kind: "rubble", x: -28.2, z: -26 },
  { kind: "rubble", x: 28.2, z: -4 },
  // Tienda (sala de salida): estanterías y mostrador
  { kind: "shelf", x: -22, z: 9, rot: 0 },
  { kind: "shelf", x: -22, z: 12, rot: 0 },
  { kind: "counter", x: -13.6, z: 11.4, rot: 0 },
  { kind: "crate", x: -24.6, z: 14.4 },
  { kind: "crate", x: -12.2, z: 14.4, v: 1 },
  { kind: "corpse", x: -17, z: 7, rot: 1.2, v: 3 },
  // Bar
  { kind: "counter", x: WC + 4, z: -9.5, rot: Math.PI / 2 },
  { kind: "stool", x: WC + 2.9, z: -11.4 },
  { kind: "stool", x: WC + 2.9, z: -9.6 },
  { kind: "stool", x: WC + 2.9, z: -7.8 },
  { kind: "table", x: WC - 4, z: -10.5 },
  { kind: "table", x: WC - 4, z: -5 },
  { kind: "corpse", x: WC - 1, z: -3.6, rot: 0.3, v: 0 },
  // Banco
  { kind: "counter", x: WC + 2, z: -24.6, rot: 0 },
  { kind: "desk", x: WC + 5, z: -22, rot: 0.2 },
  { kind: "desk", x: WC - 1, z: -21, rot: -0.1 },
  { kind: "crate", x: -25, z: -28 },
  // Correos
  { kind: "counter", x: EC - 4, z: 10.4, rot: 0 },
  { kind: "shelf", x: EC + 5, z: 3.4, rot: 0 },
  { kind: "desk", x: EC + 4, z: 11.5, rot: 0.1 },
  { kind: "crate", x: EC - 7, z: 14.5 },
  // Posada
  { kind: "bed", x: EC - 4, z: -11.6, rot: 0 },
  { kind: "bed", x: EC + 4, z: -11.6, rot: 0 },
  { kind: "sofa", x: EC + 1, z: -4.4, rot: Math.PI, v: 1 },
  { kind: "table", x: EC - 4, z: -4.8 },
  // Ferretería
  { kind: "shelf", x: EC - 2, z: -28.4, rot: 0 },
  { kind: "shelf", x: EC + 2.4, z: -28.4, rot: 0 },
  { kind: "generator", x: EC + 4.8, z: -20.4, rot: Math.PI },
  { kind: "crate", x: EC - 6, z: -19.6 },
  { kind: "barrel", x: EC + 7, z: -28.6 },
  { kind: "pipe", x: EC + 1, z: -24.4, rot: 0 },
];

const lights: LightSpec[] = [
  { x: 0, z: 17, y: 4.6, color: 0xffb066, intensity: 22, distance: 17 },
  { x: 0, z: 4, y: 4.6, color: 0xff7a4a, intensity: 18, distance: 15, flicker: true },
  { x: 0, z: -12, y: 5.2, color: 0xff5a4a, intensity: 26, distance: 20, flicker: true },
  { x: 0, z: -26, y: 4.6, color: 0x9fd8ff, intensity: 16, distance: 15 },
  { x: 0, z: -35, y: 4.4, color: 0xffd09a, intensity: 18, distance: 15, flicker: true },
  { x: WC, z: 9, y: 3.4, color: 0xffe0b0, intensity: 16, distance: 12 },
  { x: WC, z: -8, y: 3.4, color: 0xff9a5a, intensity: 18, distance: 12, flicker: true },
  { x: WC, z: -24, y: 3.4, color: 0xa0d8ff, intensity: 14, distance: 12 },
  { x: EC, z: 9, y: 3.4, color: 0xffd9a0, intensity: 15, distance: 12 },
  { x: EC, z: -8, y: 3.4, color: 0xffa070, intensity: 15, distance: 12 },
  { x: EC, z: -24, y: 3.4, color: 0xbfe0ff, intensity: 14, distance: 12, flicker: true },
  { x: -28.4, z: -4, y: 4.2, color: 0xff8a5a, intensity: 10, distance: 11 },
  { x: 28.4, z: 10, y: 4.2, color: 0xff8a5a, intensity: 10, distance: 11 },
  { x: -18.5, z: 0, y: 4.0, color: 0xffa06a, intensity: 10, distance: 10 },
];

export const PUEBLO: MapDef = {
  id: "pueblo",
  name: "EL PUEBLO",
  tagline: "CALLE MAYOR",
  desc: "Calle mayor con tienda, bar, banco, correos y posada.",
  bounds: B,
  ground: "asphalt",
  sky: "town",
  rooms: [tienda, bar, banco, correos, posada, ferre].map(roomOf),
  interiors: [tienda, bar, banco, correos, posada, ferre].map(interiorOf),
  floors: [
    { x0: -10, z0: -40, x1: -7.4, z1: 22, mat: "concrete" },
    { x0: 7.4, z0: -40, x1: 10, z1: 22, mat: "concrete" },
    { x0: -10, z0: -40, x1: 10, z1: -31, mat: "cobble" },
  ],
  playerSpawn: { x: WC + 1, y: 0, z: 9, yaw: -Math.PI / 2 },
  walls,
  spawns: [
    { x: -4, z: 20.5 }, { x: 4, z: 20.5 }, { x: -28.5, z: 18 }, { x: -28.5, z: 4 },
    { x: -28.5, z: -16 }, { x: -28.5, z: -34 }, { x: -13, z: -37 }, { x: 13, z: -37 },
    { x: 28.5, z: 18 }, { x: 28.5, z: -8 }, { x: 28.5, z: -34 }, { x: 0, z: -30 },
  ],
  buys,
  boxSpots: [
    { x: WC - 3, z: 6.6, rot: 0, dais: false, name: "TIENDA" },
    { x: 0, z: -22.5, rot: 0, dais: false, name: "CALLE MAYOR" },
    { x: WC + 0.5, z: -6.2, rot: 0, dais: false, name: "BAR" },
    { x: WX0 + 4, z: -22, rot: -Math.PI / 2, dais: false, name: "BANCO" },
    { x: EC - 0.5, z: 8.4, rot: 0, dais: false, name: "CORREOS" },
    { x: EC + 2, z: -9.6, rot: -Math.PI / 2, dais: false, name: "POSADA" },
  ],
  upgrader: { x: WX0 + 4.4, z: -29.1, facing: Math.PI / 2 },
  powerSwitch: { x: EC, z: -29.6, facing: Math.PI / 2 },
  perkSpots: {
    quickRevive: { x: WX0 + 0.575, z: 9, rot: Math.PI / 2 },
    juggernog: { x: WC, z: -18.575, rot: Math.PI },
    speedCola: { x: WX0 + 0.575, z: -7, rot: Math.PI / 2 },
    doubleTap: { x: EX1 - 0.575, z: -7, rot: -Math.PI / 2 },
  },
  props,
  lights,
  decorate: (root, dyn, animated) =>
    buildSpecDecor(root, dyn, animated, {
      seed: 1313,
      texts: [
        { x: WX1, z: 8.7, nx: 1, nz: 0, y: 3.2, text: "TIENDA", color: "#ffd75e", w: 2.8 },
        { x: WX1, z: -7.7, nx: 1, nz: 0, y: 3.2, text: "BAR EL TRAGO", color: "#ff8a4a", w: 3.4 },
        { x: WX1, z: -23.7, nx: 1, nz: 0, y: 3.2, text: "BANCO", color: "#dfe6ee", w: 2.8 },
        { x: EX0, z: 8.7, nx: -1, nz: 0, y: 3.2, text: "CORREOS", color: "#7ac8ff", w: 3.0 },
        { x: EX0, z: -7.7, nx: -1, nz: 0, y: 3.2, text: "POSADA", color: "#ffd75e", w: 2.8 },
        { x: EX0, z: -23.7, nx: -1, nz: 0, y: 3.2, text: "FERRETERÍA", color: "#ffb03a", w: 3.4 },
        { x: -27, z: 14, nx: 0, nz: 0, y: 0, text: "", color: "#000", w: 0.01 },
        { x: WX0 + 4.4, z: -24.9, nx: 0, nz: 1, y: 2.3, text: "MEJORADOR", color: "#3ac8ff", w: 2.6 },
        { x: WC, z: -2, nx: 0, nz: -1, y: 2.4, text: "ELLOS VIENEN", color: "#b8141b", w: 3.0 },
        { x: EC, z: 16, nx: 0, nz: 1, y: 2.4, text: "NO SALGAS", color: "#b8141b", w: 2.4 },
        { x: EC, z: -29.8, nx: 0, nz: 1, y: 2.1, text: "ACTIVA LA ENERGÍA", color: "#ffb03a", w: 3.4 },
        { x: 0, z: -33.9, nx: 0, nz: 1, y: 7.6, text: "PUEBLO FANTASMA", color: "#dfe6ee", w: 5.0 },
      ].filter((t) => t.text),
      hands: [[WX1 - 0.2, 12, 1, 0, 1.2], [EX0 + 0.2, -6, -1, 0, 1.3], [WC, -13.9, 0, 1, 1.2], [EC, -17.9, 0, 1, 1.1]],
      claws: [[WX0 + 0.2, 6, 1, 0, 1.4], [EX1 - 0.2, 7, -1, 0, 1.3], [WX1, -26, 1, 0, 1.5]],
      blood: [
        { x0: -8, z0: -30, x1: 8, z1: 21 }, tienda, bar, banco, correos, posada, ferre,
      ].map((r) => ("name" in r ? { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 } : r)),
      bloodCount: 70,
      trails: [[0, 18, -1, 4], [-3, -4, 4, -14], [0, -18, 0, -28], [-20, 8, -14, 9], [20, -8, 14, -7]],
      puddles: [[-3, 14, 2.4], [3, 2, 2.0], [-2, -6, 2.6], [5, -16, 2.2], [-4, -26, 2.8], [1, -33, 2.0], [-8.5, 6, 1.4], [8.5, -10, 1.6]],
      papers: { x0: -8, z0: -34, x1: 8, z1: 20 },
    }),
};
