export type LanguageOrigin = "track" | "manual" | "unknown";

export function normalizeLanguageTag(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = value.trim().replace(/_/g, "-").split("-");
  if (!parts[0] || !/^[A-Za-z]{2,3}$/.test(parts[0]) || parts[0].toLowerCase() === "und")
    return null;
  const normalized = [parts[0].toLowerCase()];
  for (const part of parts.slice(1)) {
    if (/^[A-Za-z]{4}$/.test(part))
      normalized.push(part[0]!.toUpperCase() + part.slice(1).toLowerCase());
    else if (/^[A-Za-z]{2}$/.test(part)) normalized.push(part.toUpperCase());
    else if (/^\d{3}$/.test(part)) normalized.push(part);
    else if (/^[A-Za-z0-9]{5,8}$/.test(part)) normalized.push(part.toLowerCase());
    else return null;
  }
  return normalized.join("-");
}

export function baseLanguage(value: string): string | null {
  return normalizeLanguageTag(value)?.split("-")[0] ?? null;
}

export function shouldTranslate(
  source: string,
  target: string,
  explicitRegionalOverride: boolean,
): boolean {
  const normalizedSource = normalizeLanguageTag(source);
  const normalizedTarget = normalizeLanguageTag(target);
  if (!normalizedSource || !normalizedTarget) return false;
  if (baseLanguage(normalizedSource) !== baseLanguage(normalizedTarget)) return true;
  return explicitRegionalOverride && normalizedSource !== normalizedTarget;
}

export function resolveSourceLanguage(input: {
  mode: "track" | "manual";
  trackLanguage: string | null;
  manualLanguage: string | null;
}): { language: string | null; origin: LanguageOrigin } {
  if (input.mode === "manual") {
    const language = normalizeLanguageTag(input.manualLanguage);
    return language ? { language, origin: "manual" } : { language: null, origin: "unknown" };
  }
  const language = normalizeLanguageTag(input.trackLanguage);
  return language ? { language, origin: "track" } : { language: null, origin: "unknown" };
}
