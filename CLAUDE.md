# CLAUDE.md — Quiniela Mundial 2026

@AGENTS.md

> **Next.js 16 — OJO:** esta versión tiene breaking changes respecto a versiones
> anteriores (APIs, convenciones, estructura de archivos). Antes de escribir código,
> consultar los docs locales en `node_modules/next/dist/docs/` y respetar los avisos
> de deprecación. No asumir patrones de Next.js de memoria.

Contexto permanente del proyecto para asistencia con Claude Code.

## Qué es

Quiniela (predicción de resultados) del Mundial 2026, para competir en grupos
privados de amigos. Proyecto de TreeCore Dev. Se desplegará en `treecoredev.com/quiniela`
(proyecto Next.js aparte, conectado luego vía subdominio o reverse proxy).

## Stack

- **Next.js** (App Router, TypeScript, Tailwind, `src/`)
- **Supabase** — Postgres + Auth (magic link / passwordless por email)
- **Supabase Realtime** — para empujar resultados en vivo a los clientes
- **API-Football** (plan free) — polling cada 15s para resultados en vivo
- Despliegue previsto en Vercel

## Modelo de datos (ya montado en Supabase)

Capa global del Mundial (compartida por todos, la maneja la API + super admin):
- `groups` (12), `teams` (48), `players` (convocados), `matches` (104), `standings`

Capa privada por campeonato (la maneja el creador del campeonato):
- `championships` — nombre, `invite_code`, `created_by`, `registration_open`,
  `display_timezone`, flags de módulos (`mod_group_standings`, `mod_podium`,
  `mod_golden_boot`, `mod_mvp`), `group_predictions_locked_at`,
  `knockout_predictions_locked_at`
- `championship_users` — quién juega + `display_name` (nombre POR campeonato),
  `group_points`, `knockout_points`

Pronósticos (puente entre ambas capas):
- `predictions` — por `(championship_id, user_id, match_id)`, `score1/score2` nullable
- `group_predictions` — clasificados y orden por grupo
- `special_predictions` — oro/plata/bronce, bota de oro, MVP

## Reglas de negocio clave

### Roles
- **Super admin (yo)**: UUID hardcodeado en `.env` (`SUPER_ADMIN_ID`), verificado
  SIEMPRE del lado servidor. Tiene una consola en una URL oculta (no enlazada).
  Puede corregir resultados, resolver cruces, cargar jugadores, intervenir en
  cualquier campeonato. Entro como usuario normal con mi email; los privilegios
  extra se reconocen por UUID en el servidor.
- **Creador de campeonato**: admin de SU campeonato. Edita nombre, regenera/revoca
  invite_code, expulsa participantes, abre/cierra inscripción. NO toca resultados
  ni reglas (son globales y fijas).

### Módulos de pronóstico (configurables por campeonato)
El creador elige qué se pronostica, con checkboxes sueltos. Se agrupan por CIERRE:

**Bloque "cierre único"** — todo cierra ANTES del inicio del Mundial (11 jun 2026).
Se entrega completo de una. Cada uno es opcional (flag en `championships`):
- `mod_group_standings` — clasificación final por grupo: las 4 POSICIONES en orden
  (1ro, 2do, 3ro, 4to). Tabla group_predictions: first/second/third/fourth_place.
- `mod_podium` — oro / plata / bronce
- `mod_golden_boot` — bota de oro (jugador)
- `mod_mvp` — MVP (jugador)

**Bloque "diarios"** — resultados de partidos. Cada partido cierra a las 00:00 ET
de su día. Son DOS módulos separados:
- **Resultados fase de grupos** — SIEMPRE activo (base, no configurable).
- **Resultados fase eliminatoria** (`mod_knockout_matches`) — OPCIONAL. Activable
  mientras queden partidos de eliminatoria sin cerrar.
- La fase de cada partido se distingue por `matches.phase` ('group' / 'knockout').

Nota: el creador puede mandar invitaciones en momentos distintos (p. ej. el bloque
de cierre único primero, antes del torneo).

### Pronósticos
- El pronóstico pertenece al usuario, atado a un campeonato.
- REUTILIZABLE POR COPIA: al entrar a un campeonato nuevo, el usuario puede copiar
  los marcadores de otra de sus hojas (completa o incompleta). La copia es
  independiente — editar en uno NO afecta al otro. Se renombra con el nuevo campeonato.
- El nombre de hoja = nombre del usuario + nombre del campeonato. Unicidad real en
  BD: `unique(user_id, championship_id)` (vía la tabla predictions).
- Hojas incompletas permitidas (`score1/score2` nullable).
- El `display_name` (nombre visible) es POR campeonato; se captura tras autenticar,
  al unirse. El email nunca se muestra.

