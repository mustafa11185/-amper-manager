export const MONTHS = [
  { num: 1, ar: 'يناير', local: 'كانون الثاني' },
  { num: 2, ar: 'فبراير', local: 'شباط' },
  { num: 3, ar: 'مارس', local: 'آذار' },
  { num: 4, ar: 'أبريل', local: 'نيسان' },
  { num: 5, ar: 'مايو', local: 'أيار' },
  { num: 6, ar: 'يونيو', local: 'حزيران' },
  { num: 7, ar: 'يوليو', local: 'تموز' },
  { num: 8, ar: 'أغسطس', local: 'آب' },
  { num: 9, ar: 'سبتمبر', local: 'أيلول' },
  { num: 10, ar: 'أكتوبر', local: 'تشرين الأول' },
  { num: 11, ar: 'نوفمبر', local: 'تشرين الثاني' },
  { num: 12, ar: 'ديسمبر', local: 'كانون الأول' },
]

export function formatBillingMonth(month: number, year: number): string {
  const m = MONTHS.find(x => x.num === month)
  return m ? `${m.local} ${month} — ${year}` : `${month}/${year}`
}

export function monthName(month: number): string {
  const m = MONTHS.find(x => x.num === month)
  return m ? `${m.local} ${month}` : `${month}`
}
