# 🎮 Arcade · Minijuegos Multijugador Online

App web de minijuegos para jugar con amigos en tiempo real, **sin necesidad de registrarse**. Un jugador crea una sala y obtiene un código de 4 caracteres; el resto se une con ese código (o con el enlace de invitación) y a jugar.

## ✨ Características

- **Sin login**: tu identidad se guarda localmente en el navegador.
- **Salas con código**: crea una sala, comparte el código `ABCD` o el enlace de invitación.
- **Tiempo real** con WebSockets (Socket.IO): turnos, jugadas y resultados se sincronizan al instante.
- **Juega contra bots 🤖**: rellena la sala con bots para jugar al instante. Hay IA para los 9 juegos (con estrategia básica: ganar/bloquear, captura obligatoria, caza en el tablero, memoria de cartas, etc.).
- **Máximo de jugadores ajustable**: en los juegos que lo permiten, el anfitrión elige cuántos jugadores caben en la sala.
- **Chat en la sala** y **reacciones con emojis** flotantes durante la partida.
- **Marcador de series**: se cuentan las victorias de cada jugador dentro de la sala.
- **Cambia de juego desde el lobby** sin perder la sala (lo decide el anfitrión).
- **Efectos de sonido** (activables/desactivables) generados con WebAudio.
- **Reconexión automática**: si recargas la página vuelves a tu partida.
- **Diseño moderno y responsive**: degradados animados, glassmorphism y animaciones, ideal para móvil y escritorio.
- **Revancha** y **volver al lobby** al terminar.

## 🕹️ Juegos incluidos (9)

| Juego | Jugadores | Descripción |
|-------|-----------|-------------|
| ⭕ Tres en Raya | 2 | El clásico 3 en línea. |
| 🔴 Conecta 4 | 2 | Alinea cuatro fichas dejándolas caer. |
| 🚢 Tocado y Hundido | 2 | Coloca tu flota en secreto y hunde la del rival por turnos. |
| ⚪ Damas | 2 | Reglas inglesas: captura obligatoria, multi-salto y coronación de damas. |
| ⬛ Timbiriche (Dots & Boxes) | 2–4 | Traza líneas y cierra cajas para conquistar el tablero. |
| 🧠 Memoria | 2–4 | Encuentra todas las parejas; gana quien más consiga. |
| 🔤 Ahorcado | 2–6 | Adivinad la palabra por turnos antes de quedaros sin intentos. |
| ❓ Trivia | 2–8 | Preguntas de cultura general con puntos por acierto y rapidez. |
| ✊ Piedra, Papel o Tijera | 2 | Al mejor de 5 rondas, eligiendo a la vez. |

## 🚀 Cómo ejecutar

Requisitos: **Node.js 18+** (probado con Node 24).

```bash
npm install
npm start
```

Abre **http://localhost:3000** en tu navegador. Para jugar con otra persona en tu misma red, comparte tu IP local (p. ej. `http://192.168.1.50:3000`).

## 🌐 Jugar con amigos desde fuera (Render, gratis)

Una sola vez subes la app; luego solo compartís el enlace y el **código de sala**.

### 1. Sube el código a GitHub

Si aún no lo has hecho:

```bash
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

### 2. Crea el servicio en Render

1. Entra en [render.com](https://render.com) e inicia sesión con GitHub.
2. **New +** → **Web Service**.
3. Conecta tu repositorio.
4. Configuración:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
5. Pulsa **Create Web Service** y espera el deploy (~2–5 min).

> También puedes usar **New + → Blueprint** si Render detecta el archivo `render.yaml` del repo.

### 3. Comparte el enlace con tus amigos

Te dará una URL fija, por ejemplo:

`https://arcade-minijuegos.onrender.com`

Guárdala en el móvil o en un grupo de WhatsApp. **No hace falta que nadie más la conozca** si no la compartís.

### 4. A jugar (solo código)

1. Todos abren **la misma URL**.
2. Uno elige juego → se crea la sala → aparece el código (ej. `ABCD`).
3. Los demás pulsan **Unirme con un código** e introducen ese código.

### Notas del plan gratis

- Si nadie entra un rato, el servidor se “duerme”; la **primera carga puede tardar ~30 s**.
- La URL es pública técnicamente, pero **solo entra quien tenga el enlace** (no aparece en buscadores).
- No necesitas Tailscale, ngrok ni dejar tu PC encendido.

Modo desarrollo (recarga al guardar):

```bash
npm run dev
```

El puerto se puede cambiar con la variable de entorno `PORT`.

## 🧩 Cómo se juega

1. Elige un juego en la pantalla principal.
2. Escribe tu nombre y pulsa **Crear sala**.
3. Comparte el **código** (o el enlace) con tus amigos.
4. Cuando estén todos, el anfitrión pulsa **Empezar partida**.

## 🏗️ Arquitectura

```
server/
  index.js          # Servidor Express + Socket.IO (salas, eventos, difusión)
  rooms.js          # Gestión de salas, códigos y jugadores
  games/            # Motor de cada juego (lógica pura, validada en servidor)
    index.js, ticTacToe.js, connect4.js, battleship.js, checkers.js,
    dots.js, memory.js, hangman.js, trivia.js, rps.js
    data/           # Bancos de palabras (Ahorcado) y preguntas (Trivia)
public/
  index.html        # Estructura de la app (una sola página)
  css/styles.css    # Estilos, animaciones y responsive
  js/
    app.js          # Lógica de cliente: sockets, pantallas, lobby, toasts
    games/          # Renderizadores de cada juego en el cliente
```

Toda la lógica de juego (turnos, validaciones, condiciones de victoria) vive y se valida en el **servidor**, por lo que los clientes no pueden hacer trampas. Cada juego implementa una interfaz común: `init(players)`, `action(state, playerId, action)` y `view(state, playerId)` (esta última oculta información secreta, como los barcos del rival).

## ➕ Añadir un juego nuevo

1. Crea `server/games/miJuego.js` exportando `meta`, `init`, `action` y opcionalmente `view`.
2. Regístralo en `server/games/index.js`.
3. Crea `public/js/games/miJuego.js` con la función de render y añádelo a `public/js/games/registry.js` con la misma `id`.

## 📄 Licencia

MIT.
