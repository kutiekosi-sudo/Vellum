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
      {/* desk lamp: stepped base, gooseneck stem, domed shade turned towards the desk */}
      {state !== 'break' && (
        <g {...line} strokeWidth="2.6">
          <rect x="51" y="44" width="20" height="6" rx="2" />
          <rect x="54.5" y="39" width="13" height="5" rx="2" />
          <path d="M61 39V26c0-6-2-9-7-10" />
          <circle cx="53" cy="14" r="3.2" />
          <g transform="translate(46 20) rotate(28)"><path d="M-9 0a9 9 0 0 1 18 0z" /></g>
        </g>
      )}
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
        <g className="flame" transform="translate(23.6 1.8) scale(.12)" fill={color} stroke="none">
          <path fillRule="evenodd" d="M52 0C62 18 78 32 84 56C86 50 89 44 92 38C97 70 94 104 70 126C55 138 30 135 18 112C8 90 10 65 20 50C17 47 15 44 14 42C22 44 26 48 28 56C30 40 44 20 52 0ZM50 62C62 80 68 96 66 112C60 122 40 124 34 112C30 100 36 88 40 84C42 90 44 92 46 90C44 80 46 68 50 62Z" />
        </g>
      )}
    </svg>
  );
}
