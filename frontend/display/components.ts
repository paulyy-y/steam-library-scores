import type { ScoreCell } from '../scores/types';

const CONTAINER_ID = 'steam-library-scores';

// Builds the score strip. Without cells it shows a loading state.
// Text goes in through textContent so nothing from Steam's pages is parsed as HTML.
export function createDisplay(doc: Document, cells?: ScoreCell[]): HTMLElement {
  const container = doc.createElement('div');
  container.id = CONTAINER_ID;
  const list = doc.createElement('ul');
  container.appendChild(list);

  if (!cells) {
    const item = doc.createElement('li');
    const label = doc.createElement('p');
    label.className = 'ls-label';
    label.textContent = 'Loading scores...';
    item.appendChild(label);
    list.appendChild(item);
    return container;
  }

  for (const cell of cells) {
    const item = doc.createElement('li');
    item.className = 'ls-cell';
    item.dataset.key = cell.key;
    item.dataset.tone = cell.tone;
    item.title = cell.tooltip;

    const value = doc.createElement('p');
    value.className = 'ls-value';
    value.textContent = cell.value;
    const label = doc.createElement('p');
    label.className = 'ls-label';
    label.textContent = cell.label;
    item.append(value, label);

    const href = cell.href;
    if (href) {
      item.classList.add('ls-link');
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(href);
      });
    }
    list.appendChild(item);
  }
  return container;
}

export function getExistingDisplay(doc: Document): HTMLElement | null {
  return doc.getElementById(CONTAINER_ID);
}

export function removeExistingDisplay(doc: Document): void {
  doc.getElementById(CONTAINER_ID)?.remove();
}
