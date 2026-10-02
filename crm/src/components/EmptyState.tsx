import Link from "next/link";
import { brand } from "@/config/brand";

/* eslint-disable @next/next/no-img-element */

/** Standard empty state: faded brand symbol + instruction + optional action. */
export function EmptyState({
  title,
  text,
  actionHref,
  actionLabel,
}: {
  title: string;
  text: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <img src={brand.symbolUrl} alt="" className="mb-4 h-10 w-auto opacity-20" />
      <h3 className="mb-1 font-semibold">{title}</h3>
      <p className="mb-5 max-w-sm text-sm text-muted">{text}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="btn-primary">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
