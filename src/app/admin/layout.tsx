import { ThemeToggle } from "@/components/ThemeToggle";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh">
      <AdminSidebar />

      <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="absolute top-4 right-6 z-10">
          <ThemeToggle />
        </div>
        <div className="w-full px-8 pt-14 pb-6 lg:px-12">{children}</div>
      </main>
    </div>
  );
}
