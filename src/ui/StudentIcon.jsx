// Line icons in one colour, like a study-room board: a student at a desk with a lamp (studying), a desk with a clock
// (break), an empty desk with a lamp (away). Two hours of study today adds a few dotted marks beside the head,
// five hours adds a flame outline above it. Everything is drawn in the single colour passed in; break and away fade.
export const HEAT_WAVES_MIN = 120;
export const HEAT_FIRE_MIN = 300;

export default function StudentIcon({ color = '#8E95E8', state = 'studying', minutes = 0, size = 72, label }) {
  const studying = state === 'studying';
  const heat = studying ? (minutes >= HEAT_FIRE_MIN ? 'fire' : minutes >= HEAT_WAVES_MIN ? 'dots' : '') : '';
  const line = { fill: 'none', stroke: color, strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <svg className={`student-icon is-${state}`} width={size} height={size} viewBox="0 0 80 80" role="img" style={{ overflow: 'visible', opacity: studying ? 1 : 0.42 }}
      aria-label={label || (studying ? `Studying${heat === 'fire' ? ', five hours today' : heat === 'dots' ? ', two hours today' : ''}` : state === 'break' ? 'On a break' : 'Not studying')}>
      {/* desk: a bar with two legs */}
      <g {...line}>
        <rect x="8" y="50" width="64" height="6" rx="1.5" />
        <rect x="12" y="56" width="6" height="16" rx="1" />
        <rect x="62" y="56" width="6" height="16" rx="1" />
      </g>
      {/* lamp */}
      {state !== 'break' && <g {...line}><path d="M52 50v-5" /><path d="M46 45h12" /><path d="M54 43l-6-15h9l3 9z" /></g>}
      {state === 'break' && <g {...line}><circle cx="46" cy="32" r="12" /><path d="M46 25v7l5 3" /></g>}
      {studying && (
        <g {...line}>
          <circle cx="30" cy="26" r="8" />
          <path d="M22 24c5 2 11 2 16 0" />
          <path d="M16 50v-4a14 14 0 0 1 28 0v4" />
        </g>
      )}
      {heat === 'dots' && (
        <g className="dots" fill={color} stroke="none">
          <circle cx="14" cy="14" r="1.8" /><circle cx="20" cy="10" r="1.8" /><circle cx="8" cy="20" r="1.8" />
          <circle cx="20" cy="17" r="1.8" /><circle cx="14" cy="21" r="1.8" /><circle cx="26" cy="12" r="1.8" />
        </g>
      )}
      {heat === 'fire' && (
        <g className="flame" {...line} strokeWidth="2.6">
          <path d="M30 17c-9-5-10-12-4-19 1 5 5 6 6 2 5 4 6 11-2 17z" transform="translate(0 2)" />
          <path d="M30 14c-3-2-3-5 0-9 3 3 3 6 0 9z" transform="translate(0 2)" />
        </g>
      )}
    </svg>
  );
}
