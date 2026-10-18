# Memoria del proyecto: Arcade (Bomberman, Karts, Sumo de bolas, Monigotes y Ruleta de cartuchos)

Guía para quien vaya a extender el proyecto (persona o agente). Resume decisiones, contratos, despliegue
y trampas conocidas. El README cubre el uso; este documento, el porqué y el cómo extender.

## 1. Qué es y restricciones que guían todo

- Hub de juegos multijugador en TypeScript + Canvas 2D. Se juega en el navegador o dentro de VS Code
  (vista "Arcade" en el Explorador). Juegos: **Bomberman**, **Karts** (3D con relieve),
  **Sumo de bolas** (3D), **Monigotes** (peleas en plataformas) y **Ruleta de cartuchos**
  (escopeta por turnos contra un crupier, en 3D; inspirado en un juego indie, con nombre propio).
- **Pantalla muy pequeña**: se juega sobre todo en la barra lateral de VS Code (~180–300 px de ancho).
  Todo el UI (menú, HUD) debe funcionar ahí. El lienzo escala el tamaño lógico del juego.
- **Red corporativa**: los equipos de la oficina pueden no verse entre sí. Por eso la conexión es
  WebRTC directa con **respaldo automático por relé HTTP en Vercel**.
- **Hasta 4 jugadores**. Accesibilidad: **escala de grises** (botón del menú o tecla G); en gris los
  jugadores se distinguen por su número.
- Idioma: interfaz, comentarios y mensajes en **español**. Sin nombres ni personajes de Nintendo.
- **3D en bloques simples**: los modelos 3D se hacen con cajas grandes, sin esferas ni vóxeles finos (ver 6e).
- **Interfaz de recreativa**: todo el texto con la fuente de píxeles propia, paneles y rótulos retro (ver 6f).
- Existe una versión Python/pygame antigua en `../bomberman/` (solo Bomberman, sin red). No se usa.

## 2. Comandos

Todo desde la raíz del proyecto. En un clon limpio no hay `node_modules/` ni `dist/` (están en `.gitignore`):
hay que hacer `npm install` antes de nada.

```
npm install
npm run typecheck         # tsc --noEmit (strict, noUnusedLocals)
npm run serve -- 8000     # servidor local: juego + /api/signal en memoria, accesible en la LAN
npm run build             # extensión (dist/extension.cjs) + juego para webview (dist/game.js)
npm run build:web         # juego para Vercel (web/dist/main.js)
npx @vscode/vsce package --allow-missing-repository --skip-license --baseContentUrl https://github.com/Kairbros/ArcadeCode/blob/main --baseImagesUrl https://github.com/Kairbros/ArcadeCode/raw/main --out arcade.vsix
# (sin --baseContentUrl vsce falla: el README enlaza a MEMORIA.md con ruta relativa)
code --install-extension arcade.vsix --force    # luego "Developer: Reload Window"
npx vercel --prod         # desplegar
```

## 3. Despliegue actual

- Vercel: **https://bomber-five-tawny.vercel.app** (es el valor por defecto de `arcade.serverUrl`).
- Marketplace: ID **`kairbros-dev.kairbros-arcade`**, nombre visible **"Kairbros Arcade"** ("Arcade" a secas ya
  existía en la Marketplace, que exige nombres visibles únicos). Antes era `bomberman-procedural`; se renombró el 2026-10-17 para quitar
  "bomberman" del paquete: vista `arcade.view`, comando `arcade.play`, ajustes `arcade.*`,
  `window.ARCADE_CONFIG`). Las claves de localStorage de la web siguen siendo `bomberman.*` a propósito,
  para no perder el nombre guardado. Subir siempre el `.vsix` del proyecto (uno viejo en Descargas
  llevaba publisher `local` y la Marketplace lo rechazó).
- Redis: Upstash vía Marketplace de Vercel, región **us-west-1**. La función está fijada a **sfo1**
  en `vercel.json` para estar junto a Redis (si se cambia la región de Redis, cambiar `regions`).
- Variables que lee la API (`redisFromEnv`): `UPSTASH_REDIS_REST_URL`/`_TOKEN` y, si no están,
  `KV_REST_API_URL`/`KV_REST_API_TOKEN` (las que añade la integración de Vercel).
  Sin ellas usa memoria (solo válido en local).
- **Cuándo redesplegar**: si cambia `api/` o `src/server/` (siempre), o si alguien juega desde la web
  (la página sirve el cliente). La extensión lleva su propio cliente: no necesita redesplegar por
  cambios solo de juego.
- Cuota gratuita de Upstash: 500.000 comandos/mes. Solo gastan los jugadores que van por relé.

## 4. Arquitectura

