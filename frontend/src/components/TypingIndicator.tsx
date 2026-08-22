export function TypingIndicator() {
  return (
    <div className="flex items-center gap-3 px-1 py-1 text-xs text-zinc-500">
      <span>Alex is typing</span>
      <span className="flex items-center gap-1.5">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1.5 w-1.5 rounded-full bg-indigo-400"
            style={{ animation: `typingBounce 1.15s ${index * 0.16}s ease-in-out infinite` }}
          />
        ))}
      </span>
    </div>
  )
}