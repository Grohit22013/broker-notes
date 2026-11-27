export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-page flex justify-center py-8 md:py-16">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
