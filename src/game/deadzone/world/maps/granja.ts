// LA GRANJA (inspirada en la granja de Tranzit de Black Ops 2): una casa de campo de madera blanca con porche, un granero rojo
// con su gran puerta, un silo, el tractor, el pozo, abrevaderos, balas de heno y árboles secos; al fondo, la caseta del
// generador con la energía. Todo el terreno es campo abierto rodeado de una cerca alta.
import { buildSpecDecor } from "../decor";
import type { MapDef } from "../mapdef";
import type { BuySpec, LightSpec, PropSpec, WallRun } from "../mapdata";
import { door, interiorOf, perimeter, roomOf, wall, wallsOf, win, type Building } from "./kit";

const B = { minX: -30, maxX: 30, minZ: -38, maxZ: 22 };

// --- Edificios ---
const casa: Building = {
  name: "CASA",
  x0: -22, z0: -12, x1: -6, z1: 6,
  mat: "siding", floor: "wood",
  N: [win(3, "w_casa_n1"), win(11, "w_casa_n2")],
  S: [win(2, "w_casa_s1"), door(7, 2, "d_porche", 500, "PORCHE"), win(11, "w_casa_s2")],
  W: [win(3, "w_casa_w1"), win(12, "w_casa_w2")],
  E: [win(4, "w_casa_e1"), win(13, "w_casa_e2")],
};
const granero: Building = {
  name: "GRANERO",
  x0: 8, z0: -22, x1: 24, z1: -4,
  mat: "barn", matTop: "barn", floor: "wood",
  N: [win(4, "w_granero_n1"), win(10, "w_granero_n2")],
  S: [win(1, "w_granero_s1"), door(5, 4, "d_granero", 1250, "GRANERO"), win(13, "w_granero_s2")],
  W: [win(3, "w_granero_w1"), door(11, 2, "d_establo", 750, "ESTABLO")],
  E: [win(5, "w_granero_e1"), win(11, "w_granero_e2")],
};
const caseta: Building = {
  name: "GENERADOR",
  x0: -7, z0: -34, x1: 7, z1: -26,
  mat: "metal", floor: "concrete",
  N: [win(6, "w_gen_n")],
  S: [win(1, "w_gen_s1"), door(6, 2, "d_generador", 1500, "GENERADOR"), win(11, "w_gen_s2")],
  W: [win(3, "w_gen_w")],
  E: [win(3, "w_gen_e")],
};

const walls: WallRun[] = [
  ...perimeter(B, "wood", 4.4),
  ...wallsOf(casa),
  // Tabique: la mitad norte de la casa (cocina y dormitorio) se paga.
  wall(-22, -4, -6, -4, "siding", [door(5, 2, "d_cocina", 750, "COCINA Y DORMITORIO")]),
  ...wallsOf(granero),
  ...wallsOf(caseta),
  // Cercas bajas del corral: dejan pasar por el medio pero ordenan el patio.
  wall(-28, 12, -12, 12, "wood", undefined, 1.25),
  wall(12, 12, 28, 12, "wood", undefined, 1.25),
];

const buys: BuySpec[] = [
  { id: "buy_pistol_ammo", weaponId: "pistol", x: -7.4, z: 6.38, facing: Math.PI / 2 },
  { id: "buy_smg", weaponId: "smg", x: -6.38, z: 4.8, facing: Math.PI },
  { id: "buy_rifle", weaponId: "rifle", x: -14, z: -11.62, facing: Math.PI / 2 },
  { id: "buy_revolver", weaponId: "revolver", x: 8.38, z: -14, facing: 0 },
  { id: "buy_sniper", weaponId: "sniper", x: 16, z: -21.62, facing: Math.PI / 2 },
  { id: "buy_shotgun", weaponId: "shotgun", x: 19.5, z: -3.62, facing: Math.PI / 2 },
];

