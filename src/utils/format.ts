import pc from "picocolors";

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val < 10 && i > 0 ? val.toFixed(1) : Math.round(val)} ${sizes[i]}`;
}

export const symbols = {
  success: pc.green("✓"),
  warning: pc.yellow("⚠"),
  error: pc.red("✖"),
  info: pc.blue("ℹ"),
  bullet: pc.dim("•"),
  arrow: pc.cyan("→"),
};

export interface KeyValueRow {
  key: string;
  value: string;
  status?: "success" | "warning" | "error" | "info" | "dim";
}

export function formatKeyValueSection(title: string, rows: KeyValueRow[], padWidth = 24): string {
  const lines: string[] = [];
  if (title) {
    lines.push(pc.bold(title));
    lines.push("");
  }
  for (const row of rows) {
    const paddedKey = row.key.padEnd(padWidth, " ");
    let valStr = row.value;
    if (row.status === "success") {
      valStr = `${symbols.success} ${row.value}`;
    } else if (row.status === "warning") {
      valStr = `${symbols.warning} ${pc.yellow(row.value)}`;
    } else if (row.status === "error") {
      valStr = `${symbols.error} ${pc.red(row.value)}`;
    } else if (row.status === "info") {
      valStr = `${symbols.info} ${pc.cyan(row.value)}`;
    } else if (row.status === "dim") {
      valStr = pc.dim(row.value);
    }
    lines.push(`  ${pc.dim(paddedKey)} ${valStr}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function formatHeader(title: string, subtitle?: string): string {
  const lines: string[] = [pc.bold(pc.cyan(`\n  Yekpare ${title}`))];
  if (subtitle) {
    lines.push(pc.dim(`  ${subtitle}`));
  }
  lines.push("");
  return lines.join("\n");
}
