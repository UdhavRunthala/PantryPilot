import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "PantryPilot — A little planning. A happier kitchen.",
  description:
    "Eat smarter. Waste less. Spend less. Your personal kitchen, meal planner and grocery companion.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
