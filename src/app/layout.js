import "./globals.css";
import { Analytics } from '@vercel/analytics/next';

export const metadata = {
  title: "US Warehouse Fire Tracker",
  description: "Live tracking of warehouse and industrial facility fires across the United States",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
