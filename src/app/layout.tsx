import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AssetPreconnect } from "@/components/asset-preconnect";
import { PartyPreconnect } from "@/components/party-preconnect";
import "./globals.css";

export const metadata: Metadata = {
  title: "Heroes 3 Board Game Multi",
  description: "Non-profit fan multiplayer tool foundation for Heroes 3: The Board Game."
};

// width/initialScale are Next's defaults made explicit; viewportFit "cover"
// additionally exposes env(safe-area-inset-*) so the phone UI mode's bottom
// tab bar can clear the home-indicator area on notched phones. No effect on
// desktop rendering.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AssetPreconnect />
        <PartyPreconnect />
        <div className="appShell">
          <header className="topBar">
            <Link className="brand" href="/menu">
              Heroes 3 Board Game Multi
            </Link>
            <nav className="navLinks" aria-label="Primary navigation">
              <Link href="/menu">Menu</Link>
            </nav>
          </header>
          {children}
          <footer className="footerNotice">
            Non-profit fan tool. Unit/card references load from credited wiki URLs; board terrain is original project art.
          </footer>
        </div>
      </body>
    </html>
  );
}
