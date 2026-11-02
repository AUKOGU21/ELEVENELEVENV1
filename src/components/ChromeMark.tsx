// The Chrome symbol, for the Add to Chrome buttons.
export default function ChromeMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden style={{ flexShrink: 0, display: "block" }}>
      <path fill="#EA4335" d="M24 4a20 20 0 0 1 17.32 10H24a10 10 0 0 0-9.66 7.41L7.4 9.4A20 20 0 0 1 24 4Z" />
      <path fill="#FBBC04" d="M41.32 14A20 20 0 0 1 26 43.9l8.66-15A10 10 0 0 0 33.9 16l-.04-2h7.46Z" />
      <path fill="#34A853" d="M26 43.9A20 20 0 0 1 7.4 9.4l8.66 15A10 10 0 0 0 28.2 33l-2.2 10.9Z" />
      <circle cx="24" cy="24" r="10.5" fill="#FFFFFF" />
      <circle cx="24" cy="24" r="8.2" fill="#4285F4" />
    </svg>
  );
}