```
api/signal.ts              función de Vercel (POST/OPTIONS/GET) → src/server/signal.ts
src/server/signal.ts       emparejamiento + relé; RedisLike (MemoryRedis | UpstashRedis REST multi-exec)
scripts/serve.mjs          servidor local: esbuild serve + proxy + misma API en memoria
src/extension.ts           extensión: WebviewView en el Explorador + panel grande (comando arcade.play);
                           CSP con nonce; inyecta window.ARCADE_CONFIG = { serverUrl, grayscale,
                           playerName, bots }. El juego guarda ajustes con postMessage (setGrayscale,
                           setBots, setPlayerName); la extensión reenvía la escala de grises en caliente
                           y recarga la vista si cambia serverUrl
src/game/main.ts           entrada: menú, partidas locales/anfitrión/invitado, escalado del lienzo
src/game/hub.ts            registro de juegos: GAMES, createHostGame, createGuestGame
src/game/core/             compartido: config común, rng (mulberry32), keyboard, names, draw (+ adornos retro),
                           pixelfont (fuente de píxeles), crt (efecto de tubo) y settings
                           (ajustes de VS Code dentro de la extensión; localStorage en la web)
src/game/ui/menu.ts        menú HTML (responsive, CSS en línea)
src/game/net/              red genérica: host, guest, rtc, relay (parámetros), signaling, types, protocol
src/game/bomberman/        ECS (components, ecs, systems/), mapgen, prefabs, game, input, render/,
                           snapshot (base+deltas), net (adaptadores HostGame/GuestGame)
src/game/karts/            config, track (generador), terrain (relieve), physics, race (árbitro+IA), input,
                           render (Three.js, bloques), game (adaptadores)
src/game/balls/            config, arena (física+IA+árbitro), input, render (Three.js, bloques), game (adaptadores)
src/game/core/three.ts     3D compartido: un solo WebGLRenderer (`glRenderer`), `renderInto`, `projectTo`, `glowSprite`,
                           `blockGeometry` (muchas cajas de colores en una malla), `disposeScene`
src/game/stick/            config, stages, fight (física+armas+bots+árbitro), input, render (poses por código), game
src/game/ruleta/           config, match (reglas+árbitro), bot, state (estado de red), input (teclas+selector),
                           math3d (vectores/giros), textures (generadas), models (Three.js), render (escena+HUD), game
```

### Contrato de red (lo que un juego debe implementar) — `src/game/net/types.ts`

- `HostGame`: `size`, `netLabel`, `finished` (ronda terminada: permite cambiar de juego), `update(dt)`, `draw(ctx, scale)`, `key(code)`,
  `frame(now) → { snap, base }`, `onMessage(index, msg)`, `onDisconnect(index)`.
- `GuestGame`: `id`, `size`, `baseSeq`, `ready`, `netLabel`, `onBase(b)`, `onSnap(s)`, `update(dt)`,
  `draw`, `outgoing(transport) → objeto | undefined` (el juego decide el ritmo de envío).
- `snap` **siempre** lleva `g` (id del juego), `seq` (creciente) y `base` (secuencia de la base,
  `-1` si el juego no usa bases). El invitado crea el juego al ver `snap.g`.
- Índices de jugador: 0 = anfitrión, 1..3 invitados (asignados al pulsar "Empezar").
- **Bots** (`settings.bots`, ajuste `arcade.bots`, botón del menú): con bots la IA rellena hasta 4 en Karts y
  Sumo; sin ellos solo juegan las personas (solo = contrarreloj / aguantar 60 s). En red vale el del anfitrión
  (`createHostGame`). Los enemigos de Bomberman no son bots: no les afecta. Afecta a Karts, Sumo y Monigotes;
  en Ruleta de cartuchos sienta al crupier (un solo bot), que en solitario se sienta siempre.
- **Nombres** (`core/names.ts`): `PLAYER_NAMES` es mutable y los juegos lo leen al dibujar. El nombre se elige en el
  menú (ajuste `arcade.playerName` o localStorage, máx. 12). El invitado lo manda en `{t:"hello"}` (directo) y
  como campo `nm` en sus mensajes hasta verlo en `snap.n`, la lista que `HostSession.stamp` añade a cada estado.
  Por relé el nombre no se ve en la sala de espera, solo al empezar.
- **Cambio de juego sin cerrar la sala**: al terminar (`finished`), el anfitrión pulsa J y elige otro juego
  (`HostSession.switchGame`). El invitado lo crea al ver otro `snap.g`. Como cada juego numera `seq` y bases
  desde 1, `HostSession` les suma un desfase para que sigan creciendo; el invitado guarda la última base
  (puede llegar justo antes del cambio).

### Cómo añadir un juego nuevo

1. Carpeta `src/game/<juego>/` con su lógica, render e input (los controles se crean desde `Keyboard`).
2. Implementar `HostGame` (vale también para local con 0 remotos) y `GuestGame`.
3. Registrar en `hub.ts`: `GameId`, entrada en `GAMES`, ramas en `createHostGame`/`createGuestGame`.
4. Local: añadir la rama en `startLocal` de `main.ts`.
5. Mensajes invitado→anfitrión: **≤ 300 caracteres en JSON** (límite `MAX_INPUT` del relé) e incluir
   un número de secuencia `s` (por el relé llegan desordenados; el anfitrión descarta los viejos).
