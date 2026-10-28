import { Header } from "@/components/layout/header";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Header />
      {children}
    </>
  );
}
