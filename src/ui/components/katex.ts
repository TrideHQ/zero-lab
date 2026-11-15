/** Render TeX into an element. KaTeX loads on first use; plain text is the fallback. */
export async function renderTex(el: HTMLElement, tex: string, display = true) {
  el.textContent = tex;
  try {
    const [{ default: katex }] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')]);
    katex.render(tex, el, { displayMode: display, throwOnError: false, output: 'html' });
  } catch {
    el.textContent = texToText(tex);
  }
}

/** Rough TeX -> readable text, for places KaTeX cannot draw (XR canvas panels, copied summaries). */
export function texToText(tex: string): string {
  return tex
    .replace(/\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
    .replace(/\\text\{([^{}]*)\}/g, '$1')
    .replace(/\\sin/g, 'sin').replace(/\\cos/g, 'cos').replace(/\\tan/g, 'tan')
    .replace(/\\theta/g, 'θ').replace(/\\pi/g, 'π').replace(/\\lambda/g, 'λ').replace(/\\Omega/g, 'Ω').replace(/\\Delta/g, 'Δ')
    .replace(/\\times/g, '×').replace(/\\approx/g, '≈').replace(/\\propto/g, '∝').replace(/\\cdot/g, '·').replace(/\\,/g, ' ')
    .replace(/_\{?1\}?/g, '₁').replace(/_\{?2\}?/g, '₂').replace(/\^\{?2\}?/g, '²')
    .replace(/_\{([^{}]*)\}/g, '$1').replace(/[{}\\]/g, '')
    .replace(/\s+/g, ' ').trim();
}
