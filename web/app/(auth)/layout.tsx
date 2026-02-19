export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-bg text-fg flex items-center justify-center px-1 sm:p-6">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
