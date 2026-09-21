import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { SeaCapabilities } from "./types.js";

function getRequire(): NodeRequire | null {
  if (typeof require === "function") {
    return require;
  }
  try {
    const fileUrl =
      (typeof import.meta !== "undefined" && import.meta?.url) ||
      (typeof __filename !== "undefined" && pathToFileURL(__filename).href) ||
      pathToFileURL(process.execPath).href;
    return createRequire(fileUrl);
  } catch {
    return null;
  }
}

export function checkSeaCapabilities(): SeaCapabilities {
  const nodeVersion = process.version;
  const match = nodeVersion.match(/^v(\d+)\./);
  const majorVersion = match ? parseInt(match[1], 10) : 0;

  const notes: string[] = [];

  // SEA is officially supported starting from Node 20.x, enhanced in 22+, 24+
  const supported = majorVersion >= 20;

  if (!supported) {
    notes.push(
      `Current Node.js version (${nodeVersion}) does not have modern SEA capabilities.`
    );
  }

  // Check postject availability
  let hasPostject = true;
  try {
    const req = getRequire();
    if (req) {
      req.resolve("postject");
    } else {
      hasPostject = false;
    }
  } catch {
    hasPostject = false;
    notes.push("postject package not found in dependency tree.");
  }

  // Check codesign on macOS
  let hasCodesign = false;
  if (process.platform === "darwin") {
    try {
      execSync("which codesign", { stdio: "ignore" });
      hasCodesign = true;
    } catch {
      hasCodesign = false;
      notes.push("macOS codesign utility not found on PATH.");
    }
  } else {
    hasCodesign = true;
  }

  // Check experimental-sea-config flag
  let hasExperimentalSeaConfig = false;
  try {
    const helpOutput = execSync(`"${process.execPath}" --help`, {
      encoding: "utf8",
    });
    hasExperimentalSeaConfig = helpOutput.includes("--experimental-sea-config");
  } catch {
    hasExperimentalSeaConfig = majorVersion >= 20;
  }

  return {
    supported,
    nodeVersion,
    majorVersion,
    hasExperimentalSeaConfig,
    hasPostject,
    hasCodesign,
    recommendedVersion: "Node 22.x or 24.x+",
    notes,
  };
}
