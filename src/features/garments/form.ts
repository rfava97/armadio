import type { Category } from '@/lib/garments'

export type FormValues = { name: string; category: Category | null; color: string | null; tags: string[] }

export const isFormComplete = (v: FormValues) => v.name.trim().length > 0 && v.category !== null
