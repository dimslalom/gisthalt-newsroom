import './globals.css';
import { NavLink } from './nav';

export const metadata = { title: 'Newsroom', description: 'Three-feed newsroom control room' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="top">
          <span className="brand">// Newsroom</span>
          <NavLink href="/lab">Template lab</NavLink>
          <NavLink href="/contact-sheet">Contact sheet</NavLink>
          <NavLink href="/review">Review queue</NavLink>
          <NavLink href="/ops">Ops</NavLink>
          <span className="spacer" />
          <span className="tag">localhost only</span>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