### Flujo de unirse a un campeonato
1. Abre link con `?code=abc123` → pantalla genérica pide email.
2. Autentica con código OTP de 6 dígitos (NO magic link — ver abajo).
3. Post-login: "Te uniste a '[nombre campeonato]'" + pone su `display_name` +
   si ya tiene pronósticos en otros campeonatos, se le listan para reutilizar.
4. El creador, al crear el campeonato, se une automáticamente (pone su nombre ahí).

### Autenticación
- Magic link por ENLACE fue descartado (problemas de validación). Se usa
  **código OTP de 6 dígitos** que el usuario escribe (`verifyOtp`, type 'email').
- Email vía Resend (SMTP custom en Supabase), remite `noreply@treecoredev.com`.
- Sesión persistente en el navegador (~30 días de inactividad).

### Fechas de cierre (CONSTANTES GLOBALES del torneo, NO por campeonato)
Tres cierres fijos, iguales para todos los campeonatos. Viven como constantes en
el servidor (no en la BD). Todos a las 00:00 hora de Miami (America/New_York = EDT/UTC-4):
- `CLASSIFICATION_LOCK` = 2026-06-11 00:00 ET — clasificación por grupo (antes del inicio).
- `PODIUM_BOOT_MVP_LOCK` = 2026-06-28 00:00 ET — podio, bota de oro y MVP (inicio Ronda de 32).
- Partidos: cada uno cierra a las 00:00 ET de SU día, derivado de `matches.kickoff_utc`.

Una vez pasado el cierre, ese módulo/partido queda bloqueado para siempre (no reabre).
Las columnas `group_predictions_locked_at` / `knockout_predictions_locked_at` de
`championships` quedaron OBSOLETAS (no usar; se dejan sin tocar para no migrar).

### Activación de módulos en el tiempo
- El creador puede activar/desactivar módulos opcionales DESPUÉS de crear (UPDATE de flags).
- REGLA: no se puede activar un módulo cuyo cierre ya pasó (la lógica lo impide).
  Ej: no activar clasificación por grupo después del 11 jun.

### Bloqueo por partido
- Cada partido se congela a las **00:00 ET (hora de Miami) del día del partido**.
- Se usa `America/New_York` (no UTC-5 fijo): en el Mundial Miami está en EDT = UTC-4.
- El cierre es un instante absoluto único, MOSTRADO a cada usuario en su propia zona.
- `championships.display_timezone` es solo presentación; NO cambia el momento de cierre.
- Una vez bloqueado, NO se vuelve a desbloquear nunca.
- El bloqueo se controla del lado servidor; fuente de verdad: `matches.kickoff_utc`.

### Visibilidad de pronósticos
- Los participantes de un mismo campeonato pueden verse entre sí (para el ranking).
- PERO no se deben mostrar pronósticos ajenos antes de que cierre la ventana
  (anti-copia). Ese filtro temporal va del lado SERVIDOR, no solo en RLS.

### Eliminatorias
- 1ros y 2dos de grupo: la app los asigna AUTOMÁTICAMENTE a la Ronda de 32 al
  terminar la fase de grupos (desde standings).
- Los 8 mejores terceros: los asigno YO manualmente desde la consola super admin
  (la tabla de asignación FIFA es compleja; placeholders tipo `3A/B/C/D/F`).
- Cruces posteriores (W74, etc.): se resuelven al avanzar los equipos.
- En `matches`, los partidos de eliminatoria usan `team1_placeholder`/`team2_placeholder`
  hasta que se resuelven; entonces se llenan `team1_id`/`team2_id`.

### Puntuación (reglas fijas y globales; qué se puntúa depende de los módulos activos)

**⚠️ DOS SISTEMAS DE PUNTOS DISTINTOS — NO MEZCLAR:**
- **Puntos de FÚTBOL** (realidad, tabla `standings`): reglas FIFA. Victoria=3,
  empate=1, derrota=0, más PJ/G/E/P/GF/GA/GD. Determinan las tablas de grupo reales
  (quién clasifica). Salen del resultado real de cada partido.
- **Puntos de QUINIELA** (jugadores, `predictions` + `championship_users`): el
  sistema 6/4/3/1 de abajo. Determinan el ranking de los amigos. Salen de comparar
  el pronóstico del usuario contra el resultado real.
  Nunca usar las reglas de uno para el otro.

- La FÓRMULA de quiniela es fija y global (no configurable). Lo que varía por
  campeonato es QUÉ módulos se puntúan (según los flags `mod_*`).

