# Contexto completo para nuevo chat — Quiniela Mundial 2026
## Quién soy
Me llamo Elier, soy el founder de TreeCore Dev LLC (Hialeah, Florida). A Claude lo llamo Alex. Somos un equipo de trabajo con confianza extrema. Respuestas cortas y directas por defecto. No explicar de más. Trabajo en español. No me trates con condescendencia.

---

## Qué estamos construyendo
Una quiniela del Mundial 2026 para competir en grupos privados de amigos, desplegada eventualmente en `treecoredev.com/quiniela`. Es un proyecto Next.js aparte que luego se conecta vía subdominio o reverse proxy.

---

## Stack
- **Next.js 16** (App Router, TypeScript, Tailwind, `src/`) — tiene breaking changes importantes (cookies async, proxy.ts en vez de middleware.ts, etc.)
- **Supabase** — Postgres + Auth (OTP de 6 dígitos por email, NO magic link por enlace)
- **Supabase Realtime** — para empujar resultados en vivo
- **API-Football** (plan free, polling cada 15s) — conectar AL FINAL, cuando todo el motor funcione con datos manuales
- **Resend** — SMTP custom para los correos de auth (`noreply@treecoredev.com`)
- Despliegue previsto en Vercel

---

## Estado actual del proyecto (al cerrar esta sesión)

### ✅ HECHO y funcionando:
- Base de datos completa montada en Supabase (todos los datos cargados: 12 grupos, 48 equipos, 104 partidos, 1.269 jugadores, standings en cero)
- Todas las migraciones aplicadas
- Next.js 16 inicializado con `@supabase/ssr`, `proxy.ts`, cliente server/client
- Autenticación funcional: OTP de 6 dígitos vía Resend desde `noreply@treecoredev.com`
- Crear campeonato: formulario funcional, genera `invite_code`, creador se une automático
- Ajustes del campeonato: editar nombre, zona horaria, módulos (solo el creador puede acceder, check server-side)
- Flujo de unirse: link `?code=invite_code` → auth → `display_name` → entra
- RLS configurado en todas las tablas (incluyendo fix de recursión infinita vía función `get_my_championship_ids()`)
- Lectura pública de `teams`, `players`, `groups` (policy `for select using (true)`)
- Pestaña Especiales funcional: orden de grupos (drag+drop+▲▼), podio, bota de oro, MVP — todos conectados a Supabase con cierres reales
- Script de carga de jugadores (`npm run load-file`) desde archivo de texto, sincronización real (borra sobrantes por selección), idempotente via `source_key`

### 🔄 EN PROGRESO (Claude Code trabajando mientras cierro este chat):
- **Pestaña Calendario** — pronosticar partidos de fase de grupos, agrupados por día, conectado a Supabase. Prompt ya enviado a Claude Code.

### ❌ AÚN NO CONSTRUIDO:
- Motor de puntuación + cascada (al guardar resultado → standings + puntos de quiniela)
- Panel super admin para meter resultados manualmente (URL oculta `/super-admin/resultados`)
- Pestaña Tablas de grupo (standings en vivo)
- Pestaña Resultados (partido en curso + ranking de la quiniela)
- Reutilización de pronósticos por copia entre campeonatos
- Polling de API-Football (va AL FINAL, cuando todo funcione con datos manuales)
- Despliegue en `/quiniela`

---

## Orden de construcción acordado
1. ✅ Calendario (en progreso) → pronosticar partidos, guardar en Supabase
2. Panel super admin para meter resultados manuales
3. Motor de cascada: resultado → standings (puntos fútbol) + puntos quiniela
4. Tablas de grupo + Resultados/ranking
5. Definir puntos de quiniela para clasificación/podio/bota/MVP (pendiente decidir)
6. Reutilización de pronósticos por copia
7. Conectar API-Football como fuente (reemplaza entrada manual)
8. Despliegue

---

