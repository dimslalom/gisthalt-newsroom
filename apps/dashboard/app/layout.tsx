import './globals.css';
import { NavLink } from './nav';

export const metadata = { title: 'Newsroom', description: 'Three-feed newsroom control room' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="top">
          <span className="brand"><img src="/gisthalt-logo.png" alt="Gisthalt" width={28} height={31} /></span>
          <div className="nav-links">
          <NavLink href="/design">Design</NavLink>
          <NavLink href="/lab">Template lab</NavLink>
          <NavLink href="/contact-sheet">Contact sheet</NavLink>
          <NavLink href="/review">Review queue</NavLink>
          <NavLink href="/accounts">Accounts</NavLink>
          <NavLink href="/ops">Ops</NavLink>
          </div>
          <span className="spacer" />
          <span className="local-label">Local workspace</span>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