6. Teclas que deban anular el scroll: añadir a `captured` en `main.ts`.
7. Implementar `finished` y mencionar "J: cambiar juego" en la pantalla final.
8. Probar en la barra lateral (tamaño pequeño) y en escala de grises.
9. Documentarlo: README (lista de juegos, tabla de controles, estructura), `description` de
   `package.json`, descripción del ajuste `arcade.bots` si usa bots, y una sección "claves" aquí.

### Red y relé

- Invitado: oferta WebRTC sin trickle (espera ICE ≤ 2 s); si en `P2P_TIMEOUT_MS` (7 s) no abre el
  canal, pide relé (`action: "relay"`) y sigue por HTTP. `join` con `offer: null` = sin WebRTC.
- Relé (`src/game/net/relay.ts`): `RELAY_HZ` = 10, hasta `RELAY_MAX_IN_FLIGHT` = 3 peticiones en
  paralelo, keepalive 1 s (`RELAY_KEEPALIVE_MS`), desconexión a los 10 s sin noticias (`RELAY_STALE_MS`).
- API `/api/signal` (POST JSON `{action,...}`): invitado `join | poll | relay | guest-sync`;
  anfitrión (requiere `hostKey` de `create`) `offers | answer | close | host-sync`.
- Claves Redis: `room:C` (abierta), `room:C:host`, `:offers`, `:relays`, `:answer:GID`, `:snap`,
  `:base`, `:in`, `:w:GID`. Coste habitual: host-sync 2 comandos, guest-sync 1 (+2 si envía entrada).
- `hostKey` se valida en memoria de la instancia (caché 30 s) para ahorrar comandos.

## 5. Bomberman (claves)

- ECS propio (`ecs.ts`): `query(...tipos)` tipado, bajas diferidas (`destroy` + `flush` tras cada sistema),
  `spawn(id)` para reconstruir desde red. Orden de sistemas en `game.ts` (intención → acción → consecuencias).
- Mapas procedurales por semilla con simetría, conectividad garantizada y botín equilibrado (3 buffs).
- Red: base completa + deltas (`snapshot.ts`, rebase si hay > 40 cambios o cada 5 s); el invitado
  interpola posiciones. Muros no viajan: se regeneran desde la semilla.

## 6. Karts (claves)

- **3D con Three.js** en estilo de bloques (antes era modo 7 por software), 256×224 lógicos (`KW`×`KH`).
  Escena en `render.ts` (`Stage`, se rehace al cambiar de circuito y libera la anterior con `disposeScene`);
  coordenadas del juego × `S` (0,05): x → x, y del mapa → z, altura del terreno → y.
  - Suelo: el dibujo del circuito (`trackCanvas`, un lienzo TEX×TEX = 1536) como textura sobre la rejilla
    del relieve, con caras planas. Más allá, una llanura en la niebla.
  - **Relieve** (`terrain.ts`, `terrainOf`/`heightAt`): sale de la semilla (igual en anfitrión e invitado).
    La pista sube y baja con 3 ondas largas suavizadas a lo largo de la vuelta y es plana de lado a lado
    (cerca de la pista la altura es la del punto más cercano de la línea central); lejos, colinas. Medido en
    50 circuitos: ~18 ms de cálculo, cuestas de hasta ~21°, inclinación lateral ≤ 3°, desnivel ~60 u.
    **Solo visual**: la física y la red siguen siendo planas (no hay que tocar `physics.ts`).
    `heightAt` interpola en el mismo triángulo que la malla para que los karts apoyen justo en el suelo.
  - Karts, decorados (árbol, arbusto, cactus, roca, pino), plátanos y proyectiles: cajas juntadas con
    `blockGeometry` (una malla por modelo). Montañas escalonadas y nubes de cubos sin niebla, arco de meta
    a cuadros, cajas "?" que cambian de color.
  - Cámara detrás del kart (`CAM_DIST`, `CAM_HEIGHT`), sigue `ma` (no el morro) y mira a `CAM_LOOK` por
    delante siguiendo las cuestas (`lookPitch`). Lo que queda entre la cámara y tu kart (otros karts en la
    parrilla, árboles al salirse) se oculta.
  - Sol con sombras que acompaña al kart propio; chispas del derrape y llamas del turbo de cubitos.
  - HUD y minimapa en 2D; el número de cada rival se proyecta encima de su kart.
- Circuitos (`track.ts`): 70 % "cuadrícula" (contorno de un poliominó en 7×7 casillas de 170) y 30 %
  "orgánico" (envolvente con hendiduras/lenguas/eses), suavizado Chaikin ×4, validación
  (radio ≥ 42, separación entre tramos ≥ `TRACK_W+WALL_MARGIN+16`, longitud 2.400–5.600),
  hasta 120 intentos y óvalo de emergencia. Meta en la recta más larga. Decoración sólida por tema.
- Física (`physics.ts`): `a` = morro, `ma` = dirección de avance (se separan al derrapar),
  muro invisible a `TRACK_W/2 + WALL_MARGIN`, progreso en puntos de línea central (vueltas = progreso/n).
