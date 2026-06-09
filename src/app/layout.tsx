import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Heroes 3 Board Game Multi",
  description: "Non-profit fan multiplayer tool foundation for Heroes 3: The Board Game."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="appShell">
          <header className="topBar">
            <Link className="brand" href="/">
              Heroes 3 Board Game Multi
            </Link>
            <nav className="navLinks" aria-label="Primary navigation">
              <Link href="/">Prototype</Link>
              <Link href="/credits">Credits</Link>
            </nav>
          </header>
          {children}
          <footer className="footerNotice">
            Non-profit fan tool. Visual references are loaded from credited wiki URLs for development.
          </footer>
        </div>
      </body>
    </html>
  );
}
