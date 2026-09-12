'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  return <Link href={href} className={path.startsWith(href) ? 'active' : ''}>{children}</Link>;
}
