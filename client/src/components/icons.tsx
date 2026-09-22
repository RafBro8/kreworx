import type { ReactNode } from "react";

/**
 * One stroke weight, one join style, one size by default - the icons are
 * meant to disappear into the interface rather than decorate it.
 */
function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const CalendarIcon = (props: { size?: number }) => (
  <Icon {...props}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18M8 2v4M16 2v4" />
  </Icon>
);

export const TruckIcon = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M3 7h13l5 5v5h-3" />
    <circle cx="7" cy="17" r="2" />
    <circle cx="17" cy="17" r="2" />
    <path d="M9 17h6" />
  </Icon>
);

export const ChartIcon = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Icon>
);

export const PeopleIcon = (props: { size?: number }) => (
  <Icon {...props}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    <path d="M16 5.5a3.2 3.2 0 0 1 0 6M17.5 20c0-2.4-.8-4.2-2.2-5.3" />
  </Icon>
);

export const ReceiptIcon = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M5 3h14v18l-3-1.6-2.5 1.6L11 19.4 8.5 21 6 19.4 5 21z" />
    <path d="M9 8h6M9 12h6" />
  </Icon>
);

export const SearchIcon = (props: { size?: number }) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Icon>
);

export const PhoneIcon = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1.1 1A16 16 0 0 1 4 5.1 1 1 0 0 1 5 4z" />
  </Icon>
);

export const ArrowLeftIcon = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);
