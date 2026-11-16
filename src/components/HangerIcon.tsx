import type { SVGProps } from 'react'

// lucide-react non ha una gruccia: icona disegnata con le stesse regole (24×24, stroke 2, round).
export function HangerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9.5 6.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V11" />
      <path d="M12 11 2.8 17.2A1 1 0 0 0 3.4 19h17.2a1 1 0 0 0 .6-1.8Z" />
    </svg>
  )
}
