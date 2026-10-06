// Dates are "YYYY-MM-DD" strings in the server's local time – the same as the frontend.

export const toISO = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export const parseISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const todayISO = () => toISO(new Date());

export const addDays = (iso, n) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

// 0 = Monday … 6 = Sunday
export const weekdayIndex = (iso) => (parseISO(iso).getDay() + 6) % 7;

// Monday of the week that contains `iso`
export const startOfWeek = (iso) => addDays(iso, -weekdayIndex(iso));

export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);