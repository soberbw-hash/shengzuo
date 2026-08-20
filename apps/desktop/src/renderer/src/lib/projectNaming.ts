type DateInput = Date | string | number | undefined;

const padDatePart = (value: number): string => String(value).padStart(2, "0");

const asValidDate = (value: DateInput): Date | null => {
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value ?? NaN);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatLocalDate = (date: Date): string =>
  [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");

export const createDefaultProjectTitle = (date = new Date()): string => {
  const resolved = asValidDate(date) ?? new Date();
  const time = [
    padDatePart(resolved.getHours()),
    padDatePart(resolved.getMinutes()),
    padDatePart(resolved.getSeconds()),
  ].join(":");
  return `${formatLocalDate(resolved)} ${time}`;
};

export const createDefaultVoiceName = (date = new Date()): string =>
  `声音 ${createDefaultProjectTitle(date)}`;

const legacyDateTitle = /^\d{4}-\d{2}-\d{2}$/u;
const automaticDateTimeTitle = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/u;

export const isAutomaticTimeTitle = (title: string | undefined): boolean => {
  const value = title?.trim() ?? "";
  return legacyDateTitle.test(value) || automaticDateTimeTitle.test(value);
};

export const resolveProjectTitle = (
  title: string,
  createdAt: string,
): string => {
  const trimmed = title.trim();
  if (!legacyDateTitle.test(trimmed)) return title;
  const created = asValidDate(createdAt);
  if (!created || trimmed !== formatLocalDate(created)) return title;
  return createDefaultProjectTitle(created);
};

export const resolveResultTitle = (
  projectTitle: string | undefined,
  resultTitle: string | undefined,
  createdAt: string,
  fallback: string,
): string => {
  const source = projectTitle?.trim() || resultTitle?.trim();
  const created = asValidDate(createdAt);
  if (!source) return created ? createDefaultProjectTitle(created) : fallback;
  if (isAutomaticTimeTitle(source)) {
    return created ? createDefaultProjectTitle(created) : source;
  }
  return source;
};
