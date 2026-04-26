import "./globals.css";

const siteUrl = "https://warehousefire.watch";

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: "US Warehouse Fire Tracker",
  description: "Live tracking of warehouse and industrial facility fires across the United States",
  openGraph: {
    title: "US Warehouse Fire Tracker",
    description: "Live tracking of warehouse and industrial facility fires across the United States",
    url: siteUrl,
    siteName: "US Warehouse Fire Tracker",
    images: [
      {
        url: "/opengraph-image",
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
    images: ["/opengraph-image"],
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
