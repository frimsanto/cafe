import type { SVGProps } from 'react'

type IkonProps = SVGProps<SVGSVGElement>

function Dasar({ children, ...props }: IkonProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export const IkonDashboard = (props: IkonProps) => (
  <Dasar {...props}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </Dasar>
)

export const IkonTenant = (props: IkonProps) => (
  <Dasar {...props}>
    <path d="M3 21V7l6-3v17" />
    <path d="M9 10h9a2 2 0 0 1 2 2v9" />
    <path d="M13 21v-4h3v4" />
    <path d="M2 21h20" />
  </Dasar>
)

export const IkonBilling = (props: IkonProps) => (
  <Dasar {...props}>
    <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
    <path d="M2.5 10h19" />
    <path d="M6 14.5h4" />
  </Dasar>
)

export const IkonAplikasi = (props: IkonProps) => (
  <Dasar {...props}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </Dasar>
)

export const IkonBroadcast = (props: IkonProps) => (
  <Dasar {...props}>
    <path d="M4 9v6h3l6 4V5L7 9H4z" />
    <path d="M17 8.5a4.5 4.5 0 0 1 0 7" />
  </Dasar>
)

export const IkonMenu = (props: IkonProps) => (
  <Dasar {...props}>
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h16" />
  </Dasar>
)

export const IkonTutup = (props: IkonProps) => (
  <Dasar {...props}>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </Dasar>
)

export const IkonMatahari = (props: IkonProps) => (
  <Dasar {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Dasar>
)

export const IkonBulan = (props: IkonProps) => (
  <Dasar {...props}>
    <path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5z" />
  </Dasar>
)

export const IkonCekLingkaran = (props: IkonProps) => (
  <Dasar {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.2l2.4 2.4 4.6-4.9" />
  </Dasar>
)

export const IkonJedaLingkaran = (props: IkonProps) => (
  <Dasar {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 9.5v5M14 9.5v5" />
  </Dasar>
)

export const IkonNaik = (props: IkonProps) => (
  <Dasar {...props}>
    <path d="M5 15l6-6 4 4 5-5" />
    <path d="M20 12V8h-4" />
  </Dasar>
)

export const IkonTurun = (props: IkonProps) => (
  <Dasar {...props}>
    <path d="M5 9l6 6 4-4 5 5" />
    <path d="M20 12v4h-4" />
  </Dasar>
)
