     1|import Link from 'next/link';
     2|
     3|export default function NotFound() {
     4|	return (
     5|		<div className="flex min-h-screen items-center justify-center px-6">
     6|			<div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
     7|				<p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">404</p>
     8|				<h1 className="mt-4 text-3xl font-semibold tracking-tight">Page not found</h1>
     9|				<p className="mt-3 text-sm leading-6 text-muted-foreground">
    10|					The route you asked for does not exist in this app.
    11|				</p>
    12|				<Link
    13|					href="/"
    14|					className="mt-6 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
    15|				>
    16|					Go home
    17|				</Link>
    18|			</div>
    19|		</div>
    20|	);
    21|}
    22|