- Derrape: Shift/C (saltito → derrape si se gira); miniturbo al soltar (azul > 0,8 s, naranja > 1,7 s).
  Ajustado porque "derrapaba y giraba mucho" (el kart iba cruzado hasta ~83° y giraba más cerrado que con el
  volante): ahora el giro derrapando es una fracción de `STEER_RATE` (`DRIFT_TURN`, `_IN`, `_OUT`), la dirección
  de avance sigue al morro a `DRIFT_FOLLOW` y el cruce se limita a `DRIFT_MAX_SLIP` (~26°). Con volante a tope a
  velocidad máxima: radio 74 u sin derrapar; derrapando 78 cerrando, 119 sin volante, 231 abriendo. La IA no
  derrapa. En el render el morro se dibuja tal cual (sin exagerar el cruce).
- Objetos: turbo, plátano, proyectil; los de atrás reciben más turbos. 3 vueltas, 4 corredores (IA rellena).
- Red: **cada invitado simula su propio kart** (sin retraso) y envía posición; el anfitrión
  (`race.ts`) arbitra cajas, golpes (`spinSeq`), objetos y llegada. Turbo se aplica al instante en el invitado.
- IA: sigue la línea central con desvío propio y frena según el giro de los próximos ~150 u (`cornerSpeed`).
- Probado con capturas de carreras reales (piloto automático en el kart propio) en los 3 temas.

## 6b. Sumo de bolas (claves)

- Arena circular sobre lava; gana el último en pie (empate si caen a la vez o se acaba el tiempo, 60 s).
  Desde los 20 s la plataforma encoge (100 → 45). Victorias acumuladas entre rondas (R).
- **3D con Three.js** en estilo de bloques (antes era modo 7 por software). Cámara fija al sur, alta, mirando
  hacia abajo al norte (`CAM_*` en `config.ts`; sigue un poco al jugador de lado). Escena en `render.ts`
  (`Stage`), con las coordenadas del juego × `S` (0,1): x → x, y (hacia la cámara) → z, altura → y.
  - Plataforma: baldosas cuadradas de `TILE` (6 u.) que son columnas hasta la lava (un `InstancedMesh`);
    las que quedan fuera de `radius` caen girando (sin temblar antes: el usuario lo pidió así). Damero (`CHECKER`) y borde de piedra (`RIM_W`).
  - Lava: mar de cubos luminosos (`InstancedMesh`, `MeshBasicMaterial`) que suben y bajan con paleta cíclica.
  - **Bolas facetadas** (icosaedro de pocas caras, sombreado plano) con una franja clara para que se vea que
    ruedan; es la única excepción a "solo cajas" (decisión del usuario). Muñeco de bloques encima, mirando a
    la cámara, inclinándose según la velocidad.
  - Luz: sol con sombras + hemisférica (cielo morado, suelo naranja = resplandor de la lava). Paredes de roca,
    chispas y salpicaduras de cubitos con destello al caer una bola.
  - El HUD y el número sobre cada muñeco (proyectado con `projectTo`) son 2D.
- Red: **anfitrión autoritativo** (choques entre bolas); el invitado manda dirección + contador de
  embestidas (`{t:"b",x,y,d,s}`) y suaviza posiciones adelantándolas por la velocidad.
- IA: si su posición prevista se sale, vuelve al centro; si no, se coloca entre el rival y el centro y carga.
  Ajustada con simulación (300 rondas solo IA: mediana ~43 s, ~15 % por tiempo).

## 6c. Monigotes (claves)

- Vista lateral fija 320×200, 3 escenarios (`stages.ts`) con plataformas que se atraviesan desde abajo (↓ para
  bajar) salvo los suelos `solid`. Último en pie gana; KO por vida o por salir del escenario. 90 s.
- Sin sprites: monigotes de líneas con poses calculadas (`makePose`); ragdoll simple al morir (giro + rebote).
- Empuje de los golpes × `KNOCK_SCALE(hp)` (crece al perder vida) con rozamiento del aire al salir despedido.
  Armas en cajas cada 5 s: espada, pistola (8 balas), bomba (2). Al morir se suelta el arma.
- Red: anfitrión autoritativo como Sumo; el invitado manda `{t:"f",x,d,j,a,s}` (contadores de salto/ataque).
- Ajustado con simulación (600 rondas solo bots: mediana ~17 s, ~15 % por tiempo, mezcla de caídas y KO).

## 6d. Ruleta de cartuchos (claves)

- Por turnos. 3 rondas (`ROUNDS`: 2/4/5 vidas, 0/2/4 objetos por carga; en la 3.ª con ≤ `CUT_AT` vidas no hay
  curas). Carga de 2–8 cartuchos con al menos uno de cada; se enseña cuántos hay y luego se cargan en orden
  oculto. Dispararse con fogueo = repite turno; sierra = daño 2. Esposas: el esposado se salta un turno
  (`cuffed` 1 → 2) y no se le puede volver a esposar hasta que juegue. Adrenalina: roba y usa al momento.
- `match.ts` es el árbitro: cada acción arranca una animación (`anim`) y su efecto se aplica a mitad
  (`SHOT_HIT`/`ITEM_HIT`); el cambio de turno y la carga nueva esperan a que termine (`afterAction`).
  El último evento viaja como `ev = [n, tipo, a, b, c, d, e]` y el render anima con `et` (tiempo desde él).
