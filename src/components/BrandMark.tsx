import { BRAND_GREEN } from '@/lib/brand';

interface Props {
  size?: number;
  className?: string;
  title?: string;
}

export default function BrandMark({ size = 36, className = '', title = 'ProntoFarmacie' }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      role="img"
      aria-label={title}
    >
      <circle cx="16" cy="16" r="16" fill={BRAND_GREEN} />
      <rect x="14" y="6" width="4" height="20" rx="0.75" fill="#ffffff" />
      <rect x="6" y="14" width="20" height="4" rx="0.75" fill="#ffffff" />
    </svg>
  );
}
