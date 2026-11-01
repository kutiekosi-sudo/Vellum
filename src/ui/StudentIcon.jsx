// A thin line-drawing of a student at a desk. Studying: the student bends over the desk beside a lamp.
// Break: a clock sits on the desk. Away: an empty desk with the lamp. Two hours of study today adds wavy
// lines above the head, five hours puts a flame there. Break and away are drawn in grey.
export const ICON_VARIANTS = [
  { id: 'plain', label: 'Plain' },
  { id: 'bun', label: 'Bun' },
  { id: 'cap', label: 'Cap' },
  { id: 'band', label: 'Headband' },
  { id: 'glasses', label: 'Glasses' },
];
export const ICON_COLORS = ['#7C83D6', '#C2457F', '#2B8A87', '#7D2E3F', '#4F8A68', '#B98322', '#8878C3', '#3D77A8'];
export const DEFAULT_ICON = { variant: 'plain', color: '#7C83D6' };
export const HEAT_WAVES_MIN = 120;
export const HEAT_FIRE_MIN = 300;
const GREY = '#8F959B';

export default function StudentIcon({ icon = DEFAULT_ICON, state = 'studying', minutes = 0, size = 72, label }) {
  const { variant, color } = { ...DEFAULT_ICON, ...(icon || {}) };
  const studying = state === 'studying';
  const c = studying ? color : GREY;
  const heat = studying ? (minutes >= HEAT_FIRE_MIN ? 'fire' : minutes >= HEAT_WAVES_MIN ? 'waves' : '') : '';
  const line = { fill: 'none', stroke: c, strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <svg className={`student-icon is-${state}`} width={size} height={size} viewBox="0 0 80 80" role="img" style={{ overflow: 'visible' }}
      aria-label={label || (studying ? `Studying${heat === 'fire' ? ', on fire after five hours' : heat === 'waves' ? ', heating up after two hours' : ''}` : state === 'break' ? 'On a break' : 'Not studying')}>
      {/* desk */}
      <g {...line}>
        <path d="M10 52h60" /><path d="M16 52v18M64 52v18" /><path d="M10 52v0" />
      </g>
      {/* lamp */}
      {state !== 'break' && <g {...line}><path d="M56 52v-4M49 48h14" /><path d="M56 48l-4-14 10-2 2 8-8 8" /><path d="M52 34l10-2" /></g>}
      {state === 'break' && <g {...line}><circle cx="52" cy="38" r="9" /><path d="M52 33v5l4 2" /><path d="M52 47v5" /></g>}
      {studying && (
        <g {...line}>
          <circle cx="32" cy="30" r="7" />
          <path d="M20 52v-5a12 12 0 0 1 24 0v5" />
          {variant === 'bun' && <circle cx="32" cy="20" r="3.5" />}
          {variant === 'cap' && <path d="M24 28a8 8 0 0 1 16 0z M39 28h8" />}
          {variant === 'band' && <path d="M25.5 27c4 2.5 9 2.5 13 0" />}
          {variant === 'glasses' && <><circle cx="29.5" cy="30" r="2.6" /><circle cx="35.5" cy="30" r="2.6" /></>}
        </g>
      )}
      {heat === 'waves' && (
        <g className="heat-waves" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
          <path d="M24 16c-3-3 3-5 0-9" /><path d="M32 14c-3-3 3-5 0-9" /><path d="M40 16c-3-3 3-5 0-9" />
        </g>
      )}
      {heat === 'fire' && (
        <g className="flame">
          <path d="M32 21c-8-5-9-12-3-19 1 5 5 5 6 1 4 4 5 11-3 18z" fill="#F2A33A" stroke="#D9622B" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M32 19c-3-3-3-6-1-9 3 3 4 6 1 9z" fill="#FBD98B" />
        </g>
      )}
    </svg>
  );
}
