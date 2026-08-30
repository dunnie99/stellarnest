export default function RouteFallback() {
  return (
    <div className="flex min-h-48 items-center justify-center" role="status" aria-live="polite">
      <p className="text-sm text-mist-400">Loading page…</p>
    </div>
  );
}
