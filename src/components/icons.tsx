// src/components/icons.tsx
// Iconos SVG inline (estilo línea, stroke = currentColor). Minimalistas y sin
// dependencias externas. Heredan tamaño/color del contexto vía `className`.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1em"
      height="1em"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const UploadCloud = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 13v8" />
    <path d="m8 17 4-4 4 4" />
    <path d="M20 16.7A5 5 0 0 0 18 7h-1.3A8 8 0 1 0 4 15.2" />
  </Base>
);

export const FileText = (p: IconProps) => (
  <Base {...p}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
    <path d="M14 2v5h5" />
    <path d="M9 13h6M9 17h6M9 9h1" />
  </Base>
);

export const Table = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
  </Base>
);

export const Download = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3v12" />
    <path d="m7 11 5 5 5-5" />
    <path d="M5 21h14" />
  </Base>
);

export const Maximize = (p: IconProps) => (
  <Base {...p}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </Base>
);

export const X = (p: IconProps) => (
  <Base {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Base>
);

export const Check = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Base>
);

export const ArrowRight = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Base>
);

export const Eraser = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 21h18" />
    <path d="M8.5 8.5 15 2l7 7-9.5 9.5H7z" />
  </Base>
);

export const StopCircle = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
  </Base>
);

export const Spinner = (p: IconProps) => (
  <Base {...p} className={["animate-spin", p.className].filter(Boolean).join(" ")}>
    <path d="M21 12a9 9 0 1 1-6.2-8.6" />
  </Base>
);

export const Sun = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Base>
);

export const Moon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3a6.4 6.4 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </Base>
);

export const ShieldCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3 5 6v6c0 4 3 6.5 7 8 4-1.5 7-4 7-8V6z" />
    <path d="m9 12 2 2 4-4" />
  </Base>
);

export const AlertTriangle = (p: IconProps) => (
  <Base {...p}>
    <path d="M10.3 4 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </Base>
);

export const Info = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Base>
);
