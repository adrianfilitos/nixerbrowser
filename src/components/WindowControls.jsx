export default function WindowControls({ maximized }) {
  return (
    <div className="win-controls">
      <button className="wc-btn" title="Minimizar" onClick={() => window.api.minimize()}>
        <svg width="11" height="11" viewBox="0 0 10 10">
          <rect x="0.5" y="4.5" width="9" height="1" fill="currentColor" />
        </svg>
      </button>
      <button className="wc-btn" title="Maximizar / restaurar" onClick={() => window.api.toggleMaximize()}>
        {maximized ? (
          <svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="2.5" width="7" height="7" />
            <path d="M2.5 2.5v-2h7v7h-2" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="0.5" width="9" height="9" />
          </svg>
        )}
      </button>
      <button className="wc-btn close" title="Cerrar" onClick={() => window.api.close()}>
        <svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
          <path d="M1 1l8 8M9 1l-8 8" />
        </svg>
      </button>
    </div>
  )
}
