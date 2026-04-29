import "./globals.css";

const siteUrl = "https://warehousefire.watch";

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: "US Warehouse Fire Tracker",
  description: "Live tracking of warehouse and industrial facility fires across the United States",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "US Warehouse Fire Tracker",
    description: "Live tracking of warehouse and industrial facility fires across the United States",
    url: siteUrl,
    siteName: "US Warehouse Fire Tracker",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "US Warehouse Fire Tracker preview map",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "US Warehouse Fire Tracker",
    description: "Live tracking of warehouse and industrial facility fires across the United States",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/us-map.svg" as="image" type="image/svg+xml" fetchPriority="high" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
