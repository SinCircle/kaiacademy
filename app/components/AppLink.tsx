import type { AnchorHTMLAttributes } from "react";

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
};

// Vinext 1.0 beta currently drops navigation exports from its production
// client bundle. A native anchor keeps every route usable until that runtime
// bug is fixed, while preserving the same public component API and styling.
export function AppLink({ children, href, ...props }: AppLinkProps) {
  return <a href={href} {...props}>{children}</a>;
}
