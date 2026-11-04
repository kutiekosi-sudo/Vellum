// The Learnr logo: the mark (cap, book and orbit) above the name written out in cursive.
export default function Logo({ width = 240, once = true }) {
  return (
    <div className="logo" style={{ width }}>
      <img className="logo-mark" src="/logo-mark.webp" alt="" width="500" height="307" />
      <svg className={`logo-svg${once ? ' once' : ''}`} viewBox="0 0 420 150" role="img" aria-label="Learnr">
        <text className="boot-word" x="210" y="108" textAnchor="middle">Learnr</text>
      </svg>
    </div>
  );
}