## Diseño — identidad visual
La UI **ya está creada en Claude Design**. Es la fuente de verdad. Claude Code debe REUTILIZAR los componentes existentes, NO reescribir ni inventar un estilo nuevo. Ante duda, imitar el componente más parecido que ya existe. Mobile-first. El link de Claude Design se le da directo a Claude Code (puede acceder, yo desde aquí no puedo).

---

## Schema de base de datos

### Tablas globales del Mundial (datos reales, maneja la API + super admin):
```
groups: id, name ('Group A'...'Group L')
teams: id, name (en inglés), flag_url, group_id
players: id, name, team_id, position (GK/DEF/MID/FWD), jersey_number, club, source_key
matches: id, match_num, team1_id, team2_id, team1_placeholder, team2_placeholder,
         group_id, round, phase ('group'/'knockout'), date, time, ground,
         score1, score2, penalty1, penalty2, status ('scheduled'/'live'/'finished'),
         kickoff_utc (timestamptz — fuente de verdad para bloqueos)
standings: id, team_id, group_id, played, won, drawn, lost, gf, ga, gd, points
```

### Tablas privadas por campeonato:
```
championships: id (uuid), name, invite_code, created_by, registration_open,
               display_timezone (default 'America/New_York'),
               mod_group_standings, mod_podium, mod_golden_boot, mod_mvp,
               mod_knockout_matches (boolean defaults false)
               [OJO: group_predictions_locked_at y knockout_predictions_locked_at
                están en la tabla pero son OBSOLETAS — no usar]
championship_users: id, championship_id, user_id, display_name, joined_at,
                    group_points, knockout_points
```

### Pronósticos:
```
predictions: id, championship_id, user_id, match_id,
             score1 (nullable), score2 (nullable), points_earned, created_at, updated_at
             UNIQUE(championship_id, user_id, match_id)
group_predictions: id, championship_id, user_id, group_id,
                   first_place, second_place, third_place, fourth_place (FK → teams),
                   points_earned
special_predictions: id, championship_id, user_id,
                     gold_team_id, silver_team_id, bronze_team_id,
                     golden_boot_player_id, mvp_player_id, points_earned
```

---

## RLS — detalles importantes
- Fix de recursión infinita: hay una función `get_my_championship_ids()` SECURITY DEFINER que se usa en las políticas de SELECT de championship_users, predictions, group_predictions, special_predictions.
- teams, players, groups: lectura pública (`for select using (true)`)
- matches, standings: también deben ser lectura pública (datos del torneo)
- Todas las tablas de usuario: RLS activo, escritura solo del propio usuario
- El creador puede borrar championship_users de SU campeonato (expulsar)
- championships: el creador puede UPDATE de su propio campeonato

---

## Reglas de negocio críticas

### Dos sistemas de puntos — NO MEZCLAR:
1. **Puntos de FÚTBOL** → `standings`: V=3, E=1, D=0, más GF/GA/GD. Reglas FIFA.
2. **Puntos de QUINIELA** → `predictions`/`championship_users`: sistema 6/4/3/1.

### Algoritmo de puntuación de quiniela por partido (categoría única, NO sumar):
Dado pronóstico (p1,p2) vs resultado real (r1,r2):
- **6 pts** → exacto: p1==r1 AND p2==r2
- **4 pts** → acierta el signo Y (p1==r1 OR p2==r2)
- **3 pts** → acierta solo el signo, sin ningún gol individual correcto
- **1 pt** → NO acierta el signo, pero (p1==r1 OR p2==r2)
- **0 pts** → nada
"Signo" = quién gana (local/empate/visitante): sign(p1-p2) == sign(r1-r2).
"Goles de un equipo" aplica a CUALQUIERA de los dos.
En knockout: usar goals (90'/120'), NO los penales.

### Motor de cascada (al guardar un resultado):
1. Actualiza matches (score1, score2, status, penales)
2. Recalcula standings del grupo — DESDE CERO a partir de todos los partidos finished (no incrementar)
3. Recalcula predictions.points_earned para todos los pronósticos de ese partido
4. Recalcula championship_users.group_points / knockout_points — DESDE CERO (idempotente)
La API al final solo reemplaza "quién escribe en matches". El motor es el mismo.

