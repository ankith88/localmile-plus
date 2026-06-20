
const toDateStr = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const isPublicHoliday = (dateInput: Date | string, rawState?: string): boolean => {
  const dateStr = typeof dateInput === 'string' ? dateInput : toDateStr(dateInput);
  const state = (rawState || '').trim().toUpperCase();

  const monthDay = dateStr.substring(5); // 'MM-DD'
  const year = dateStr.substring(0, 4);

  // National / Fixed Public Holidays
  const fixedHolidays = ['01-01', '01-26', '04-25', '12-25', '12-26'];
  if (fixedHolidays.includes(monthDay)) {
    return true;
  }

  // 2026 holidays
  if (year === '2026') {
    if (monthDay === '12-28') return true; // Boxing Day substitute
    if (monthDay === '04-03' || monthDay === '04-06') return true; // Good Friday, Easter Monday

    if (state === 'VIC') {
      if (['03-09', '09-25', '11-03'].includes(monthDay)) return true;
    }
    if (state === 'NSW' || state === 'ACT' || state === 'SA') {
      if (monthDay === '10-05') return true;
    }
    if (state === 'QLD') {
      if (['05-04', '10-05'].includes(monthDay)) return true;
    }
    if (state === 'WA') {
      if (['03-02', '06-01', '09-28'].includes(monthDay)) return true;
    }
    if (state === 'SA') {
      if (monthDay === '03-09') return true;
    }
    if (state === 'ACT') {
      if (monthDay === '03-09') return true;
    }
    if (['VIC', 'NSW', 'SA', 'ACT', 'TAS', 'NT'].includes(state)) {
      if (monthDay === '06-08') return true;
    }
  }

  // 2027 holidays
  if (year === '2027') {
    if (monthDay === '12-27' || monthDay === '12-28') return true; // Christmas/Boxing substitute
    if (monthDay === '03-26' || monthDay === '03-29') return true; // Good Friday, Easter Monday

    if (state === 'VIC') {
      if (['03-08', '09-24', '11-02'].includes(monthDay)) return true;
    }
    if (state === 'NSW' || state === 'ACT' || state === 'SA') {
      if (monthDay === '10-04') return true;
    }
    if (state === 'QLD') {
      if (['05-03', '10-04'].includes(monthDay)) return true;
    }
    if (state === 'WA') {
      if (['03-01', '06-07', '09-27'].includes(monthDay)) return true;
    }
    if (state === 'SA') {
      if (monthDay === '03-08') return true;
    }
    if (state === 'ACT') {
      if (monthDay === '03-08') return true;
    }
    if (['VIC', 'NSW', 'SA', 'ACT', 'TAS', 'NT'].includes(state)) {
      if (monthDay === '06-14') return true;
    }
  }

  return false;
};
