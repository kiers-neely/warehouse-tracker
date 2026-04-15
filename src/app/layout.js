import "./globals.css";

export const metadata = {
  title: "US Warehouse Fire Tracker",
  description: "Live tracking of warehouse and industrial facility fires across the United States",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