### Cierres (CONSTANTES GLOBALES en lib/constants, NO por campeonato):
- `CLASSIFICATION_LOCK` = 2026-06-11 00:00 America/New_York
- `PODIUM_BOOT_MVP_LOCK` = 2026-06-28 00:00 America/New_York
- Partidos: cada uno a las 00:00 ET de su fecha (desde matches.date/kickoff_utc)
- Usar `America/New_York` (no offset fijo): en el Mundial Miami es EDT = UTC-4
- Una vez bloqueado, NO reabre nunca

### Módulos de pronóstico:
- **Siempre activo (base):** resultados fase de grupos
- **Opcionales (flags en championships):**
  - `mod_group_standings` → clasificación 4 posiciones por grupo, cierra 11 jun
  - `mod_podium` → oro/plata/bronce, cierra 28 jun
  - `mod_golden_boot` → bota de oro (jugador), cierra 28 jun
  - `mod_mvp` → MVP (jugador), cierra 28 jun
  - `mod_knockout_matches` → resultados eliminatoria, activable mientras queden partidos

### Pronósticos reutilizables:
- Pronóstico atado a (championship_id, user_id). Al unirse a un campeonato nuevo, el usuario puede COPIAR sus pronósticos de otro campeonato → copia independiente (editar uno no afecta el otro). PENDIENTE de construir.

### Visibilidad anti-copia:
- Los participantes de un campeonato se ven entre sí para el ranking.
- PERO no se muestran pronósticos ajenos antes de que cierre el partido. Filtro del lado SERVIDOR.

### Eliminatorias:
- 1ros y 2dos: la app los asigna automáticamente al terminar fase de grupos
- 8 terceros: Elier los asigna manualmente desde panel super admin
- matches usa `team1_placeholder`/`team2_placeholder` hasta resolverse

### Super admin:
- UUID en `.env` como `SUPER_ADMIN_ID` (nunca en el repo ni en el cliente)
- Verificado SIEMPRE server-side (nunca confiar en el cliente)
- URL oculta `/super-admin/...` — no enlazada en ninguna UI
- Puede: meter/corregir resultados, resolver cruces de eliminatoria, cargar jugadores, intervenir en cualquier campeonato
- Elier entra como usuario normal con su email; los privilegios se reconocen por UUID en el servidor

---

## Jugadores
- 1.269 jugadores cargados desde archivo de texto extraoficial
- Estructura: name, team_id, position (GK/DEF/MID/FWD), club, source_key
- 3 selecciones sin jugadores aún: Ecuador, Arabia Saudita, Irak
- El 2 de junio se actualizan con las listas oficiales corriendo `npm run load-file` con el archivo nuevo (sincronización real, borra sobrantes)
- Para bota/MVP: mostrar jugadores agrupados por posición: FWD → MID → DEF → GK, con nombre + club

---

## Arquitectura de resultados en vivo (PENDIENTE, va al final)
- Un solo polling server-side cada 15s a API-Football (plan free)
- Al recibir resultado: actualiza matches → dispara el motor de cascada → Supabase Realtime empuja a todos los clientes
- Escala a miles de usuarios porque el polling es UNO solo (del servidor), no por usuario
- API-Football devuelve `goals` (90'/120') y `penalty` por separado — usar solo `goals`

---

## Archivos generados (en /mnt/user-data/outputs de la sesión anterior)
Si los necesitas, pídelos al usuario:
- `quiniela_schema.sql` — schema completo (referencia)
- `migracion_timezones.sql` — todas las migraciones acumuladas
- `fix_rls_recursion.sql` — el fix de recursión infinita en RLS
- `CLAUDE.md` — contexto para Claude Code (debe estar en la raíz del proyecto)

---

## Pendiente de decidir (cuando llegue el momento)
- Puntos de quiniela para clasificación por grupo (4 posiciones — ¿cuántos pts por cada posición acertada?)
- Puntos de quiniela para podio, bota de oro, MVP
- Puntos de quiniela para clasificación por grupo: ¿solo posiciones exactas o también parciales?