const props: PropSpec[] = [
  // Patio de entrada
  { kind: "car", x: -11, z: 15, rot: 0.3, v: 3 },
  { kind: "car", x: 14.5, z: 15.5, rot: -0.4, v: 0 },
  { kind: "well", x: 3, z: 8 },
  { kind: "trough", x: -4.5, z: 9.4 },
  { kind: "hay", x: 8.5, z: 8, v: 0 },
  { kind: "hay", x: 9.6, z: 9.7, v: 0, rot: 0.8 },
  { kind: "barrel", x: -2, z: 17.6 },
  { kind: "barrelFire", x: 5.4, z: 17 },
  { kind: "tree", x: -24, z: 14, v: 0 },
  { kind: "tree", x: -27, z: 3, v: 1 },
  { kind: "tree", x: 25, z: 15, v: 2 },
  { kind: "tree", x: 27.5, z: 6, v: 3 },
  { kind: "tree", x: -26.5, z: -22, v: 2 },
  { kind: "tree", x: -27, z: -32, v: 0 },
  { kind: "corpse", x: 0.5, z: 12.8, rot: 0.7, v: 1 },
  // Casa: sala (sur) y cocina-dormitorio (norte)
  { kind: "sofa", x: -12, z: 1.2, rot: 0.2, v: 0 },
  { kind: "table", x: -17, z: 1.4 },
  { kind: "bed", x: -10, z: -8.6, rot: 0 },
  { kind: "counter", x: -20.2, z: -6.6, rot: Math.PI / 2 },
  { kind: "desk", x: -18.2, z: -9.6, rot: 0 },
  { kind: "shelf", x: -13.6, z: -5.2, rot: 0 },
  { kind: "corpse", x: -19, z: 3.4, rot: 1.9, v: 2 },
  // Entre la casa y el granero
  { kind: "hay", x: 4.5, z: -24.2, v: 1 },
  { kind: "tractor", x: -3.2, z: -18.5, rot: 0.3 },
  { kind: "crate", x: 2.2, z: -6.2 },
  { kind: "barrel", x: -4.5, z: -3.4 },
  { kind: "tires", x: 5.8, z: -17 },
  { kind: "deadTree", x: 6.2, z: -2.4, v: 1 },
  // Granero
  { kind: "tractor", x: 19.5, z: -9, rot: 0 },
  { kind: "hay", x: 10.2, z: -20.6, v: 1 },
  { kind: "hay", x: 11, z: -5.8, v: 0 },
  { kind: "hay", x: 10.4, z: -12.4, v: 0, rot: 1.2 },
  { kind: "crate", x: 9.6, z: -17.8 },
  { kind: "crate", x: 21.6, z: -6, v: 1 },
  { kind: "trough", x: 15, z: -5.6, rot: 0 },
  // Silo y alrededores
  { kind: "silo", x: 26.4, z: -29.5 },
  { kind: "silo", x: 26.4, z: -34.2 },
  { kind: "hay", x: 27, z: 0, v: 0 },
  // Caseta del generador
  { kind: "generator", x: 4.8, z: -32, rot: 0 },
  { kind: "crate", x: -5.6, z: -32.6 },
  { kind: "barrel", x: 5.6, z: -27.2 },
  { kind: "pipe", x: -3.8, z: -29.5, rot: 0 },
  // Ambiente
  { kind: "streetlight", x: -1, z: 4.4, rot: 0 },
  { kind: "streetlight", x: 1.6, z: -9.5, rot: Math.PI, v: 1 },
  { kind: "barbed", x: -7, z: 20.4, rot: 0 },
  { kind: "barbed", x: 7, z: 20.4, rot: 0 },
  { kind: "corpse", x: -2, z: -14, rot: 2.1, v: 0 },
  { kind: "corpse", x: 14, z: -26.5, rot: 0.2, v: 3 },
  { kind: "cone", x: 6, z: 2.5, rot: 0.3 },
];

const lights: LightSpec[] = [
  { x: 0, z: 14, y: 4.6, color: 0xffb066, intensity: 22, distance: 17 },
  { x: -14, z: 14, y: 4.4, color: 0xff9a5a, intensity: 14, distance: 12 },
  { x: 14, z: 13, y: 4.4, color: 0xffd0a0, intensity: 14, distance: 12 },
  { x: -14, z: 1.5, y: 3.4, color: 0xffd9a0, intensity: 16, distance: 11, flicker: true },
  { x: -14, z: -8, y: 3.4, color: 0xa0d8ff, intensity: 14, distance: 11 },
  { x: 1, z: -2, y: 4.6, color: 0xff7a4a, intensity: 18, distance: 15, flicker: true },
  { x: 1, z: -13, y: 5.2, color: 0xff5a4a, intensity: 26, distance: 20, flicker: true },
  { x: 16, z: -13, y: 4.0, color: 0xffc070, intensity: 20, distance: 14, flicker: true },
  { x: 16, z: -6, y: 3.8, color: 0xff9a5a, intensity: 12, distance: 10 },
  { x: 0, z: -30, y: 3.4, color: 0xbfe0ff, intensity: 14, distance: 11, flicker: true },
  { x: 1, z: -24, y: 4.4, color: 0xffa070, intensity: 14, distance: 13 },
  { x: -24, z: -4, y: 4.4, color: 0x9fb8ff, intensity: 10, distance: 11 },
  { x: 25, z: 6, y: 4.4, color: 0xffb070, intensity: 11, distance: 11 },
  { x: 24, z: -28, y: 4.4, color: 0xff8a5a, intensity: 11, distance: 11 },
];

