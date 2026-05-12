import "./globals.css";

export const metadata = {
  title: "Little Star History Atlas",
  description:
    "A map-first historical storytelling interface for child-friendly Chinese history learning.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