**Puntuación POR PARTIDO — categoría ÚNICA, la más alta que aplique (NO se suman):**
Dado pronóstico (p1,p2) vs resultado real (r1,r2). signo = gana local / empate / gana visitante.
  - 6 pts → exacto: p1==r1 AND p2==r2
  - 4 pts → acierta el signo Y acierta goles de al menos un equipo (p1==r1 OR p2==r2)
  - 3 pts → acierta solo el signo, sin ningún marcador individual correcto
  - 1 pt  → NO acierta el signo, pero acierta goles de al menos un equipo (p1==r1 OR p2==r2)
  - 0 pts → nada
  Ejemplos: 2-0 vs 2-1 → 4 (signo local + goles local). 1-1 vs 1-2 → 1 (goles local, signo fallado).
  "Goles de un equipo" aplica a CUALQUIERA de los dos (local o visitante).
  En knockout usar `goals` (90'/120'), NO los penales, para el marcador.

**Clasificación por grupo (solo si `mod_group_standings`) — categoría única por grupo:**
Se evalúa la posición exacta de cada equipo al terminar la fase de grupos.
  - 5 pts → pleno: las 4 posiciones exactas (3/4 exactos es imposible en ranking completo)
  - 2 pts → 2 posiciones exactas
  - 1 pt  → 1 posición exacta
  - 0 pts → 0 exactas
  Se suma a `championship_users.group_points`.

**Predicciones especiales (solo si cada flag está activo) — cada una independiente (sí se suman):**
  - 7 pts → campeón (oro) acertado       (`mod_podium`)
  - 5 pts → subcampeón (plata) acertado  (`mod_podium`)
  - 3 pts → tercer lugar (bronce) acertado (`mod_podium`)
  - 6 pts → bota de oro acertada          (`mod_golden_boot`)
  - 6 pts → MVP acertado                  (`mod_mvp`)
  Máximo 27 pts. Se suma a `championship_users.knockout_points`.

- `championship_users` lleva `group_points` y `knockout_points`; el total es la suma.
  `group_points`   = puntos de partidos de grupo + group_predictions.
  `knockout_points` = puntos de partidos de eliminatoria + special_predictions.

### Motor de puntuación — flujo de cascada
DISEÑO CLAVE: el motor se construye y valida con resultados introducidos MANUALMENTE
por el super admin. La API (más adelante) solo reemplaza la FUENTE: escribe en
`matches` igual que el admin, y dispara la misma cascada. No acoplar el motor a la API.
Al guardar/actualizar el resultado de un partido (score1, score2):
  1. Actualiza matches (score1, score2, status='finished', penales si aplica).
  2. Recalcula standings del grupo afectado (PJ, G, E, P, GF, GA, GD, Pts).
  3. Recalcula points_earned de cada prediction de ese partido (algoritmo de arriba).
  4. Recalcula group_points / knockout_points de cada championship_user afectado.
Idempotente: re-guardar un resultado corregido debe recomputar, no acumular.

## Resultados en vivo
- Polling 1 sola vez desde el servidor (NO por usuario) → actualiza Supabase →
  Realtime empuja a todos. Escala a miles de usuarios con 1 llamada cada 15s.
- API-Football devuelve `goals` y `penalty` por separado.

## Seguridad
- `SUPER_ADMIN_ID` y todas las keys sensibles en `.env` (nunca en el repo).
- Service role key SOLO del lado servidor.
- RLS activado en todas las tablas de usuario.
- Código OTP con permiso explícito; nunca crear cuentas por el usuario.

## Identidad visual (IMPORTANTE)

- La interfaz de usuario YA ESTÁ CREADA (diseñada en Claude Design). Es la fuente
  de verdad del diseño.
- Cualquier componente, página o elemento NUEVO debe MANTENER esa identidad visual:
  mismos colores, tipografía, espaciados, estilo de botones, tarjetas, bordes y
  patrones de interacción que ya existen.
- NO introducir un look-and-feel distinto, ni librerías de UI nuevas, ni rediseñar
  lo que ya está. Reutilizar los componentes y tokens de estilo existentes.
- Ante la duda sobre cómo estilizar algo nuevo, imitar el componente existente más
  parecido en lugar de inventar.
- Mobile-first y responsive, consistente con lo ya diseñado.

## Estado actual
- [x] Base de datos montada en Supabase (schema completo + datos cargados)
- [x] Migraciones aplicadas (kickoff_utc, display_timezone, flags de módulos)
- [x] Proyecto Next.js 16 inicializado
- [x] Cliente Supabase (@supabase/ssr) + proxy.ts
- [x] Autenticación funcional (código OTP de 6 dígitos vía Resend)
- [ ] Crear / unirse a campeonato (invite code, display_name, módulos)
- [ ] UI de la quiniela (pronósticos)
- [ ] Lógica de bloqueo por partido (00:00 ET) y de cierre único (pre-Mundial)
- [ ] Reutilización de pronósticos por copia
- [ ] Lógica de puntuación (respetando módulos activos)
- [ ] Ranking en tiempo real
- [ ] Polling + Realtime de resultados
- [ ] Consola super admin (resolver terceros/cruces, corregir, cargar jugadores)
- [ ] Despliegue en /quiniela
