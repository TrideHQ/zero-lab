// The backdrop: an atom that turns slowly behind every page. It is fixed to the
// window, so content scrolls over it. Pure SVG (no 3D engine), and it sits still
// in Lite mode or when the device asks for reduced motion.
export function atomBackdrop(still: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = 'atom-bg';
  el.setAttribute('aria-hidden', 'true');
  const orbit = (rot: number, dur: number, begin: number, color: string) => {
    const path = 'M170,0 A170,60 0 1,1 -170,0 A170,60 0 1,1 170,0';
    const move = still ? '' : `<animateMotion dur="${dur}s" begin="-${begin}s" repeatCount="indefinite" path="${path}"/>`;
    return `<g transform="rotate(${rot})">
      <path d="${path}" fill="none" stroke="url(#orb)" stroke-width="1.4"/>
      <g ${still ? 'transform="translate(170,0)"' : ''}><circle r="13" fill="${color}" opacity=".22" filter="url(#soft)"/><circle r="5" fill="${color}"/>${move}</g>
    </g>`;
  };
  const nucleon = (x: number, y: number, c: string) => `<circle cx="${x}" cy="${y}" r="11" fill="url(#${c})"/>`;
  el.innerHTML = `<svg viewBox="-210 -210 420 420" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="orb" x1="0" x2="1"><stop offset="0" stop-color="#36e3ff" stop-opacity=".75"/><stop offset=".5" stop-color="#36e3ff" stop-opacity=".12"/><stop offset="1" stop-color="#36e3ff" stop-opacity=".75"/></linearGradient>
      <radialGradient id="p" cx=".35" cy=".3"><stop offset="0" stop-color="#ffe2b0"/><stop offset="1" stop-color="#ff9a2e"/></radialGradient>
      <radialGradient id="n" cx=".35" cy=".3"><stop offset="0" stop-color="#c9f6ff"/><stop offset="1" stop-color="#1fb6d6"/></radialGradient>
      <radialGradient id="halo"><stop offset="0" stop-color="#36e3ff" stop-opacity=".38"/><stop offset="1" stop-color="#36e3ff" stop-opacity="0"/></radialGradient>
      <filter id="soft" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="5"/></filter>
    </defs>
    <g class="atom-spin">
      <circle r="120" fill="url(#halo)"/>
      ${orbit(0, 7, 0, '#ffb347')}${orbit(60, 9, 3, '#36e3ff')}${orbit(120, 11, 6, '#e8f7ff')}
      <g class="nucleus">${nucleon(-9, -7, 'p')}${nucleon(10, -9, 'n')}${nucleon(-11, 10, 'n')}${nucleon(9, 9, 'p')}${nucleon(0, 0, 'p')}</g>
    </g>
  </svg>`;
  return el;
}
