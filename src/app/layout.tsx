     1|import './globals.css';
     2|import { Providers } from '@/components/providers';
     3|
     4|import './globals.css';
     5|
     6|export const metadata = {
     7|  title: 'Jet Striker',
     8|  other: {
     9|    'vibejam-widget': 'enabled',
    10|  },
    11|};
    12|
    13|export const viewport = {
    14|  width: 'device-width',
    15|  initialScale: 1,
    16|  maximumScale: 1,
    17|  userScalable: false,
    18|  viewportFit: 'cover',
    19|};
    20|
    21|export default function RootLayout({ children }: { children: React.ReactNode }) {
    22|  return (
    23|    <html lang="en">
    24|      <body className="fixed inset-0 h-dvh w-screen overflow-hidden bg-background text-foreground">
    25|        <Providers>{children}</Providers>
    26|      </body>
    27|    </html>
    28|  );
    29|}
    30|