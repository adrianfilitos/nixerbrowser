export default function NavButtons({ navState, onNavAction }) {
  return (
    <div className="nav-buttons">
      <button className="nav-btn" disabled={!navState.canGoBack} onClick={() => onNavAction('goBack')} title="Atrás (Alt+Izquierda)">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button className="nav-btn" disabled={!navState.canGoForward} onClick={() => onNavAction('goForward')} title="Adelante (Alt+Derecha)">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </div>
  )
}
