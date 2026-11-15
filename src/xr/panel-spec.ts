// What a screen shows on the in-headset panels. The same description drives the
// VR canvas panels; the browser and phone-AR modes use the normal HTML UI.
export interface PanelButton { id: string; label: string; primary?: boolean; disabled?: boolean; pressed?: boolean; on: () => void }
export interface PanelSpec {
  title: string;
  badge?: string;
  body: string[];
  equation?: string;
  table?: { head: string[]; rows: string[][]; flags?: number[] };
  buttons: PanelButton[];
  footer?: string;
}
export interface XRApp {
  /** Left panel: explanation card, or the practical's steps and controls. */
  main(): PanelSpec;
  /** Right panel: a diagram / graph image, or a second panel (results table, mark sheet). */
  side?(): PanelSpec | null;
  sideImage?(): CanvasImageSource | null;
  /** Speech from the lab partner, shown beside the bench. */
  speech?(): string;
  /** A part was pointed at and pinched (name from the template's pick targets, or null). */
  onPoint?(name: string | null, local: import('three').Vector3 | null): void;
  onSwipe?(dir: 1 | -1): void;
  /** True when a pinch anywhere on the model's plane should be reported (e.g. placing pins). */
  pointAnywhere?(): boolean;
  /** Bumped by the screen whenever its panels need redrawing. */
  version: number;
}
