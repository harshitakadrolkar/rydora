import { useId } from 'react';
// Hand-built SVG illustrations (no external images needed).
// A Bengaluru street: skyline with a Vidhana Soudha-style dome, a sedan and an auto-rickshaw,
// and a pickup -> drop route above them.

export function CityRideIllustration({ className = '', compact = false, fade = false }) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 560 380" className={className} role="img" aria-label="An auto-rickshaw and a car on a Bengaluru street with a pickup-to-drop route">
      <defs>
        <linearGradient id={`ri-sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c2550" stopOpacity="0" />
          <stop offset="1" stopColor="#1c2550" stopOpacity=".9" />
        </linearGradient>
        <linearGradient id={`ri-glow-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f5c400" stopOpacity="0" />
          <stop offset="1" stopColor="#f5c400" stopOpacity=".35" />
        </linearGradient>
        <linearGradient id={`ri-fadeh-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".14" stopColor="#fff" stopOpacity="1" />
          <stop offset=".86" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`ri-mask-${uid}`}><rect width="560" height="380" fill={`url(#ri-fadeh-${uid})`} /></mask>
      </defs>
      <g mask={fade ? `url(#ri-mask-${uid})` : undefined}>

      {/* sky band */}
      <rect x="0" y="120" width="560" height="200" fill={`url(#ri-sky-${uid})`} />

      {/* skyline */}
      <g fill="#2a3570" opacity=".75">
        <rect x="18" y="200" width="34" height="110" />
        <rect x="58" y="176" width="26" height="134" />
        <rect x="90" y="214" width="40" height="96" />
        {/* Vidhana Soudha-style dome */}
        <rect x="150" y="226" width="120" height="84" />
        <rect x="186" y="204" width="48" height="24" />
        <path d="M188 206 Q210 158 232 206 Z" />
        <rect x="208" y="150" width="4" height="14" />
        <g fill="#131a3a">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} x={158 + i * 16} y="244" width="8" height="58" />)}
        </g>
        <rect x="286" y="190" width="30" height="120" />
        <rect x="322" y="166" width="22" height="144" />
        <rect x="350" y="208" width="44" height="102" />
        <rect x="402" y="184" width="28" height="126" />
        <rect x="436" y="222" width="50" height="88" />
        <rect x="492" y="196" width="30" height="114" />
        <rect x="528" y="230" width="32" height="80" />
      </g>
      {/* lit windows */}
      <g fill="#f5c400" opacity=".55">
        {[[64, 190], [64, 214], [96, 228], [292, 204], [292, 236], [328, 182], [356, 222], [408, 198], [408, 232], [442, 236], [498, 210]].map(([x, y], i) => <rect key={i} x={x} y={y} width="6" height="8" rx="1" />)}
      </g>

      </g>
      {/* route between pickup and drop */}
      {!compact && <>
        <path d="M96 116 C 200 20, 360 40, 470 88" fill="none" stroke="#f5c400" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" />
        <g transform="translate(96 116)">
          <circle r="22" fill="#34d399" opacity=".18" />
          <path d="M0 6 C -10 -6 -12 -12 -12 -16 a12 12 0 0 1 24 0 c0 4 -2 10 -12 22 z" fill="#34d399" />
          <circle cy="-16" r="4.5" fill="#0b1020" />
        </g>
        <g transform="translate(470 88)">
          <circle r="22" fill="#f472b6" opacity=".18" />
          <path d="M0 6 C -10 -6 -12 -12 -12 -16 a12 12 0 0 1 24 0 c0 4 -2 10 -12 22 z" fill="#f472b6" />
          <circle cy="-16" r="4.5" fill="#0b1020" />
        </g>
      </>}

      {/* road */}
      <g mask={fade ? `url(#ri-mask-${uid})` : undefined}>
      <rect x="0" y="308" width="560" height="72" fill="#0f1530" />
      <rect x="0" y="306" width="560" height="4" fill="#2a3570" />
      <g fill="#3b4890">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <rect key={i} x={10 + i * 72} y="344" width="40" height="4" rx="2" />)}
      </g>
      </g>

      {/* sedan (background vehicle) */}
      <g transform="translate(36 236)">
        <ellipse cx="80" cy="76" rx="78" ry="5" fill="#000" opacity=".35" />
        <path d="M6 58 L6 46 Q8 38 20 36 L44 34 L66 14 Q72 10 82 10 L118 10 Q128 10 134 18 L146 34 L154 36 Q160 38 160 46 L160 58 Z" fill="#7c3aed" />
        <path d="M52 34 L70 17 Q74 14 80 14 L96 14 L96 34 Z" fill="#c4b5fd" opacity=".85" />
        <path d="M102 14 L116 14 Q123 14 127 19 L138 34 L102 34 Z" fill="#c4b5fd" opacity=".85" />
        <rect x="6" y="46" width="154" height="4" fill="#6d28d9" />
        <rect x="150" y="40" width="10" height="5" rx="2" fill="#fde68a" />
        <circle cx="38" cy="60" r="14" fill="#0b1020" /><circle cx="38" cy="60" r="6" fill="#64748b" />
        <circle cx="128" cy="60" r="14" fill="#0b1020" /><circle cx="128" cy="60" r="6" fill="#64748b" />
      </g>

      {/* auto-rickshaw (hero vehicle) */}
      <g transform="translate(232 150)">
        <ellipse cx="128" cy="166" rx="122" ry="7" fill="#000" opacity=".4" />
        {/* headlight beam */}
        <path d="M232 112 L330 92 L330 150 Z" fill={`url(#ri-glow-${uid})`} />
        {/* canopy */}
        <path d="M18 92 L26 26 Q30 8 50 8 L178 8 Q196 8 202 24 L232 112 L212 112 L188 34 L44 34 L40 92 Z" fill="#111827" />
        <path d="M26 26 Q30 8 50 8 L178 8 Q196 8 202 24 L198 20 L52 20 Q34 20 30 34 Z" fill="#1f2937" />
        {/* cabin interior */}
        <path d="M44 34 L188 34 L212 112 L44 112 Z" fill="#0b1020" />
        {/* passenger + driver silhouettes */}
        <circle cx="96" cy="64" r="12" fill="#2a3570" /><path d="M78 104 Q80 80 96 78 Q112 80 114 104 Z" fill="#2a3570" />
        <circle cx="170" cy="62" r="10" fill="#3b4890" /><path d="M156 102 Q158 80 170 78 Q182 80 184 102 Z" fill="#3b4890" />
        {/* windshield */}
        <path d="M188 34 L200 34 L226 108 L212 108 Z" fill="#a5f3fc" opacity=".35" />
        {/* yellow lower body */}
        <path d="M10 160 L10 106 Q10 92 26 92 L40 92 L40 112 L212 112 L236 112 Q252 114 256 130 L258 160 Z" fill="#f5c400" />
        {/* green stripe (Bengaluru autos) */}
        <path d="M10 124 L254 124 L256 134 L10 134 Z" fill="#16a34a" />
        {/* side opening edge + details */}
        <rect x="40" y="112" width="4" height="40" fill="#b38f00" />
        <rect x="150" y="140" width="40" height="5" rx="2" fill="#b38f00" />
        {/* headlight */}
        <circle cx="250" cy="112" r="8" fill="#fef9c3" />
        <circle cx="250" cy="112" r="4" fill="#fde047" />
        {/* plate */}
        <rect x="226" y="140" width="26" height="11" rx="2" fill="#fef9c3" />
        <rect x="230" y="144" width="18" height="2.5" fill="#0b1020" />
        {/* wheels */}
        <circle cx="58" cy="160" r="22" fill="#0b1020" /><circle cx="58" cy="160" r="9" fill="#94a3b8" /><circle cx="58" cy="160" r="3" fill="#0b1020" />
        <circle cx="226" cy="162" r="18" fill="#0b1020" /><circle cx="226" cy="162" r="7" fill="#94a3b8" /><circle cx="226" cy="162" r="2.5" fill="#0b1020" />
        {/* RYDORA badge on canopy */}
        <rect x="76" y="12" width="76" height="14" rx="7" fill="#f5c400" />
        <text x="114" y="23" textAnchor="middle" fontFamily="Unbounded, Sora, sans-serif" fontSize="9" fontWeight="800" fill="#0b1020" letterSpacing="1.5">RYDORA</text>
      </g>
    </svg>
  );
}

/** Small auto-rickshaw icon used for the logo mark. */
export function AutoMark({ className = 'h-9 w-9' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="13" fill="#f5c400" />
      <path d="M9 31 L9 24 Q9 21 12 21 L14 21 L15.5 13 Q16 11 18.5 11 L31 11 Q33 11 34 13 L38 25 Q40 26 40 29 L40 31 Z" fill="#0b1020" />
      <path d="M17.5 14 L31 14 L34 22 L17 22 Z" fill="#f5c400" opacity=".9" />
      <circle cx="15" cy="32" r="4.5" fill="#0b1020" /><circle cx="15" cy="32" r="1.8" fill="#f5c400" />
      <circle cx="35" cy="32" r="4" fill="#0b1020" /><circle cx="35" cy="32" r="1.6" fill="#f5c400" />
    </svg>
  );
}
