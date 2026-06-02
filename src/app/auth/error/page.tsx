import Link from 'next/link'

export default function AuthErrorPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.25rem',
        background: '#081225',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          background: 'linear-gradient(180deg, #11233f 0%, #0d1b32 100%)',
          border: '1px solid rgba(232,67,79,0.25)',
          borderRadius: '20px',
          padding: '2.5rem 2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          textAlign: 'center',
          boxShadow: '0 0 0 1px rgba(232,67,79,0.12), 0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ fontSize: '2.75rem', lineHeight: 1 }} aria-hidden>
          ⚠️
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-anton), Anton, sans-serif',
            fontSize: '1.375rem',
            letterSpacing: '0.03em',
            color: '#fff',
            margin: 0,
          }}
        >
          ENLACE INVÁLIDO
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-archivo), Archivo, sans-serif',
            fontWeight: 500,
            fontSize: '0.9rem',
            color: '#93a6c6',
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          El enlace expiró o ya fue usado. Solicita uno nuevo desde la pantalla
          de acceso.
        </p>

        <div style={{ height: '1px', width: '100%', background: 'rgba(255,255,255,0.07)' }} />

        <Link
          href="/login"
          style={{
            display: 'block',
            width: '100%',
            padding: '0.875rem 1.5rem',
            background: 'linear-gradient(180deg, #fbd75f 0%, #e7af2e 100%)',
            color: '#2a1d00',
            fontFamily: 'var(--font-archivo), Archivo, sans-serif',
            fontWeight: 800,
            fontSize: '0.8125rem',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            borderRadius: '10px',
            textDecoration: 'none',
            textAlign: 'center',
            boxShadow: '0 6px 18px rgba(247,201,72,0.28)',
          }}
        >
          Volver al login
        </Link>
      </div>
    </main>
  )
}
