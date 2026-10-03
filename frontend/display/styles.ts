// Mirrors the HLTB box (bottom-right of the hero) on the bottom-left.
// Tone colours are Steam's review colours.
const STYLES = `
#steam-library-scores {
  position: absolute;
  left: 0;
  bottom: 0;
  width: fit-content;
  z-index: 100;
}

#steam-library-scores ul {
  list-style: none;
  margin: 0;
  padding: 8px 20px;
  display: flex;
  align-items: center;
  background: rgba(14, 20, 27, 0.85);
}

#steam-library-scores li {
  text-align: center;
  padding: 0 10px;
}

#steam-library-scores p {
  margin: 0;
  color: #ffffff;
}

#steam-library-scores .ls-value {
  font-size: 16px;
  font-weight: bold;
}

#steam-library-scores .ls-label {
  text-transform: uppercase;
  font-size: 10px;
  opacity: 0.7;
}

#steam-library-scores [data-tone="positive"] .ls-value { color: #66c0f4; }
#steam-library-scores [data-tone="mixed"] .ls-value { color: #b9a074; }
#steam-library-scores [data-tone="negative"] .ls-value { color: #a34c25; }
#steam-library-scores [data-tone="none"] .ls-value { opacity: 0.6; }

#steam-library-scores .ls-link { cursor: pointer; }
#steam-library-scores .ls-link:hover .ls-label { opacity: 1; }
`;

const STYLE_ID = 'steam-library-scores-styles';

export function injectStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  doc.head.appendChild(style);
}

export function removeStyles(doc: Document): void {
  doc.getElementById(STYLE_ID)?.remove();
}
