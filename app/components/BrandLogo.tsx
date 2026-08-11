import Link from "next/link";
import { Sigma } from "lucide-react";

type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className = "wordmark" }: BrandLogoProps) {
  return (
    <Link aria-label="丐院首页" className={className} href="/">
      <span className="brand-mark">
        <Sigma aria-hidden="true" size={19} strokeWidth={2.3} />
      </span>
      <span className="brand-name">丐院</span>
    </Link>
  );
}
