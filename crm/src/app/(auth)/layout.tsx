import { brand } from "@/config/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="mb-8 text-center">
        <div className="text-2xl font-bold tracking-tight">{brand.productName}</div>
        <p className="mt-1 text-sm text-muted">{brand.tagline}</p>
      </div>
      <div className="card w-full max-w-sm p-6 shadow-sm">{children}</div>
    </div>
  );
}