export const GRANJA: MapDef = {
  id: "granja",
  name: "LA GRANJA",
  tagline: "CAMPO ABIERTO",
  desc: "Casa de campo, granero, silo y tractor en campo abierto.",
  bounds: B,
  ground: "grass",
  sky: "hills",
  rooms: [roomOf(casa), roomOf(granero), roomOf(caseta)],
  interiors: [interiorOf(casa), interiorOf(granero), interiorOf(caseta)],
  floors: [
    { x0: -3, z0: -38, x1: 3, z1: 22, mat: "dirt" },
    { x0: -26, z0: 6.2, x1: 26, z1: 11, mat: "dirt" },
    { x0: -8, z0: -26, x1: 8, z1: -4, mat: "dirt" },
  ],
  playerSpawn: { x: -14.5, y: 0, z: 3.8, yaw: 0 },
  walls,
  spawns: [
    { x: -26, z: 17 }, { x: -14, z: 19.5 }, { x: 14, z: 19.5 }, { x: 26, z: 17 },
    { x: -27.5, z: 6 }, { x: 28, z: 1 }, { x: 27.5, z: -22 }, { x: 27.5, z: -35 },
    { x: 14, z: -33 }, { x: -14, z: -33 }, { x: -27.5, z: -28 }, { x: -27.5, z: -14 },
  ],
  buys,
  boxSpots: [
    { x: -12, z: -2.2, rot: 0, dais: false, name: "SALA DE LA CASA" },
    { x: 1, z: -11.5, rot: 0, dais: false, name: "PATIO CENTRAL" },
    { x: -18.4, z: -8.2, rot: -Math.PI / 2, dais: false, name: "COCINA" },
    { x: 15, z: -16.4, rot: 0, dais: false, name: "GRANERO" },
    { x: 2.2, z: -30, rot: Math.PI, dais: false, name: "GENERADOR" },
    { x: 17, z: 9, rot: Math.PI, dais: false, name: "CAMINO DE ENTRADA" },
  ],
  upgrader: { x: -7.6, z: -11.1, facing: Math.PI / 2 },
  powerSwitch: { x: -4, z: -33.6, facing: Math.PI / 2 },
  perkSpots: {
    quickRevive: { x: -21.4, z: 4.2, rot: Math.PI / 2 },
    juggernog: { x: 21.5, z: -21.4, rot: 0 },
    speedCola: { x: 23.4, z: -13, rot: -Math.PI / 2 },
    doubleTap: { x: -2.9, z: -26.6, rot: Math.PI },
  },
  props,
  lights,
  decorate: (root, dyn, animated) =>
    buildSpecDecor(root, dyn, animated, {
      seed: 4242,
      texts: [
        { x: 20.5, z: -3.82, nx: 0, nz: 1, y: 2.3, text: "ESTABLO HARPER", color: "#dfe6ee", w: 3.6 },
        { x: -14, z: 6, nx: 0, nz: 1, y: 2.1, text: "NO ENTRES", color: "#b8141b", w: 2.4 },
        { x: -6.2, z: -8, nx: -1, nz: 0, y: 1.9, text: "ELLOS VIENEN", color: "#b8141b", w: 2.6 },
        { x: -9, z: -11.9, nx: 0, nz: 1, y: 2.2, text: "MEJORADOR", color: "#3ac8ff", w: 2.7, arrow: "right" },
        { x: -2, z: -26.1, nx: 0, nz: -1, y: 2.4, text: "ACTIVA LA ENERGÍA", color: "#ffb03a", w: 3.4 },
        { x: -29.8, z: -10, nx: 1, nz: 0, y: 2.6, text: "GRANJA HARPER · PROPIEDAD PRIVADA", color: "#dfe6ee", w: 5.0 },
        { x: 29.8, z: 8, nx: -1, nz: 0, y: 2.6, text: "SOLO QUEDA CORRER", color: "#b8141b", w: 4.2 },
        { x: 4, z: 21.8, nx: 0, nz: -1, y: 2.4, text: "NO HAY ESCAPATORIA", color: "#dfe6ee", w: 4.0 },
      ],
      hands: [[-21.8, -9, 1, 0, 1.2], [-6.2, 1.4, -1, 0, 1.1], [8.2, -7, 1, 0, 1.3], [24, -12, -1, 0, 1.2], [-6.9, -29, 1, 0, 1.3]],
      claws: [[-14, -11.9, 0, 1, 1.4], [16, -3.8, 0, 1, 1.2], [8.2, -19, 1, 0, 1.5], [-21.8, 2, 1, 0, 1.3]],
      blood: [
        { x0: -22, z0: -12, x1: -6, z1: 6 }, { x0: 8, z0: -22, x1: 24, z1: -4 }, { x0: -7, z0: -34, x1: 7, z1: -26 },
        { x0: -10, z0: 8, x1: 10, z1: 20 }, { x0: -4, z0: -24, x1: 6, z1: -6 },
      ],
      bloodCount: 56,
      trails: [[-2, 14, -4, 6], [10, -4, 14, -14], [-14, 5, -14, -3], [3, -26, 0, -32], [20, 14, 26, 6]],
      puddles: [[-2, 10, 2.2], [6, 12, 1.8], [-8, 16, 2.4], [2, -8, 2.0], [-3, -20, 2.6], [12, 8, 1.6], [-17, 12, 3.0], [22, 12, 2.0]],
      papers: { x0: -26, z0: -34, x1: 26, z1: 18 },
    }),
};
