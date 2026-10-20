// Emblema do Portal Paraguai Pick & Go (cabeçalho do sistema e do app do turista).

export function Brasao() {
  return (
    <div className="brand-logo-mark" aria-label="Emblema Portal Paraguai Pick & Go">
      <svg className="brand-crest-svg" viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="crestRed" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#B91C1C" />
            <stop offset="100%" stopColor="#DC2626" />
          </linearGradient>
          <linearGradient id="crestDarkBlue" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#061021" />
            <stop offset="100%" stopColor="#0F2952" />
          </linearGradient>
          <linearGradient id="crestGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="50%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#9A7B1C" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="62" height="46" rx="10" fill="#061021" stroke="url(#crestGold)" strokeWidth="1.6" />
        <path d="M2.5 11 C2.5 6.3 6.3 2.5 11 2.5 H53 C57.7 2.5 61.5 6.3 61.5 11 V16.5 H2.5 Z" fill="url(#crestRed)" />
        <rect x="2.5" y="16.5" width="59" height="15" fill="#FFFFFF" />
        <path d="M2.5 31.5 H61.5 V37 C61.5 41.7 57.7 45.5 53 45.5 H11 C6.3 45.5 2.5 41.7 2.5 37 Z" fill="url(#crestDarkBlue)" />
        <circle cx="32" cy="24" r="9.5" fill="#091933" stroke="url(#crestGold)" strokeWidth="1.4" />
        <circle cx="32" cy="24" r="7.2" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="0.7" strokeDasharray="2 1.5" />
        <polygon points="32,17.8 33.6,21.6 37.7,21.9 34.5,24.6 35.5,28.6 32,26.4 28.5,28.6 29.5,24.6 26.3,21.9 30.4,21.6" fill="url(#crestGold)" />
      </svg>
      <span className="brand-monogram">P&amp;G</span>
    </div>
  );
}
