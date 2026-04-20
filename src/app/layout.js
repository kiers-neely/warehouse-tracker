import "./globals.css";
import { Analytics } from '@vercel/analytics/next';

export const metadata = {
  title: "US Warehouse Fire Tracker",
  description: "Live tracking of warehouse and industrial facility fires across the United States",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" style={{ margin: 0, padding: 0, height: '100%' }}>
      <body style={{ margin: 0, padding: 0, height: '100%', background: '#0a0a0f' }}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