- **Secreto**: el orden de los cartuchos nunca sale del árbitro. El estado (`state.ts`) solo lleva lo que cada
  uno sabe (`kn`: posición desde la recámara + real). El bot (`bot.ts`) cuenta lo que queda y usa solo su `known`.
- Red: el invitado elige en su pantalla (`Picker`, compartido con el anfitrión) y manda `{t:"r",i,k,a,b,c,s}`;
  `i` crece con cada acción y se reenvía hasta verlo en `snap.ak[índice]` (el anfitrión ignora `i` ya vistos).
  Sin acción pendiente manda lo mismo cada `RELAY_KEEPALIVE_MS` para no caducar por el relé.
- 3D con **Three.js** (WebGL; también Sumo y Karts). `three` está en `devDependencies` porque esbuild lo mete en el
  paquete (la web pasa de ~157 KB a ~710 KB). Un solo `WebGLRenderer` para todo el hub (`core/three.ts`; los
  navegadores limitan los contextos); `renderInto` dibuja en un lienzo aparte a `tamaño lógico × escala de
  píxeles` (máx. ×3) y lo copia con `drawImage` al lienzo del juego, y encima va el HUD 2D. Por eso el `draw` de
  estos juegos recibe `pixelScale` (en `main.ts` local: `draw: (c, s) => game.draw(c, s)`). La escala de grises
  (filtro CSS) sigue funcionando. Sin WebGL, muestra un aviso y el HUD.
- Escena (`Stage` en `render.ts`): se construye una vez y en cada frame solo se recoloca. Luces: foco de la lámpara
  con sombras, bombilla omnidireccional (ilumina las caras), hemisférica tenue, luz suave junto a la cámara y
  destello del disparo. Halos (sprites aditivos) en lámpara, ojos del crupier y fogonazo; humo y polvo en el haz.
- Las poses se calculan con `math3d.ts` (guiñada/cabeceo/alabeo = Euler "YXZ" de Three).
- Cámara en primera persona desde tu asiento; los asientos se reparten en círculo a partir de ti (`angleOf`).
- Probado con simulación (300 partidas solo bots por tamaño: 2 jugadores ~3 min de mediana, 4 jugadores ~8;
  ninguna atascada; se usan los 9 objetos) y con capturas de escenas fijas en Edge sin ventana.

## 6e. Estilo 3D: bloques simples (regla del usuario)

**Todo lo 3D se modela con cajas grandes y simples**, como figuras de bloques: una caja para el torso, otra para
la cabeza, cajitas encima para cuencas, ojos, nariz, boca y dientes. Nada más complicado:

- **No** esferas, cilindros redondos, curvas, perfiles extruidos ni geometría deformada. Se probó (cabeza de
  esfera deformada, cañones de tubo) y al usuario no le convenció. **Única excepción**: las bolas de Sumo,
  que son icosaedros de pocas caras con sombreado plano ("bolas facetadas", elegido por el usuario).
- **No** cuadrícula de vóxeles finos (miles de cubitos de 1 cm, estilo MagicaVoxel). También se probó y no era
  lo que quería: "cubos y así", no vóxeles como tal.
- Sí vale: `BoxGeometry` (función `box` de `models.ts`), cajas giradas o estiradas entre dos puntos (`beam`,
  `stretch`) y, como mucho, un prisma de 4 lados (la pantalla de la lámpara). La mesa es cuadrada por eso.
- Sí valen los extras de Three.js que no son geometría: texturas dibujadas en canvas sobre las caras
  (`textures.ts`), luces y sombras, halos (sprites), transparencias. El humo y el polvo también son cubitos.
- Pocas piezas por modelo: los detalles se resuelven con color, textura o una cajita plana pegada a la cara.
- Una figura reconocible pesa más que el detalle: el crupier se reconoce por la cara pálida y huesuda, las
  cuencas negras con ojos que brillan y los dientes; se escala ×`DEALER_SCALE` para que imponga.

### Cómo modificar los modelos (`models.ts`)

- `box(tamaño, material, centro, giro?)`: tamaño y centro en metros; giro `[cabeceo, guiñada, alabeo]`.
  Referencias: tablero en y = 0, mesa de 2 × 2 m, suelo en `FLOOR_Y` (−0,75), asientos a `SEAT_R` (1,45 m).
- **Personajes** (`buildDealer`, `buildHuman`): en coordenadas del asiento, mirando hacia −z. Lo de cintura para
  arriba va en `body` (se inclina en `PIVOT`); piernas y silla en `legs` (quedan bajo la mesa). Usar siempre los
  materiales de `palette()` (`p.std`, `p.glow`) para que `dim` pueda oscurecerlos cuando el jugador queda fuera.
  Si cambia la altura de la cabeza o los hombros, actualizar `head`/`shoulders`/`eyes` del objeto que se
  devuelve: el render apunta la escopeta a `head`, cuelga los brazos de `shoulders` y pone halos en `eyes`.
