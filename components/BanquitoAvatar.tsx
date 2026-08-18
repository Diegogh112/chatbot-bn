/**
 * BanquitoAvatar — SVG character for the Banco de la Nación chatbot.
 * Robot amigable con colores institucionales: rojo BN + dorado.
 */
export default function BanquitoAvatar({ size = 120 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Banquito - Asistente Virtual"
      className="banquito-svg"
    >
      {/* Body */}
      <rect x="24" y="58" width="72" height="50" rx="16" fill="url(#bodyGrad)"/>

      {/* Chest panel */}
      <rect x="36" y="70" width="48" height="28" rx="8" fill="#8b0a1f" opacity="0.55"/>

      {/* Chest lights */}
      <circle cx="48" cy="80" r="5" fill="#f5a800"/>
      <circle cx="60" cy="80" r="5" fill="#4ade80"/>
      <circle cx="72" cy="80" r="5" fill="#fca5a5"/>

      {/* Chest bar */}
      <rect x="42" y="90" width="36" height="4" rx="2" fill="#f0294a" opacity="0.7"/>

      {/* Head */}
      <rect x="28" y="14" width="64" height="52" rx="18" fill="url(#headGrad)"/>

      {/* Head outline gold */}
      <rect x="28" y="14" width="64" height="52" rx="18" stroke="#f5a800" strokeWidth="2.5" fill="none" opacity="0.8"/>

      {/* Eyes background */}
      <rect x="37" y="27" width="20" height="16" rx="6" fill="#8b0a1f"/>
      <rect x="63" y="27" width="20" height="16" rx="6" fill="#8b0a1f"/>

      {/* Eyes glow */}
      <rect x="39" y="29" width="16" height="12" rx="4" fill="#f5a800"/>
      <rect x="65" y="29" width="16" height="12" rx="4" fill="#f5a800"/>

      {/* Eye shine */}
      <circle cx="45" cy="33" r="2.5" fill="white" opacity="0.9"/>
      <circle cx="71" cy="33" r="2.5" fill="white" opacity="0.9"/>

      {/* Mouth */}
      <rect x="42" y="50" width="36" height="8" rx="4" fill="#8b0a1f"/>
      <rect x="44" y="52" width="32" height="4" rx="2" fill="#f5a800" opacity="0.95"/>

      {/* Antenna */}
      <rect x="57" y="4" width="6" height="14" rx="3" fill="#f5a800"/>
      <circle cx="60" cy="4" r="5" fill="#f5a800"/>
      <circle cx="60" cy="4" r="2.5" fill="white" opacity="0.8"/>

      {/* Arms */}
      <rect x="6"  y="62" width="18" height="32" rx="9" fill="url(#armGrad)"/>
      <rect x="96" y="62" width="18" height="32" rx="9" fill="url(#armGrad)"/>

      {/* Hands */}
      <circle cx="15"  cy="98" r="7" fill="#e01030"/>
      <circle cx="105" cy="98" r="7" fill="#e01030"/>

      {/* Legs */}
      <rect x="36" y="104" width="18" height="12" rx="6" fill="#8b0a1f"/>
      <rect x="66" y="104" width="18" height="12" rx="6" fill="#8b0a1f"/>

      {/* Feet */}
      <rect x="32" y="112" width="24" height="8" rx="4" fill="#c8102e"/>
      <rect x="64" y="112" width="24" height="8" rx="4" fill="#c8102e"/>

      <defs>
        <linearGradient id="bodyGrad" x1="24" y1="58" x2="96" y2="108" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e01030"/>
          <stop offset="1" stopColor="#8b0a1f"/>
        </linearGradient>
        <linearGradient id="headGrad" x1="28" y1="14" x2="92" y2="66" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f0294a"/>
          <stop offset="1" stopColor="#c8102e"/>
        </linearGradient>
        <linearGradient id="armGrad" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop stopColor="#e01030"/>
          <stop offset="1" stopColor="#8b0a1f"/>
        </linearGradient>
      </defs>
    </svg>
  );
}
