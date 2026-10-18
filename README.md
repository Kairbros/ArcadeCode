# Arcade: Bomberman, Karts, Sumo de bolas, Monigotes y Ruleta de cartuchos

Hub de juegos multijugador en TypeScript + Canvas. Se juega en el navegador o dentro de VS Code
(vista "Arcade" del Explorador). Quien crea la sala elige el juego y, al acabar la ronda, puede
cambiar a otro sin cerrar la sala (tecla **J**).

- **Bomberman**: mapas procedurales, cajas con 3 buffs (velocidad, rango, bombas) y enemigos.
  Local 1–2 jugadores en un teclado o en red hasta 4.
- **Karts**: carreras en 3D de bloques con relieve (cuestas, colinas, montañas al fondo),
  circuitos procedurales, 3 vueltas, derrape con miniturbo y objetos (turbo, plátano, proyectil).
  En red cada jugador conduce su kart en su pantalla (sin retraso) y el anfitrión arbitra objetos,
  golpes y posiciones.
- **Sumo de bolas**: empuja a los rivales fuera de una plataforma circular sobre lava, que encoge a
  partir de los 20 s. Gana el último en pie (ronda de 60 s); las victorias se acumulan entre rondas.
- **Monigotes**: peleas de monigotes en plataformas (3 escenarios). Armas en cajas: espada, pistola
  y bomba. Cuanta menos vida, más lejos sales despedido. Gana el último en pie (ronda de 90 s).
- **Ruleta de cartuchos**: en 3D de bloques y en primera persona, sentado a una mesa bajo una lámpara
  frente a un crupier. Por turnos, con una escopeta cargada con cartuchos reales y de fogueo en orden
  desconocido (al empezar cada carga solo se sabe cuántos hay de cada). Dispárate a ti mismo con uno
  de fogueo y repites turno. 3 rondas (2, 4 y 5 vidas) y 9 objetos: lupa, cigarrillos, cerveza,
  sierra, esposas, teléfono, inversor, medicina caducada y adrenalina. En la última ronda, con
  2 vidas o menos, no hay curas.

En Karts, Sumo y Monigotes los huecos libres hasta 4 los ocupan **bots** (se pueden desactivar desde
el menú; sin bots, en solitario es contrarreloj o aguantar). En Ruleta de cartuchos los bots sientan
al **crupier** (en solitario está siempre). En red vale el ajuste del anfitrión.

Escala de grises: botón del menú o tecla **G** (en gris, cada jugador lleva su número encima).
El nombre del jugador (máx. 12 caracteres) se elige en el menú.

## Controles

En todos los juegos valen **WASD o flechas** y **Espacio o Enter** como botón de acción
(en red cada jugador puede usar cualquiera de los dos).

| Juego | Moverse | Acción | Otras |
|---|---|---|---|
| Bomberman | WASD / flechas | Bomba: Espacio / Enter | R nuevo mapa · T repetir mapa · P pausa · 1/2 jugadores (solo local) |
| Karts | ↑ acelerar · ↓ frenar · ← → girar | Objeto: Espacio / Enter / E | Derrape: Shift / C / K · R nueva carrera |
| Sumo de bolas | WASD / flechas | Embestida: Espacio / Enter / Shift / E | R nueva ronda |
| Monigotes | ← → mover · ↑ saltar (doble) · ↓ bajar de plataforma | Golpe/arma: Espacio / Enter / E / K | R nueva ronda |
| Ruleta de cartuchos | ← → elegir escopeta/objeto y objetivo | Usar/disparar: Espacio / Enter / E | ↓ / Retroceso volver · R nueva partida |

Comunes: **G** escala de grises · **J** cambiar de juego (con la ronda terminada) · **Esc** volver al
menú. En local, Bomberman usa WASD + Espacio para J1 y flechas + Enter para J2. En red, las teclas de
partida (R, T, P, J) son solo del anfitrión.

## Cómo funciona el modo en red

- **Anfitrión**: crea la sala, ejecuta la simulación y envía el estado.
- **Invitados**: envían su entrada y dibujan el estado que reciben.
- Cada invitado intenta primero **conexión directa (WebRTC)**. Si en 7 s no conecta (redes
  corporativas que bloquean el tráfico entre equipos), pasa solo al **relé por Vercel**: estado y
  entradas viajan por HTTPS a `/api/signal`, 10 veces/s, guardados unos segundos en Upstash Redis.
  En una misma partida puede haber invitados directos y por relé. Abajo a la derecha se ve cuál se usa.
- `/api/signal` también empareja (código de sala de 4 letras). El anfitrión recibe una clave
  secreta al crear la sala: sin ella nadie puede leer ofertas ni publicar estado en su sala.
  En local guarda en memoria; en Vercel usa Upstash Redis.

### Coste del relé

