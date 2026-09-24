import fs from "node:fs";
import path from "node:path";
import { fileExistsSync } from "./fs.js";

/**
 * Parses the contents of a .env file into key-value pairs.
 * Handles quotes, comments (#), export statements, and escaped characters.
 */
export function parseDotenv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (let line of lines) {
    line = line.trim();

    // Skip empty lines or pure comment lines
    if (!line || line.startsWith("#")) {
      continue;
    }

    // Strip leading "export " if present
    if (line.startsWith("export ")) {
      line = line.slice(7).trim();
    }

    const equalIndex = line.indexOf("=");
    if (equalIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalIndex).trim();
    if (!key || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      continue;
    }

    let value = line.slice(equalIndex + 1).trim();

    // Handle double-quoted values
    if (value.startsWith('"')) {
      const endQuoteIndex = value.indexOf('"', 1);
      if (endQuoteIndex !== -1) {
        value = value.slice(1, endQuoteIndex);
      } else {
        value = value.slice(1);
      }
      value = value
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"');
    }
    // Handle single-quoted values (literal, no escape expansion)
    else if (value.startsWith("'")) {
      const endQuoteIndex = value.indexOf("'", 1);
      if (endQuoteIndex !== -1) {
        value = value.slice(1, endQuoteIndex);
      } else {
        value = value.slice(1);
      }
    }
    // Handle unquoted values (strip trailing inline comments)
    else {
      const commentIndex = value.indexOf("#");
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    result[key] = value;
  }

  return result;
}

/**
 * Loads and parses a .env file from disk if it exists.
 */
export function loadDotenvFile(filePath: string): Record<string, string> {
  const resolved = path.resolve(filePath);
  if (!fileExistsSync(resolved)) {
    return {};
  }
  const content = fs.readFileSync(resolved, "utf8");
  return parseDotenv(content);
}

/**
 * Parses command-line KEY=VALUE or KEY="VALUE" pairs.
 */
export function parseKeyValuePairs(items?: string | string[]): Record<string, string> {
  if (!items) return {};
  const list = Array.isArray(items) ? items : [items];
  const result: Record<string, string> = {};

  for (const item of list) {
    if (!item || typeof item !== "string") continue;
    const eqIdx = item.indexOf("=");
    if (eqIdx === -1) {
      // If no '=' provided, take the key from process.env if available
      const key = item.trim();
      if (key && process.env[key] !== undefined) {
        result[key] = process.env[key]!;
      }
    } else {
      const key = item.slice(0, eqIdx).trim();
      let val = item.slice(eqIdx + 1);
      // Strip surrounding quotes if present
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key) {
        result[key] = val;
      }
    }
  }

  return result;
}

/**
 * Converts an env object ({ FOO: "bar", PORT: 3000 }) into esbuild define format:
 * { "process.env.FOO": JSON.stringify("bar"), "process.env.PORT": JSON.stringify("3000") }
 */
export function formatEnvForDefine(env: Record<string, any>): Record<string, string> {
  const define: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    define[`process.env.${key}`] = JSON.stringify(String(value));
  }
  return define;
}