- **Escopeta** (`buildGun`): origen en el cajón, cañón hacia −z. `GUN_GRIP` y `GUN_PUMP` son donde se ponen
  las manos; `gunMuzzle` es la boca (fogonazo y humo). Hay dos cañones (`full`/`sawed`) que se alternan.
- **Objetos** (`buildItem`): apoyados en y = 0, de 5–10 cm. Para añadir uno: su caso en `buildItem`, su `I_...` e
  info en `config.ts` (`ITEMS`), su efecto en `match.ts` (`applyItem`, y `canUse` si tiene condiciones), su
  frase en `eventText` (`render.ts`) y, si quieres que el crupier lo use, una regla en `bot.ts`.
- **Cartuchos** (`buildShell`): rojo oscuro = real, azul claro = fogueo (contrastan también en gris).
- **Sala, mesa y lámpara**: `buildRoom`, `buildTable`, `buildLamp`. La luz no está ahí sino en `Stage`
  (`render.ts`): foco de la lámpara (`SpotLight`, con sombras), bombilla (`PointLight`, ilumina las caras),
  hemisférica, luz junto a la cámara y destello. Si algo queda muy oscuro, subir la bombilla o
  `toneMappingExposure` antes que añadir luces.
- **Texturas** (`textures.ts`): se dibujan con Canvas 2D la primera vez (`make`). Para una etiqueta nueva basta
  con `label(clave, fondo, franja, tinta, palabra)`. Poner la textura en la cara que toca pasando un array de
  6 materiales a `box` (orden de caras: +x, −x, +y, −y, +z, −z).
- **Posiciones en la mesa** (`render.ts`): `slotLocal` coloca los 8 huecos de objetos de cada jugador; las
  manos en reposo, la escopeta en reposo (`GUN_REST`) y la animación del disparo están en `Stage.update`.

### Cómo comprobar un cambio visual

1. `npm run typecheck`.
2. Capturas de escenas fijas (sección 8, con las recetas): una página que importa `RuletaRenderer` y dibuja estados inventados
   (mi turno, me apuntan, disparo, 4 jugadores, intro de ronda...), capturada con Edge sin ventana y SwiftShader.
   Revisar la imagen y corregir (así se ajustaron los brazos, la luz de la cara del crupier y el tamaño de las
   marcas de selección).
3. Simulación de anfitrión + invitado con teclados al azar para confirmar que no se rompe nada de la lógica.

## 6f. Interfaz de recreativa (petición del usuario, 2026-10-18)

Los HUD y el menú tienen aire de recreativa retro. Piezas, todas compartidas:

- **Fuente de píxeles propia** (`core/pixelfont.ts`): glifos 5×7 dibujados a mano, solo mayúsculas (las
  minúsculas se pintan en mayúscula), con tildes/eñe/diéresis en dos filas encima y los símbolos que usan los
  juegos (★ ▼ ← → ↑ ↓ ↔ º · … « » ×). Un punto mide `tamaño/9` y se redondea a píxeles de pantalla (nítido); por
  debajo de 1,5 px de pantalla no se redondea para no cambiar el tamaño. Carácter desconocido = cuadro hueco:
  si un texto nuevo usa un símbolo raro, añadirlo a `GLYPHS`.
- **`text()` de `core/draw.ts` ya dibuja con esa fuente**: de la cadena `font` solo cuenta el tamaño en px
  (`"bold 8px Arial"` y `"8px"` dan lo mismo). **No usar `ctx.fillText`/`measureText`** en los HUD: usar `text`,
  `textWidth` y `fitText` (recorta con "…"). Las texturas 3D (`ruleta/textures.ts`, la caja "?" de Karts) siguen
  con `fillText` a propósito.
- Adornos en `core/draw.ts`: `shadowText` (sombra dura de un punto), `titleText` (rótulo grueso con relieve,
  sombra y brillo arriba; para cuentas atrás, carteles y títulos; mide con `titleWidth`/`fitTitle`), `panel`
  (caja de esquinas recortadas, borde de color, sombra dura; `u` = grosor, 2 en Bomberman), `badge` (chapa
  cuadrada con el número del jugador; sustituye a los círculos con número) y `segmentBar` (barra por segmentos
  para vida o carga).
- **Efecto CRT** (`core/crt.ts`): líneas de barrido (solo con `pixelScale ≥ 2,5`) y bordes oscurecidos, encima
  del juego en `main.ts`. Ajuste `arcade.crt` (por defecto sí) y botón "Efecto CRT" del menú; en la web va a
  localStorage `arcade.crt`. Mensaje de la webview: `setCrt`.
- **Menú** (`ui/menu.ts`): monoespaciada en mayúsculas, esquinas rectas, sombras duras, neón (rosa `#ff3d8b`,
  cian `#3df2ff`), código y nombre en verde fósforo, color de acento por juego en el selector. La CSP de la
  webview no deja cargar fuentes: el logo "ARCADE" se dibuja con `titleText` en un canvas y va como `<img>` (data URL).
- Convenciones: paneles de resultados con borde rosa; el pie ("R: otra ronda...") alterna de tono como un "PULSA
  START"; el panel de quien tiene el turno (Ruleta) parpadea en amarillo; marcas de minimapa cuadradas.

