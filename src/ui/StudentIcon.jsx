// A small customisable student for the pod space. Pure SVG: a style, a shirt colour and a skin tone.
// States: studying (full colour), break (grey), idle (faded). After 2 hours of study today, wavy heat lines rise
// above the head; after 5 hours, a flame burns there.
const INK = '#1F2328';

export const ICON_STYLES = [
  { id: 'short', label: 'Short hair' },
  { id: 'curly', label: 'Curly hair' },
  { id: 'long', label: 'Long hair' },
  { id: 'cap', label: 'Cap' },
  { id: 'glasses', label: 'Glasses' },
  { id: 'wrap', label: 'Head wrap' },
];
export const ICON_COLORS = ['#1F5C4D', '#2F63C4', '#6B3FB5', '#C2457F', '#7D2E3F', '#2B8A87', '#B98322', '#566A93'];
export const SKIN_TONES = ['#F6D5B8', '#E8B58B', '#C68B59', '#8D5A3B', '#5B3A29'];
export const DEFAULT_ICON = { style: 'short', color: '#1F5C4D', skin: '#C68B59' };
export const HEAT_WAVES_MIN = 120;
export const HEAT_FIRE_MIN = 300;

const P = { stroke: INK, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' };

function Hair({ style, hair }) {
  switch (style) {
    case 'curly': return <g fill={hair} {...P}><circle cx="22" cy="26" r="7" /><circle cx="32" cy="21" r="8" /><circle cx="42" cy="26" r="7" /><circle cx="19" cy="34" r="5" /><circle cx="45" cy="34" r="5" /></g>;
    case 'long': return <path d="M20 34c-2-14 6-20 12-20s14 6 12 20v14h-6V32H26v16h-6z" fill={hair} {...P} />;
    case 'cap': return <g {...P}><path d="M20 30c0-9 6-13 12-13s12 4 12 13z" fill={hair} /><path d="M40 30h12c0 3-3 5-8 5h-4z" fill={hair} /></g>;
    case 'wrap': return <g {...P}><path d="M19 32c0-10 6-15 13-15s13 5 13 15c-8-3-18-3-26 0z" fill={hair} /><path d="M24 22c6 3 11 3 17 0" fill="none" /></g>;
    case 'glasses':
    case 'short':
    default: return <path d="M20 31c0-9 5-13 12-13s12 4 12 13c-3-4-7-6-12-6s-9 2-12 6z" fill={hair} {...P} />;
  }
}

export default function StudentIcon({ icon = DEFAULT_ICON, state = 'studying', minutes = 0, size = 72, label }) {
  const { style, color, skin } = { ...DEFAULT_ICON, ...(icon || {}) };
  const hair = style === 'cap' || style === 'wrap' ? color : '#2B2118';
  const grey = state === 'break';
  const faded = state === 'idle';
  const heat = state === 'studying' ? (minutes >= HEAT_FIRE_MIN ? 'fire' : minutes >= HEAT_WAVES_MIN ? 'waves' : '') : '';
  const body = grey ? '#9AA0A6' : color;
  return (
    <svg className={`student-icon${grey ? ' is-break' : ''}${faded ? ' is-idle' : ''}`} width={size} height={size} viewBox="0 0 64 72" role="img"
      aria-label={label || `Student, ${state === 'studying' ? 'studying' : state === 'break' ? 'on a break' : 'not studying'}${heat === 'fire' ? ', on fire after five hours' : heat === 'waves' ? ', heating up after two hours' : ''}`}
      style={{ opacity: faded ? 0.45 : 1, overflow: 'visible' }}>
      {heat === 'waves' && (
        <g className="heat-waves" fill="none" stroke="#E07B39" strokeWidth="2.4" strokeLinecap="round">
          <path d="M22 12c-3-3 3-5 0-8" /><path d="M32 12c-3-3 3-5 0-8" /><path d="M42 12c-3-3 3-5 0-8" />
        </g>
      )}
      {heat === 'fire' && (
        <g className="flame">
          <path d="M32 18c-7-5-9-11-3-17 1 5 5 5 6 1 4 4 6 9-3 16z" fill="#F59E0B" stroke="#C2410C" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M32 17c-3-3-3-6-1-9 3 3 5 6 1 9z" fill="#FDE68A" />
        </g>
      )}
      <path d="M12 72c0-14 9-22 20-22s20 8 20 22z" fill={body} {...P} />
      <rect x="28" y="42" width="8" height="9" rx="3" fill={grey ? '#B8BDC2' : skin} {...P} />
      <circle cx="32" cy="34" r="13" fill={grey ? '#B8BDC2' : skin} {...P} />
      <Hair style={style} hair={grey ? '#6B7075' : hair} />
      {style === 'glasses' && <g fill="none" {...P} strokeWidth="1.8"><circle cx="26.5" cy="35" r="4" /><circle cx="37.5" cy="35" r="4" /><path d="M30.5 35h3" /></g>}
      <circle cx="27" cy="35" r="1.5" fill={INK} /><circle cx="37" cy="35" r="1.5" fill={INK} />
      {state === 'studying' ? <path d="M28 41c2 2 6 2 8 0" fill="none" {...P} strokeWidth="1.8" /> : grey ? <path d="M28 42h8" fill="none" {...P} strokeWidth="1.8" /> : <path d="M28 41c2 1.5 6 1.5 8 0" fill="none" {...P} strokeWidth="1.8" />}
      {grey && <text x="46" y="20" fontSize="11" fontWeight="700" fill="#6B7075">z</text>}
    </svg>
  );
}
