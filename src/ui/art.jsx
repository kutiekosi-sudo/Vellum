// Original line-and-fill illustrations. They take their colour from --accent so a class can tint them.
// Decorative only (aria-hidden); the text next to them carries the meaning.
const INK = '#1F2328';
const P = { fill: 'none', stroke: INK, strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
const A = 'var(--accent, #1F5C4D)';
const SOFT = 'color-mix(in srgb, var(--accent, #1F5C4D) 16%, #fff)';
const WARM = '#F3E3B8';

function Frame({ children, className, vb = '0 0 240 180' }) {
  return <svg className={className} viewBox={vb} aria-hidden="true" focusable="false">{children}</svg>;
}
const Floor = () => <ellipse cx="120" cy="160" rx="82" ry="9" fill="#000" opacity=".06" />;

const ART = {
  desk: (
    <>
      <Floor />
      <rect x="40" y="108" width="160" height="12" rx="4" fill={SOFT} {...P} />
      <path d="M58 120v36M182 120v36" {...P} />
      <rect x="82" y="56" width="76" height="52" rx="6" fill="#fff" {...P} />
      <path d="M96 74h48M96 86h32" {...P} stroke={A} />
      <path d="M120 108v-0" {...P} />
      <circle cx="176" cy="92" r="9" fill={WARM} {...P} />
      <path d="M176 101v7" {...P} />
      <path d="M52 108c0-12 8-16 16-16" {...P} />
    </>
  ),
  classroom: (
    <>
      <Floor />
      <rect x="34" y="34" width="172" height="86" rx="8" fill={SOFT} {...P} />
      <path d="M54 62h60M54 80h92M54 98h44" {...P} stroke={A} />
      <circle cx="170" cy="76" r="14" fill="#fff" {...P} />
      <path d="M170 68v8l6 4" {...P} />
      <path d="M50 120v34M190 120v34M50 140h140" {...P} />
    </>
  ),
  people: (
    <>
      <Floor />
      <circle cx="120" cy="64" r="16" fill={WARM} {...P} />
      <path d="M92 124c0-20 12-32 28-32s28 12 28 32" fill={SOFT} {...P} />
      <circle cx="66" cy="84" r="12" fill="#fff" {...P} />
      <path d="M44 128c0-15 9-24 22-24 6 0 10 2 14 5" {...P} />
      <circle cx="174" cy="84" r="12" fill="#fff" {...P} />
      <path d="M196 128c0-15-9-24-22-24-6 0-10 2-14 5" {...P} />
    </>
  ),
  done: (
    <>
      <Floor />
      <circle cx="120" cy="84" r="46" fill={SOFT} {...P} />
      <path d="M98 86l16 16 30-34" {...P} stroke={A} strokeWidth="5" />
      <path d="M52 40l6 6M188 38l-6 6M200 98h10M30 100h10" {...P} />
    </>
  ),
  focus: (
    <>
      <Floor />
      <circle cx="120" cy="82" r="48" fill="#fff" {...P} />
      <circle cx="120" cy="82" r="38" fill={SOFT} stroke="none" />
      <path d="M120 56v28l18 10" {...P} stroke={A} strokeWidth="4" />
      <path d="M104 28h32" {...P} />
      <path d="M120 28v6" {...P} />
    </>
  ),
  test: (
    <>
      <Floor />
      <rect x="62" y="26" width="116" height="128" rx="10" fill="#fff" {...P} />
      <rect x="92" y="18" width="56" height="18" rx="6" fill={SOFT} {...P} />
      <circle cx="86" cy="64" r="6" fill="none" {...P} />
      <path d="M102 64h56" {...P} />
      <circle cx="86" cy="90" r="6" fill={A} {...P} />
      <path d="M102 90h44" {...P} />
      <circle cx="86" cy="116" r="6" fill="none" {...P} />
      <path d="M102 116h50" {...P} />
    </>
  ),
  chart: (
    <>
      <Floor />
      <path d="M44 28v116h156" {...P} />
      <rect x="62" y="96" width="24" height="48" rx="4" fill={SOFT} {...P} />
      <rect x="100" y="70" width="24" height="74" rx="4" fill={A} fillOpacity=".85" {...P} />
      <rect x="138" y="84" width="24" height="60" rx="4" fill={SOFT} {...P} />
      <path d="M62 62l40-22 36 14 50-26" {...P} />
    </>
  ),
  homework: (
    <>
      <Floor />
      <rect x="60" y="30" width="100" height="124" rx="8" fill="#fff" transform="rotate(-6 110 92)" {...P} />
      <rect x="82" y="26" width="100" height="124" rx="8" fill="#fff" {...P} />
      <path d="M98 56h68M98 74h68M98 92h40" {...P} stroke={A} />
      <path d="M150 128l30-30 8 8-30 30-12 4z" fill={WARM} {...P} />
    </>
  ),
  coach: (
    <>
      <Floor />
      <path d="M52 40h136a10 10 0 0 1 10 10v58a10 10 0 0 1-10 10h-62l-26 22v-22H52a10 10 0 0 1-10-10V50a10 10 0 0 1 10-10z" fill="#fff" {...P} />
      <circle cx="92" cy="80" r="5" fill={A} stroke="none" />
      <circle cx="120" cy="80" r="5" fill={A} stroke="none" />
      <circle cx="148" cy="80" r="5" fill={A} stroke="none" />
    </>
  ),
  folder: (
    <>
      <Floor />
      <path d="M40 54a8 8 0 0 1 8-8h40l14 16h90a8 8 0 0 1 8 8v70a8 8 0 0 1-8 8H48a8 8 0 0 1-8-8z" fill={SOFT} {...P} />
      <path d="M40 80h160" {...P} />
    </>
  ),
  sent: (
    <>
      <Floor />
      <path d="M52 100l140-58-46 96-26-34z" fill="#fff" {...P} />
      <path d="M120 104l72-62" {...P} stroke={A} />
      <path d="M40 130h26M30 148h30" {...P} />
    </>
  ),
  inbox: (
    <>
      <Floor />
      <path d="M52 92l22-48h92l22 48v48a8 8 0 0 1-8 8H60a8 8 0 0 1-8-8z" fill="#fff" {...P} />
      <path d="M52 92h50l8 14h20l8-14h50" {...P} />
    </>
  ),
  pod: (
    <>
      <Floor />
      <circle cx="120" cy="74" r="14" fill={WARM} {...P} />
      <circle cx="68" cy="100" r="12" fill="#fff" {...P} />
      <circle cx="172" cy="100" r="12" fill="#fff" {...P} />
      <path d="M92 138c0-16 12-28 28-28s28 12 28 28" fill={SOFT} {...P} />
      <path d="M92 86l-12 8M148 86l12 8" {...P} stroke={A} />
    </>
  ),
  search: (
    <>
      <Floor />
      <circle cx="108" cy="78" r="36" fill="#fff" {...P} />
      <path d="M134 104l34 34" {...P} strokeWidth="5" stroke={A} />
      <path d="M94 78h28" {...P} />
    </>
  ),
  bell: (
    <>
      <Floor />
      <path d="M72 120c8-8 10-18 10-36a38 38 0 0 1 76 0c0 18 2 28 10 36z" fill={SOFT} {...P} />
      <path d="M108 132a12 12 0 0 0 24 0" {...P} />
      <path d="M120 40v6" {...P} />
    </>
  ),
  offline: (
    <>
      <Floor />
      <path d="M52 78a96 96 0 0 1 136 0M74 100a62 62 0 0 1 92 0M98 122a28 28 0 0 1 44 0" {...P} />
      <circle cx="120" cy="140" r="4" fill={INK} />
      <path d="M60 36l120 112" {...P} stroke={A} strokeWidth="4" />
    </>
  ),
  school: (
    <>
      <Floor />
      <path d="M120 30L40 66l80 36 80-36z" fill={SOFT} {...P} />
      <path d="M72 84v36c0 10 22 20 48 20s48-10 48-20V84" fill="#fff" {...P} />
      <path d="M200 66v44" {...P} />
    </>
  ),
};

export const ART_NAMES = Object.keys(ART);

export function Art({ name, className = 'art', style }) {
  const body = ART[name] || ART.desk;
  return <Frame className={className}>{body}</Frame>;
}

// Small decorative subject marks for class banners.
export function SubjectMark({ kind, className }) {
  const g = {
    math: <path d="M14 20h16M22 12v16M40 14l12 12M52 14L40 26M14 46h16M40 46h12" {...P} stroke="currentColor" />,
    science: <path d="M24 10h16M28 10v16L14 50a4 4 0 0 0 4 6h28a4 4 0 0 0 4-6L36 26V10M22 40h20" {...P} stroke="currentColor" />,
    language: <path d="M12 18h40v26H30l-10 8v-8h-8zM22 28h20M22 36h12" {...P} stroke="currentColor" />,
    humanities: <path d="M32 10a22 22 0 1 0 0 44 22 22 0 0 0 0-44zM10 32h44M32 10c-12 12-12 32 0 44M32 10c12 12 12 32 0 44" {...P} stroke="currentColor" />,
    tech: <path d="M20 22l-10 10 10 10M44 22l10 10-10 10M36 16l-8 32" {...P} stroke="currentColor" />,
    arts: <path d="M32 10a22 22 0 1 0 0 44c6 0 6-6 2-9s0-9 8-9h6c6 0 10-4 10-9 0-10-12-17-26-17zM22 28h.01M32 22h.01M42 26h.01" {...P} stroke="currentColor" />,
    general: <path d="M12 16c10-4 16-2 20 4 4-6 10-8 20-4v32c-10-4-16-2-20 4-4-6-10-8-20-4zM32 20v32" {...P} stroke="currentColor" />,
  };
  return <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">{g[kind] || g.general}</svg>;
}