Cada participante por relé hace ~10 peticiones/s (anfitrión incluido si tiene algún invitado por
relé): con 4 jugadores, del orden de 100.000–150.000 invocaciones de función y operaciones de Redis
por hora de juego. Revisa los límites de tu plan de Vercel y de Upstash. El plan Hobby de Vercel es
solo para uso no comercial. Ajustable en `src/game/net/relay.ts` (`RELAY_HZ`).

## Jugar en tu red sin Vercel

```
npm install
npm run serve            # puerto 8000; otro: npm run serve -- 3000
```

La consola muestra la URL de tu red (p. ej. `http://10.10.103.18:8000`). Cada jugador la abre en su
navegador. Uno pulsa **Crear sala**; los demás escriben el código y pulsan **Unirse**.

Si los equipos no conectan, revisa que el firewall de Windows permita Node en redes privadas.

## Desplegar en Vercel

1. Crea una cuenta en <https://vercel.com> (puedes entrar con GitHub).
2. Sube esta carpeta a un repositorio de GitHub e impórtalo en Vercel (**Add New → Project**).
   Alternativa sin GitHub: `npx vercel --prod` desde esta carpeta.
   La configuración ya está en `vercel.json`; no hay que tocar nada en el asistente.
3. En el proyecto de Vercel: **Storage → Create Database → Upstash (Redis)** y conéctala al proyecto.
   Esto añade `KV_REST_API_URL` y `KV_REST_API_TOKEN`, que la API detecta sola.
   Sin base de datos el emparejamiento no es fiable (cada petición puede ir a otra instancia).
4. Vuelve a desplegar (**Deployments → Redeploy**) para que tome las variables.
5. Abre `https://TU-PROYECTO.vercel.app`.

La función está fijada a la región `sfo1` en `vercel.json` para estar junto a Redis (us-west-1):
si tu Redis está en otra región, cambia `regions`.

## Extensión de VS Code

- Desarrollo: `npm install`, `npm run build`, abre esta carpeta en VS Code y pulsa **F5**. En la
  ventana nueva aparece la vista **Arcade** en el Explorador; el botón de su barra (o el comando
  **Arcade: Abrir en pestaña grande**) abre el juego en una pestaña del editor.
- Empaquetar e instalar:

  ```
  npm run build
  npx @vscode/vsce package --allow-missing-repository --skip-license --baseContentUrl https://github.com/Kairbros/ArcadeCode/blob/main --baseImagesUrl https://github.com/Kairbros/ArcadeCode/raw/main --out arcade.vsix
  code --install-extension arcade.vsix --force    # luego "Developer: Reload Window"
  ```

- Ajustes (`Arcade` en la configuración de VS Code):

  | Ajuste | Para qué |
  |---|---|
  | `arcade.serverUrl` | URL de emparejamiento: tu despliegue de Vercel o `http://IP-DEL-EQUIPO:8000`. Por defecto, el despliegue público del proyecto. |
  | `arcade.grayscale` | Escala de grises (también con G o desde el menú). |
  | `arcade.bots` | Rellenar con bots en Karts, Sumo y Monigotes; crupier en Ruleta de cartuchos. |
  | `arcade.crt` | Efecto de pantalla de recreativa: líneas de barrido y bordes oscuros (también desde el menú). |
  | `arcade.playerName` | Tu nombre en las partidas (vacío: «Jugador N»). |

## Estructura

```
src/game/main.ts     punto de entrada: menú, partidas locales y en red, escalado del lienzo
src/game/hub.ts      registro de juegos (cómo se crea cada uno en local, anfitrión o invitado)
src/game/core/       compartido: config común, rng, teclado, ajustes, nombres, primitivas de dibujo,
                     fuente de píxeles y efecto CRT
src/game/ui/         menú HTML
src/game/net/        red genérica: host, guest, rtc, relay, signaling, types (HostGame/GuestGame)
src/game/bomberman/  Bomberman: ECS (components, ecs, systems/), mapgen, render/, snapshot, net
src/game/karts/      Karts: track (circuitos), terrain (relieve), physics, race (árbitro + IA), render (3D), input, game
src/game/balls/      Sumo de bolas: arena (física + IA + árbitro), render (3D de bloques), input, game
src/game/stick/      Monigotes: stages, fight (física + armas + bots + árbitro), render, input, game
src/game/ruleta/     Ruleta de cartuchos: match (reglas + árbitro), bot, models y textures (Three.js), render, input, game
src/server/signal.ts emparejamiento y relé (compartido por Vercel y el servidor local)
api/signal.ts        función serverless de Vercel
scripts/serve.mjs    servidor local (juego + API en memoria)
src/extension.ts     extensión de VS Code (webview)
```

Para extender el proyecto (añadir juegos, contrato de red, trampas conocidas) lee [MEMORIA.md](MEMORIA.md).
