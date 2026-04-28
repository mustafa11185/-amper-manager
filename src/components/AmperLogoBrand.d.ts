import * as React from 'react'

export interface AmperLogoBrandProps {
  variant?: 'dark' | 'light' | 'gold' | 'teal' | 'icon' | 'arabic'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showTagline?: boolean
  width?: number
  className?: string
  style?: React.CSSProperties
}

declare const AmperLogoBrand: React.FC<AmperLogoBrandProps>
export default AmperLogoBrand

export const AmperIcon: React.FC<{ size?: number; colors?: any }>
export const AmperLogoBrandFull: React.FC<{ colors: any; width?: number; showTagline?: boolean }>
export const AmperLogoBrandArabic: React.FC<{ colors: any; width?: number }>
export const VARIANTS: Record<string, any>
export const SIZES: Record<string, any>
