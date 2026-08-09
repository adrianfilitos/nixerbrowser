function S({ children, ...p }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      {children}
    </svg>
  )
}

export const I = {
  plus: <S><path d="M12 5v14M5 12h14" /></S>,
  window: <S><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 9h20" /></S>,
  incognito: <S><circle cx="8" cy="13" r="3.5" /><circle cx="16" cy="13" r="3.5" /><path d="M8 16.5L6.5 20M16 16.5L17.5 20M4 13h4M16 13h4" /></S>,
  history: <S><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>,
  downloads: <S><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></S>,
  star: <S fill="currentColor" strokeWidth="1.6"><path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 17l-5.4 2.6 1-6L3.3 9.4l6-.9z" /></S>,
  settings: <S><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" /></S>,
  ai: <S fill="currentColor" strokeWidth="1.6"><path d="M12 2l1.7 4.8 4.8 1.7-4.8 1.7L12 15l-1.7-4.8-4.8-1.7 4.8-1.7z" /><path d="M18.5 13l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" opacity="0.65" /><path d="M5 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" opacity="0.65" /></S>,
  find: <S><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></S>,
  sun: <S><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></S>,
  moon: <S><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></S>,
  full: <S><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></S>,
  back: <S><path d="M15 18l-6-6 6-6" /></S>,
  forward: <S><path d="M9 18l6-6-6-6" /></S>,
  reload: <S><path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></S>,
  restore: <S><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></S>,
  globe: <S><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9S14.5 18.5 12 21c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3z" /></S>,
  close: <S strokeWidth="2.4"><path d="M18 6L6 18M6 6l12 12" /></S>,
  home: <S><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></S>,
  pin: <S><path d="M12 17v5M8 2h8M9 2v6l-2 4h10l-2-4V2" /></S>,
  copy: <S><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></S>,
  trash: <S><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></S>,
  open: <S><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14L21 3" /></S>,
  check: <S><path d="M20 6L9 17l-5-5" /></S>,
  reader: <S><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></S>,
  save: <S><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></S>,
  print: <S><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></S>,
  gauge: <S><path d="M12 15l3.5-3.5" /><path d="M20.3 18a10 10 0 1 0-16.6 0" /></S>,
  key: <S><path d="M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 11" /></S>,
  puzzle: <S><path d="M19 13.5V17a2 2 0 0 1-2 2h-2.5a1.5 1.5 0 0 0-1.5 1.5v1a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-2.5A1.5 1.5 0 0 0 5.5 18H4a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h1.5A1.5 1.5 0 0 0 7 10.5V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5a1.5 1.5 0 0 0 1.5 1.5H16a2 2 0 0 1 2 2v2z" /></S>,
  form: <S><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></S>,
  volume: <S><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /></S>,
}
