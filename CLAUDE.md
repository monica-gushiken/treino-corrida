# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

`treino-corrida` is a zero-dependency running interval trainer app in Brazilian Portuguese. Open `index.html` directly in a browser — there is no build step, no package manager, no test suite.

## File structure

| File | Contents |
|---|---|
| [index.html](index.html) | HTML structure only |
| [style.css](style.css) | All styles, including landscape media query |
| [app.js](app.js) | All application logic |

## Screens

Four `<div class="screen">` elements toggled via `showScreen(id)`:
- `listScreen` — list of saved workouts
- `configScreen` — create/edit a workout
- `workoutScreen` — active timer
- `doneScreen` — summary after completion

## Data model

Stored in `localStorage` under key `workouts2`:
```js
{
  id, name,
  warmup, warmupPace,       // caminhada: 'leve' | 'moderada'
  reps,
  blocks: [{ type, mins, pace }],
  cooldown, cooldownPace
}
```

Block types and their valid paces:
| `type` | `pace` values |
|---|---|
| `walk` | `'leve'`, `'moderada'` |
| `trote` | — (sem ritmo, campo omitido) |
| `run` | `'leve'`, `'moderada'`, `'forte'`, `'muito forte'` |
| `progressivo` | `'leve→moderada'`, `'moderada→forte'`, `'forte→muito forte'` |

Constants in `app.js`: `PACES`, `TYPE_LABEL`, `TYPE_CLASS`, `PHASE_NAME`, `defaultPace(type)`.

## Workout engine

`buildPhases(w)` expands a workout into a flat array of timed phases (warmup → reps × blocks → cooldown). Each phase: `{ name, type, pace, secs, rep? }`.

`enterPhase(idx)` sets up the UI for the current phase and starts a 1 Hz `setInterval`.

`tick()` calculates `timeLeft` from wall-clock time (`Date.now() - workoutStartTime - workoutPausedMs`), not by decrementing a counter. This makes the timer resilient to screen lock — if the browser was suspended, the next tick jumps to the correct phase automatically.

Pause/resume tracked with `workoutPausedMs` (accumulated paused milliseconds).

## Wake Lock

`acquireWakeLock()` / `releaseWakeLock()` wrap the Screen Wake Lock API to keep the screen on during a workout. Called in `startWorkout` and `stopWorkout`/`showDone`. A `visibilitychange` listener re-acquires the lock if the user returns to the tab. Fails silently on unsupported browsers.

## Swipe to edit/delete

Cards in the list screen support left-swipe to reveal **Editar** and **Excluir** buttons. Implemented in `initSwipe()` with native touch events. `swipeOpenCard` tracks the currently open card; `closeSwipe()` resets it. `cardClick(id, el)` starts the workout or closes the swipe depending on state.

## Audio

Web Audio API beeps in `playBeep(type)`: `'start'`, `'warning'` (last 5 s of a phase), `'phase'` (transition), `'done'`.

## Drag-and-drop (block editor)

Native HTML drag events on `.block-item` elements; `dragSrcIdx` holds the source index.

## Layout

- Optimised for mobile portrait. In landscape (`@media (orientation:landscape) and (max-height:600px)`), `#workoutScreen` becomes `position:fixed; inset:0` to fill the full viewport, split into two columns via `.workout-left` (timer) and `.workout-right` (controls). In portrait those wrappers use `display:contents` and are invisible to layout.
- Icons: [Tabler Icons](https://tabler.io/icons) via CDN (`ti ti-*`).
- Colour coding: orange `#ff7030` = run/action; blue `#7bc4ff` = walk; amber `#ffb840` = trote; purple `#c084fc` = progressivo.
- `showAlert(msg)` flashes a banner for 2.2 s (fixed-positioned in landscape).
- All user-visible text is Brazilian Portuguese.

## Key globals

| Variable | Purpose |
|---|---|
| `workouts` | In-memory array, synced to localStorage |
| `currentBlocks` | Mutable blocks array for the config form |
| `phases` | Flat phase list for the active workout |
| `phaseIdx`, `timeLeft` | Current phase index and remaining seconds |
| `elapsed` | Seconds completed before the current phase (set when entering a phase) |
| `workoutStartTime`, `workoutPausedMs` | Wall-clock anchor for the timer |
| `editingId` | `null` for new workout, workout id when editing |
| `swipeOpenCard` | DOM reference to the currently swiped-open card, or `null` |
| `wakeLock` | WakeLockSentinel, or `null` |
