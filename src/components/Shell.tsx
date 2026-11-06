import { useEffect, useRef, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { DiscMark, Icon } from "./Icons";

const links = [
  { to: "/", label: "Home", icon: "home" as const, end: true },
  { to: "/courses", label: "Courses", icon: "courses" as const, end: false },
  { to: "/play", label: "Play", icon: "play" as const, end: false },
  { to: "/rounds", label: "Rounds", icon: "rounds" as const, end: false },
  { to: "/stats", label: "Stats", icon: "stats" as const, end: false },
];

function NavLinks({ className, label }: { className?: string; label: string }) {
  return (
    <nav className={className} aria-label={label}>
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
        >
          <Icon name={link.icon} />
          <span>{link.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="app">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <aside className="sidenav">
        <Link className="brand" to="/">
          <DiscMark />
          <span>
            <span className="logo-word">Dolf</span>
            <span className="logo-sub">Disc golf</span>
          </span>
        </Link>
        <NavLinks label="Primary" />
      </aside>
      <header className="mobile-brand">
        <Link className="brand" to="/">
          <DiscMark />
          <span className="logo-word">Dolf</span>
        </Link>
      </header>
      <main id="content" className="main" ref={mainRef}>
        <div className="wrap">{children}</div>
      </main>
      <NavLinks className="tabbar" label="Mobile" />
    </div>
  );
}