## 7. Trampas conocidas (ya nos pasaron)

- **PowerShell 5.1 + tildes**: `Get-Content`/`Set-Content` sin codificación rompen UTF-8 (`pestaÃ±a`).
  Editar con el editor o con Node (`fs` en utf8); nunca reescribir fuentes con cmdlets de PowerShell.
- **`onkeydown = () => cond && f()`** devuelve `false` y cancela la tecla: usar `addEventListener` sin devolver nada.
- **Vercel + ESM**: `package.json` tiene `"type": "module"`; las importaciones relativas en `api/` llevan
  `.js` (`../src/server/signal.js`). La extensión se compila a `dist/extension.cjs` por eso.
- **Vercel no mantiene WebSockets**: el relé es HTTP con Redis; no intentar sockets en funciones.
- `tsc` debe ejecutarse desde la raíz del proyecto (`npm run typecheck`) y tras `npm install`; si no
  hay `node_modules`, `npx tsc` instala un paquete `tsc` equivocado.
- npm reciente avisa de que el `postinstall` de esbuild no está en `allowScripts`: se puede ignorar,
  esbuild funciona igual con su binario de plataforma.
- El README se quedó desfasado una vez (solo hablaba de Bomberman y Karts, decía 5 vueltas y un comando
  que ya no existía). Al cambiar juegos, controles, ajustes o comandos, actualizar también el README.
- Teclado en `Keyboard` ignora eventos cuando se escribe en inputs (`isTyping`).
- Si hace falta un reemplazo masivo desde PowerShell, usar .NET con UTF-8 sin BOM
  (`[IO.File]::ReadAllText(f, [Text.Encoding]::UTF8)` / `WriteAllText(f, t, (New-Object Text.UTF8Encoding $false))`).
- **WebGL**: los navegadores limitan los contextos activos; por eso hay **un solo** `WebGLRenderer` en
  `core/three.ts` para todos los juegos 3D. No crear otro. Al cambiar de circuito (Karts) la escena vieja se
  libera con `disposeScene` (si no, se acumulan geometrías y texturas de 1536² en la GPU).
- Los juegos 3D no crean nada de WebGL ni tocan el DOM al importarse ni en el constructor (todo se construye en
  el primer `draw`): así las simulaciones en Node pueden importar `game.ts` sin navegador.
- Edge sin ventana escribe la captura al cerrar: lanzarlo con `Start-Process -Wait` (si no, el PNG aún no existe
  al leerlo). Para simulaciones largas dentro de la página, subir `--virtual-time-budget` (p. ej. 300000).
- esbuild desde la carpeta temporal: las importaciones relativas largas fallan; usar rutas absolutas
  (`import ... from "C:/Users/.../ArcadeCode/src/game/..."`).

## 8. Cómo se ha probado (reutilizable)

- Lógica en Node: empaquetar con esbuild (`--platform=node`) y simular (carreras solo IA, 400
  circuitos, mapas de Bomberman, física de derrape).
- Render y red en Edge sin ventana controlado por CDP (`--remote-debugging-port`): capturas, tecleo,
  y prueba de extremo a extremo con anfitrión + invitado directo + invitado "bloqueado" (se quitan las
  líneas `a=candidate` del SDP para forzar el relé) contra `npm run serve`.
- Capturas de escenas fijas: una página que importa el render y dibuja estados inventados, capturada con
  `msedge --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --virtual-time-budget=8000
  --screenshot=...` (sin los flags de SwiftShader no hay WebGL sin ventana).
- Antes de entregar: `npm run typecheck`, `npm run build`, `npm run build:web` y reempaquetar el `.vsix`.

### Recetas de las pruebas de los juegos 3D (los scripts no se guardan en el repo: rehacerlos así)

Todos van en la carpeta temporal, se empaquetan con `npx esbuild x.ts --bundle` (`--platform=node --format=esm`
para Node, `--format=iife` para la página) e importan el código del juego con rutas absolutas. La página es un
HTML con `<div id="grid">` y el `.js`; cada escena se dibuja en un lienzo de `tamaño lógico × 2` con
`ctx.setTransform(2, 0, 0, 2, 0, 0)` y `draw(ctx, 2)`, y se copia a un `<canvas>` del grid con un título.

- **Ruleta, escenas fijas**: crear `RuletaSnap` a mano (fase, turno, `ev`/`et` del disparo u objeto, objetos,
  vidas, `dl` del crupier) y llamar 3 veces a `renderer.update(10); renderer.draw(...)` para que la cámara llegue
  a su sitio. Escenas útiles: mi turno con la escopeta o un objeto seleccionado, el crupier me apunta
  (`ev=[n,1,1,0,-1,1,0]`, `et≈0.9`), disparo real contra mí (`ev[4]=1`, `et≈1.09`), me apunto a mí mismo, apunto
  al crupier, eligiendo objetivo, 4 jugadores enseñando la carga, uno fuera, intro de ronda, usando la lupa.
- **Ruleta, lógica**: `new Match(["ai","ai",...])` y `update(1/30)` hasta `PH_OVER` (300 partidas por tamaño),
  comprobando vidas en rango, que ninguna se atasca y que se usan los 9 objetos (la adrenalina se cuenta con
  `ev[6] === 1`).
