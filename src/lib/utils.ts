import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Le dimensioni di testo del design system (index.css) vanno dichiarate: altrimenti tailwind-merge
// scambia "text-body" per un colore e scarta il colore vero (es. text-on-accent sui pulsanti).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['screen-title', 'sheet-title', 'label', 'body', 'card', 'caption', 'overline'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
