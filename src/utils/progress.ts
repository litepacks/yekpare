import pc from "picocolors";
import { symbols } from "./format.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface SpinnerOptions {
  enabled?: boolean;
  indent?: number;
}

export class Spinner {
  private timer: NodeJS.Timeout | null = null;
  private currentFrame = 0;
  private text = "";
  private startTime = 0;
  private isTTY: boolean;
  private enabled: boolean;
  private indent: string;

  constructor(options: SpinnerOptions = {}) {
    this.isTTY = Boolean(process.stdout && process.stdout.isTTY);
    this.enabled = options.enabled !== false;
    this.indent = " ".repeat(options.indent ?? 2);
  }

  public start(text: string): this {
    this.text = text;
    this.startTime = Date.now();

    if (!this.enabled) return this;

    if (this.isTTY) {
      this.currentFrame = 0;
      this.render();
      this.timer = setInterval(() => {
        this.currentFrame = (this.currentFrame + 1) % SPINNER_FRAMES.length;
        this.render();
      }, 80);
    } else {
      process.stdout.write(`${this.indent}${pc.cyan("•")} ${text}...\n`);
    }

    return this;
  }

  public update(text: string): this {
    this.text = text;
    if (this.isTTY && this.enabled) {
      this.render();
    }
    return this;
  }

  public succeed(text?: string, detail?: string): this {
    const msg = text || this.text;
    const elapsed = Date.now() - this.startTime;
    const timeStr = elapsed > 150 ? pc.dim(` (${elapsed}ms)`) : "";
    const detailStr = detail ? ` ${detail}` : "";

    this.stop();
    if (this.enabled) {
      if (this.isTTY) {
        this.clearLine();
        process.stdout.write(`${this.indent}${symbols.success} ${msg}${detailStr}${timeStr}\n`);
      } else {
        process.stdout.write(`${this.indent}${symbols.success} ${msg}${detailStr}${timeStr}\n`);
      }
    }
    return this;
  }

  public warn(text?: string, detail?: string): this {
    const msg = text || this.text;
    const detailStr = detail ? ` ${detail}` : "";

    this.stop();
    if (this.enabled) {
      if (this.isTTY) {
        this.clearLine();
        process.stdout.write(`${this.indent}${symbols.warning} ${pc.yellow(msg)}${detailStr}\n`);
      } else {
        process.stdout.write(`${this.indent}${symbols.warning} ${pc.yellow(msg)}${detailStr}\n`);
      }
    }
    return this;
  }

  public fail(text?: string, detail?: string): this {
    const msg = text || this.text;
    const detailStr = detail ? ` ${detail}` : "";

    this.stop();
    if (this.enabled) {
      if (this.isTTY) {
        this.clearLine();
        process.stdout.write(`${this.indent}${symbols.error} ${pc.red(msg)}${detailStr}\n`);
      } else {
        process.stdout.write(`${this.indent}${symbols.error} ${pc.red(msg)}${detailStr}\n`);
      }
    }
    return this;
  }

  public info(text?: string, detail?: string): this {
    const msg = text || this.text;
    const detailStr = detail ? ` ${detail}` : "";

    this.stop();
    if (this.enabled) {
      if (this.isTTY) {
        this.clearLine();
        process.stdout.write(`${this.indent}${symbols.info} ${pc.cyan(msg)}${detailStr}\n`);
      } else {
        process.stdout.write(`${this.indent}${symbols.info} ${pc.cyan(msg)}${detailStr}\n`);
      }
    }
    return this;
  }

  public stop(): this {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    return this;
  }

  private render(): void {
    if (!this.isTTY || !this.enabled) return;
    const frame = pc.cyan(SPINNER_FRAMES[this.currentFrame]);
    const elapsed = Date.now() - this.startTime;
    const timeStr = elapsed > 500 ? pc.dim(` (${Math.round(elapsed / 1000)}s)`) : "";
    this.clearLine();
    process.stdout.write(`${this.indent}${frame} ${this.text}${timeStr}`);
  }

  private clearLine(): void {
    if (this.isTTY) {
      process.stdout.write("\r\x1b[K");
    }
  }
}

export function createSpinner(options?: SpinnerOptions): Spinner {
  return new Spinner(options);
}

export async function withSpinner<T>(
  text: string,
  task: (spinner: Spinner) => Promise<T>,
  options?: SpinnerOptions
): Promise<T> {
  const spinner = createSpinner(options).start(text);
  try {
    const result = await task(spinner);
    spinner.succeed();
    return result;
  } catch (err: any) {
    spinner.fail(undefined, err.message ? pc.red(`: ${err.message}`) : undefined);
    throw err;
  }
}