- **Red de cualquier juego**: anfitrión (`XHost` con 1 remoto) + invitado (`XGuest(1, ...)`) con teclados falsos
  que pulsan al azar (`{ anyDown(codes) }`); cada frame `guest.onSnap(JSON.parse(JSON.stringify(host.frame().snap)))`
  y `host.onMessage(1, JSON(guest.outgoing(...)))` (por relé, 1 de cada 3 frames), comprobando que la partida
  termina y que ningún mensaje pasa de 300 caracteres. En Node hay que sustituir `performance.now` por un reloj
  propio que avance con la simulación.
- **Sumo**: `new BallsHost(idle, 0, "local", true)` con una entrada quieta (`{ poll(){}, dx: 0, dy: 0,
  takeDash: () => false }`); simular y dibujar solo los últimos segundos antes de cada captura (el render
  necesita frames seguidos para que caigan las baldosas). Momentos: cuenta atrás, mitad de ronda, 44 s
  (plataforma encogida) y una bola en `state === 1` (cayendo).
- **Karts**: piloto automático como `DriveSource` que apunta al punto `seg + 9` de la línea central
  (`steer = clamp(diferencia de ángulo × 3)`, `throttle = 1`, `drift` opcional en las curvas). Para elegir tema,
  buscar una semilla con `generateTrack(seed).theme.name` y poner `host.race = new Race(seed, ["local"], pilot,
  true)`. Capturas: salida, 9 s y derrapando a los 15 s, en Pradera, Desierto y Nieve.
- **Relieve de Karts**: `terrainOf` en 50 circuitos midiendo tiempo, pendiente a lo largo de la pista
  (`heightAt` cada 3 puntos) y lateral (bordes del asfalto).
- **HUD de todos los juegos** (para cambios de interfaz): una página con `?g=karts|balls|stick|ruleta|bomber|menu|
  picker` que crea el juego real (`XHost(new XInput(kb), 0, "local", true)` con un `Keyboard` sobre un
  `EventTarget` vacío, o `new Game(PLAYER_CONTROLS.map(...LocalController), 2, semilla, "local")`), avanza
  `update(1/30)` y dibuja con `draw(ctx, 3)` + `drawCrt(ctx, 3)` en varios momentos (cuenta atrás, ¡YA!, en
  partida, resultados; en Bomberman `handleKey("KeyP")` para la pausa). El menú: `new Menu().showMain(...)` o
  `showPicker(...)`. Ventana de Edge de 2340 de ancho para 3 capturas a ×3; el menú, a 520 (Edge sin ventana no
  baja de ~500 de ancho).
- **Derrape**: integrar solo `a` y `ma` con las fórmulas de `stepKart` a `MAX_SPEED` durante 1,5 s, para volante
  cerrando, neutro y abriendo; anotar el cruce máximo y el radio (`v / giro`).

## 9. Estado y pendientes (actualizado el 2026-10-17)

Hecho en las últimas sesiones (todavía **sin commit** y **sin desplegar** en Vercel; el `.vsix` 0.1.3 ya se reempaquetó con todo esto el 2026-10-17):

- MEMORIA.md y README revisados y al día (el README estaba desfasado).
- Juego nuevo **Ruleta de cartuchos** (secciones 6d y 6e): reglas, 9 objetos, crupier, red, 3D de bloques.
- El 3D pasó por tres versiones a petición del usuario: motor propio por software (le pareció "primitivo"),
  Three.js con esferas y curvas (no le convencieron las esferas), vóxeles finos (tampoco) y por fin **cajas
  simples**, que es lo que quiere (regla 6e).
- **Sumo de bolas** pasado de modo 7 a 3D (bolas facetadas, baldosas que caen sin temblar, lava de cubos).
- **Karts** pasado de modo 7 a 3D con **relieve**, y derrape corregido (sección 6).
- `three` añadido en `devDependencies`; `core/three.ts` compartido por los tres juegos 3D.

Pendiente o por decidir:

- Probarlo jugando de verdad (teclado, barra lateral de VS Code, red con dos equipos): hasta ahora se ha
  comprobado con simulaciones y capturas en Edge sin ventana (SwiftShader), no en una gráfica real.
- Rendimiento en equipos flojos: la lava de Sumo mueve ~2.500 cubos por frame y hay sombras en los tres juegos.
  Si va lento: menos celdas de lava (`LAVA_CELL` más grande), sombras de 512 o `MAX_RES` 2 en `core/three.ts`.
- Karts: las cuestas son solo visuales; si se quiere que frenen o aceleren hay que tocar `stepKart` (lo usan
  anfitrión e invitado) y probar bien en red.
- Ruleta: al apuntarte a ti mismo, tu mano queda grande delante de la cámara.
- Ajustar el derrape a gusto del usuario cuando lo pruebe (constantes `DRIFT_*` en `karts/config.ts`).
- Monigotes y Bomberman siguen en 2D; si se pasan a 3D, seguir la regla de bloques (6e) y usar `core/three.ts`.
