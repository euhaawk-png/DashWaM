import { brand } from "@/config/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.symbolUrl} alt="" className="h-8 w-auto" />
          <span className="text-3xl font-extrabold tracking-tight text-ink">{brand.productName}</span>
        </div>
        <p className="mt-2 text-sm font-medium text-muted">{brand.tagline}</p>
      </div>
      <div className="card w-full max-w-sm p-6 shadow-sm">{children}</div>
    </div>
  );
}
