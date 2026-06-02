'use client'

import { useState, useMemo } from 'react'
import { flagCode, esName } from '@/lib/teams-data'

export type StandingRow = {
  teamId: number; teamName: string
  played: number; won: number; drawn: number; lost: number
  gf: number; ga: number; gd: number; points: number
}

export type GroupStanding = {
  groupId: number; groupName: string; rows: StandingRow[]
}

type Props = { groups: GroupStanding[] }

const GROUP_COLORS: Record<string, string> = {
  'Group A':'#ff2d78','Group B':'#ff8a3d','Group C':'#ffd23f',
  'Group D':'#7ee787','Group E':'#19e3c0','Group F':'#3dd5ff',
  'Group G':'#5b8cff','Group H':'#7c5cff','Group I':'#c46bff',
  'Group J':'#ff5cae','Group K':'#ff6b6b','Group L':'#9bd45b',
}
function groupLetter(g: string) { return g.replace('Group ', '') }

// ── StandingsTable — estructura exacta del handoff, inline styles para garantizar layout ──

function StandingsTable({ group }: { group: GroupStanding }) {
  const color = GROUP_COLORS[group.groupName] ?? '#5b8cff'

  const rows = [...group.rows].sort((a, b) =>
    b.points - a.points || b.gd - a.gd || b.gf - a.gf ||
    esName(a.teamName).localeCompare(esName(b.teamName))
  )

  return (
    <div style={{
      background: 'linear-gradient(180deg,var(--card),var(--card2))',
      border: '1px solid var(--line)', borderRadius: '16px', overflow: 'hidden',
    }}>
      {/* Cabecera del grupo */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '14px 16px',
        fontFamily: 'var(--font-anton),Anton,sans-serif',
        fontSize: '18px', textTransform: 'uppercase', letterSpacing: '.02em',
        borderBottom: '1px solid var(--line)',
      }}>
        <span style={{
          fontFamily: 'var(--font-anton),Anton,sans-serif', fontSize: '14px',
          width: '26px', height: '26px', display: 'grid', placeItems: 'center',
          borderRadius: '8px', color: '#0a0e1a', background: color,
          boxShadow: `0 2px 10px color-mix(in srgb,${color} 45%,transparent)`,
          flexShrink: 0,
        }}>
          {groupLetter(group.groupName)}
        </span>
        <span>Grupo {groupLetter(group.groupName)}</span>
      </div>

      {/* Tabla */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr>
            <th style={{ fontSize: '10px', color: 'var(--mut2)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800, padding: '10px 4px 10px 16px', textAlign: 'left' }}>
              Equipo
            </th>
            {['PJ','G','E','P','DG','Pts'].map(h => (
              <th key={h} style={{ fontSize: '10px', color: 'var(--mut2)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800, padding: '10px 4px', textAlign: 'center' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const code = flagCode(r.teamName)
            const isQual = i < 2
            const rowBg = isQual
              ? `linear-gradient(90deg,color-mix(in srgb,${color} 12%,transparent),transparent 70%)`
              : undefined

            return (
              <tr key={r.teamId} style={{ background: rowBg }}>
                {/* Celda equipo: inline flex garantizado */}
                <td style={{ padding: '9px 4px 9px 16px', borderTop: '1px solid var(--line)', color: 'var(--txt)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                    <span style={{
                      fontFamily: 'Archivo Narrow,Archivo,sans-serif', fontWeight: 700,
                      color: isQual ? color : 'var(--mut2)',
                      width: '16px', textAlign: 'center', flexShrink: 0,
                    }}>
                      {i + 1}
                    </span>
                    <img
                      src={`https://flagcdn.com/w80/${code}.png`}
                      srcSet={`https://flagcdn.com/w160/${code}.png 2x`}
                      alt={esName(r.teamName)}
                      loading="lazy"
                      style={{ width: '22px', height: '15px', objectFit: 'cover', borderRadius: '3px', outline: '1px solid rgba(255,255,255,.2)', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,.4)' }}
                    />
                    <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {esName(r.teamName)}
                    </span>
                  </div>
                </td>

                {/* Celdas de estadísticas */}
                {[r.played, r.won, r.drawn, r.lost].map((v, j) => (
                  <td key={j} style={{ padding: '9px 4px', textAlign: 'center', color: 'var(--mut)', fontWeight: 700, borderTop: '1px solid var(--line)' }}>
                    {v}
                  </td>
                ))}
                <td style={{ padding: '9px 4px', textAlign: 'center', color: 'var(--mut)', fontWeight: 700, borderTop: '1px solid var(--line)' }}>
                  {r.gd > 0 ? `+${r.gd}` : r.gd}
                </td>
                <td style={{ padding: '9px 4px', textAlign: 'center', color: '#fff', fontWeight: 900, fontSize: '15px', fontFamily: 'var(--font-archivo),Archivo,sans-serif', borderTop: '1px solid var(--line)' }}>
                  {r.points}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── TablaView ─────────────────────────────────────────────────────────────────

export function TablaView({ groups }: Props) {
  const [filter, setFilter] = useState('all')

  const visible = useMemo(
    () => filter === 'all' ? groups : groups.filter(g => g.groupName === filter),
    [groups, filter],
  )

  return (
    <div>
      {/* Chips de filtro */}
      <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginBottom: '26px' }}>
        <button className={`chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>
          Todos
        </button>
        {groups.map(g => {
          const col = GROUP_COLORS[g.groupName] ?? '#5b8cff'
          return (
            <button key={g.groupId}
              className={`chip${filter === g.groupName ? ' on' : ''}`}
              style={{ '--gc': col } as React.CSSProperties}
              onClick={() => setFilter(g.groupName)}
            >
              <i style={{ background: col }} />{groupLetter(g.groupName)}
            </button>
          )
        })}
      </div>

      {/* Grid de tablas — inline styles para garantizar el layout incluso desde display:none */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(380px, 100%), 1fr))',
        gap: '16px',
      }}>
        {visible.map(g => <StandingsTable key={g.groupId} group={g} />)}
      </div>
    </div>
  )
}
