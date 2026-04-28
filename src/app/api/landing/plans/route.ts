import { NextResponse } from 'next/server'

// Aligned with manager-app /api/plan + company-admin /api/plans.
// `price_monthly_iqd` is the per-month rate when billing 3 months
// (the marketed monthly price). 3-month minimum, no monthly billing.
const PLANS = [
  { key:'starter',   name_ar:'المبتدئة',   price_monthly_iqd:0,     max_generators:1,  max_subscribers:30,   color:'#374151', is_featured:false, sort_order:0 },
  { key:'pro',       name_ar:'الاحترافية', price_monthly_iqd:22000, max_generators:2,  max_subscribers:150,  color:'#1B4FD8', is_featured:false, sort_order:1 },
  { key:'business',  name_ar:'الأعمال',    price_monthly_iqd:35000, max_generators:5,  max_subscribers:500,  color:'#D97706', is_featured:true,  sort_order:2 },
  { key:'corporate', name_ar:'المؤسسات',   price_monthly_iqd:55000, max_generators:15, max_subscribers:2000, color:'#0F766E', is_featured:false, sort_order:3 },
  { key:'fleet',     name_ar:'الأسطول',    price_monthly_iqd:0,     max_generators:0,  max_subscribers:0,    color:'#7C3AED', is_featured:false, sort_order:4 },
]

export async function GET() {
  return NextResponse.json({ plans: PLANS })
}
