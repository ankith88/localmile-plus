import { addDays, isWeekend, setHours, setMinutes, setSeconds, setMilliseconds, isBefore, startOfDay } from 'date-fns';

/**
 * Calculates the default booking date based on the 12:00 PM cutoff.
 * If before 12:00 PM, returns today.
 * If after 12:00 PM (or today is a weekend), returns the next business day.
 */
export const getDefaultBookingDate = (now: Date = new Date()): Date => {
  const cutoff = setHours(setMinutes(setSeconds(setMilliseconds(now, 0), 0), 0), 12);
  
  let targetDate = now;
  
  if (isBefore(cutoff, now) || isWeekend(now)) {
    targetDate = getNextBusinessDay(now);
  }
  
  return startOfDay(targetDate);
};

/**
 * Gets the next business day (skipping Saturday and Sunday).
 */
export const getNextBusinessDay = (date: Date): Date => {
  let nextDay = addDays(date, 1);
  while (isWeekend(nextDay)) {
    nextDay = addDays(nextDay, 1);
  }
  return nextDay;
};

/**
 * Formats a date for the input[type="date"] field.
 */
export const formatDateForInput = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

/**
 * Parses a YYYY-MM-DD string into a local Date object.
 * This avoids timezone shifts compared to new Date(dateString).
 */
export const parseLocalDate = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/**
 * Returns the short day name (e.g. 'Mon', 'Tue').
 */
export const getDayName = (date: Date): string => {
  return date.toLocaleDateString('en-AU', { weekday: 'short' });
};

/**
 * Calculates the next N occurrences for a recurring schedule.
 */
export const getNextOccurrences = (startDateStr: string, frequency: string[], count: number = 5): string[] => {
  const occurrences: string[] = [];
  
  // Ensure we handle date strings correctly across timezones
  const [year, month, day] = startDateStr.split('-').map(Number);
  const start = startOfDay(new Date(year, month - 1, day));
  let current = start;
  
  const today = startOfDay(new Date());
  if (isBefore(current, today)) {
    current = today;
  }

  // Safety counter to prevent infinite loops
  let safety = 0;
  while (occurrences.length < count && safety < 100) {
    const dayName = getDayName(current);
    if (frequency.includes(dayName)) {
      occurrences.push(formatDateForInput(current));
    }
    current = addDays(current, 1);
    safety++;
  }
  
  return occurrences;
};
