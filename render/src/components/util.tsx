import React from "react";
import { staticFile } from "remotion";

/** Resolve a public-relative asset path to a staticFile URL, or null if absent. */
export function asset(path?: string | null): string | null {
  if (!path) return null;
  // Already an absolute/remote URL — pass through.
  if (/^(https?:)?\/\//.test(path) || path.startsWith("data:")) return path;
  return staticFile(path);
}

/**
 * Split a metric display string into { prefix, number, suffix } so a counter can
 * animate just the numeric part. "1,200" -> {0,1200,''}; "$4.2M" -> {'$',4.2,'M'};
 * "92%" -> {'',92,'%'}. Returns null number when no digits are present.
 */
export function parseMetric(value: string): {
  prefix: string;
  number: number | null;
  decimals: number;
  suffix: string;
} {
  const m = value.match(/^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/);
  if (!m) return { prefix: value, number: null, decimals: 0, suffix: "" };
  const raw = m[2].replace(/,/g, "");
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  return { prefix: m[1], number: parseFloat(raw), decimals, suffix: m[3] };
}

export function formatNumber(n: number, decimals: number): string {
  const fixed = n.toFixed(decimals);
  const [int, dec] = fixed.split(".");
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec ? `${withCommas}.${dec}` : withCommas;
}

/** Neo-brutalist offset shadow used across the trailer. */
export function popShadow(ink: string, size = 10): string {
  return `${size}px ${size}px 0 ${ink}`;
}
