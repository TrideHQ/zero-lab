/** A stopwatch that runs on lab time (so it stays honest when the lab is sped up). Reads to 0.01 s. */
export class Stopwatch {
  running = false;
  private t = 0;

  start() { this.running = true; }
  stop() { this.running = false; }
  toggle() { this.running = !this.running; }
  reset() { this.running = false; this.t = 0; }
  tick(labDt: number) { if (this.running) this.t += labDt; }
  /** Seconds, rounded to the stopwatch's resolution. */
  read(): number { return Math.round(this.t * 100) / 100; }
  text(): string {
    const s = this.read();
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
  }
}
