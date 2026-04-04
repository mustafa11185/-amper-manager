const WEAK_PINS = ['0000','1111','2222','3333','4444','5555','6666','7777','8888','9999','1234','4321','1122','0123','1010']

export function validatePhone(phone: string): string | null {
  const cleaned = phone.replace(/[\s-]/g, '')
  if (!cleaned) return 'رقم الهاتف مطلوب'
  if (cleaned.length < 6) return 'رقم الهاتف قصير جداً'
  if (!/^\d+$/.test(cleaned)) return 'رقم الهاتف يجب أن يحتوي أرقام فقط'
  return null
}

export function validatePin(pin: string): string | null {
  if (!pin || pin.length < 4) return 'PIN يجب أن يكون 4 أرقام على الأقل'
  if (!/^\d+$/.test(pin)) return 'PIN يجب أن يحتوي أرقام فقط'
  if (WEAK_PINS.includes(pin)) return `PIN ضعيف جداً — لا تستخدم ${pin}`
  if (/^(.)\1+$/.test(pin)) return 'PIN لا يمكن أن يكون نفس الرقم مكرراً'
  return null
}
