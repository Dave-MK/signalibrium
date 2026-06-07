"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

const WELCOME_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "What do you want to know? I've got live prices, current setups, and open positions right in front of me. Ask about any instrument, a strategy, or what's actually moving right now.",
};

const SUGGESTED_PROMPTS = [
  "What's the best trade right now?",
  "Which crypto setups look strongest?",
  "How's Siggi performing today?",
];

// ─── sub-components ──────────────────────────────────────────────────────────

function SiggiAvatar({ size = "sm" }: { size?: "sm" | "md" }) {
  const dim = size === "md" ? "h-8 w-8" : "h-6 w-6";
  const iconDim = size === "md" ? "h-4 w-4" : "h-3 w-3";
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/20 to-violet-500/20 ring-1 ring-cyan-400/30 ${dim}`}
    >
      <svg viewBox="0 0 20 20" className={`${iconDim} text-cyan-300`} fill="currentColor">
        <path d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2Zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm0 9.5c-2.67 0-4.47-1.33-4.47-2 0-.67 1.8-2 4.47-2s4.47 1.33 4.47 2c0 .67-1.8 2-4.47 2Z" />
      </svg>
      {size === "md" && (
        <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[#07111d]" />
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400 [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400 [animation-delay:120ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400 [animation-delay:240ms]" />
    </div>
  );
}

function MessageBubble({
  msg,
  isLast,
  isStreaming,
}: {
  msg: ChatMessage;
  isLast: boolean;
  isStreaming: boolean;
}) {
  const isUser = msg.role === "user";
  const showDots = isLast && !isUser && isStreaming && msg.content === "";

  return (
    <div className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {!isUser && <SiggiAvatar />}
      <div
        className={`max-w-[82%] rounded-[0.5rem] px-3 py-2 text-[0.82rem] leading-[1.55] ${
          isUser
            ? "bg-cyan-500/20 text-cyan-50 ring-1 ring-cyan-500/25"
            : "bg-white/[0.055] text-slate-200 ring-1 ring-white/8"
        }`}
      >
        {showDots ? (
          <TypingDots />
        ) : (
          <span className="whitespace-pre-wrap">{msg.content}</span>
        )}
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function SiggiChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Tracks whether the component is mounted — guards post-await setState calls
  const mountedRef = useRef(true);
  // Abort controller for the active streaming request
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Focus input whenever the panel opens
  useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isStreaming) return;

    // Abort any previous in-flight request before starting a new one
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setInput("");
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setIsStreaming(true);

    try {
      const response = await fetch("/api/siggi/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });

      if (!mountedRef.current) return;

      if (!response.ok || !response.body) {
        const msg =
          response.status === 503
            ? "ANTHROPIC_API_KEY not set in .env.local — add it to enable Siggi chat."
            : "Having trouble connecting right now. Try again in a moment.";
        setMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content: msg }]);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!mountedRef.current || controller.signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const event = JSON.parse(payload) as Record<string, unknown>;
            const delta = event.delta as Record<string, unknown> | undefined;
            if (event.type === "content_block_delta" && delta?.type === "text_delta") {
              accumulated += delta.text as string;
              if (mountedRef.current) {
                setMessages((prev) => [
                  ...prev.slice(0, -1),
                  { role: "assistant", content: accumulated },
                ]);
              }
            }
          } catch {
            /* partial chunk — skip */
          }
        }
      }

      if (mountedRef.current && !accumulated) {
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: "No response. Try again." },
        ]);
      }
    } catch (err) {
      // AbortError is expected when user navigates or starts a new message — stay silent
      if (mountedRef.current && !(err instanceof DOMException && err.name === "AbortError")) {
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: "Connection dropped. Check your network and try again." },
        ]);
      }
    } finally {
      if (mountedRef.current) setIsStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/*
       * FAB — the circular trigger button.
       * When the chat opens it scales away from the same corner the panel grows from,
       * giving the appearance of morphing into the panel.
       */}
      <button
        type="button"
        onClick={open}
        aria-label="Ask Siggi"
        className={`group fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/30 to-violet-500/20 shadow-[0_8px_32px_rgba(0,229,255,0.22)] ring-1 ring-cyan-400/35 backdrop-blur-sm transition-all duration-300 ease-out hover:scale-105 hover:shadow-[0_8px_40px_rgba(0,229,255,0.35)] hover:ring-cyan-400/55 ${
          isOpen ? "pointer-events-none scale-0 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        {/* Pulsing background ring */}
        <span className="absolute inset-0 rounded-full bg-cyan-400/10 transition-transform duration-500 group-hover:scale-110" />
        <svg
          viewBox="0 0 20 20"
          className="relative h-6 w-6 text-cyan-200"
          fill="currentColor"
        >
          <path d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2Zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm0 9.5c-2.67 0-4.47-1.33-4.47-2 0-.67 1.8-2 4.47-2s4.47 1.33 4.47 2c0 .67-1.8 2-4.47 2Z" />
        </svg>
        {/* Tooltip label */}
        <span className="pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-[0.35rem] bg-[#07111d] px-2.5 py-1 text-[0.72rem] font-semibold text-cyan-200 opacity-0 ring-1 ring-white/10 transition-opacity duration-150 group-hover:opacity-100">
          Ask Siggi
        </span>
      </button>

      {/*
       * Chat panel — grows from the bottom-right corner (origin-bottom-right)
       * to look like it expands out of the FAB.
       */}
      <div
        className={`fixed bottom-5 right-5 z-50 flex origin-bottom-right flex-col overflow-hidden rounded-[0.75rem] border border-white/10 bg-[#07111d] shadow-[0_28px_80px_rgba(0,0,0,0.65),0_0_0_1px_rgba(0,229,255,0.05)] transition-all duration-300 ease-out ${
          isOpen
            ? "scale-100 opacity-100"
            : "pointer-events-none scale-75 opacity-0"
        }`}
        style={{ width: "clamp(320px, 90vw, 460px)", height: "min(70vh, 560px)" }}
      >
        {/* ── Panel header ── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/8 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <SiggiAvatar size="md" />
            <div className="min-w-0">
              <p className="text-[0.85rem] font-semibold leading-none text-white">Siggi</p>
              <p className="mt-0.5 text-[0.65rem] font-medium text-emerald-400">
                Live · AI trader
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Clear conversation"
              onClick={() => setMessages([WELCOME_MESSAGE])}
              className="flex h-7 w-7 items-center justify-center rounded-[0.3rem] text-slate-500 transition hover:bg-white/8 hover:text-slate-300"
            >
              <svg
                viewBox="0 0 20 20"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                <path d="M5 5h10l-1 10H6L5 5Zm3-2h4M3 5h14" />
              </svg>
            </button>
            <button
              type="button"
              title="Close"
              onClick={close}
              className="flex h-7 w-7 items-center justify-center rounded-[0.3rem] text-slate-500 transition hover:bg-white/8 hover:text-slate-300"
            >
              <svg
                viewBox="0 0 20 20"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="m4 4 12 12M16 4 4 16" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Messages ── */}
        <div className="flex-1 space-y-3 overflow-y-auto p-3.5">
          {messages.map((msg, i) => (
            <MessageBubble
              key={i}
              msg={msg}
              isLast={i === messages.length - 1}
              isStreaming={isStreaming}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* ── Suggested prompts (only on fresh conversation) ── */}
        {messages.length === 1 && (
          <div className="shrink-0 flex flex-wrap gap-1.5 px-3.5 pb-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => {
                  setInput(prompt);
                  setTimeout(() => inputRef.current?.focus(), 0);
                }}
                className="rounded-[0.35rem] bg-white/[0.05] px-2.5 py-1 text-[0.72rem] text-slate-300 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* ── Input ── */}
        <div className="shrink-0 border-t border-white/8 p-2.5">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder={
                isStreaming ? "Siggi is thinking…" : "Ask about any market or strategy…"
              }
              className="min-h-[36px] flex-1 resize-none rounded-[0.4rem] bg-white/[0.05] px-3 py-2 text-[0.82rem] text-white placeholder-slate-500 outline-none ring-1 ring-white/10 transition focus:ring-cyan-500/40 disabled:opacity-50"
              style={{ maxHeight: 96, overflowY: "auto" }}
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!input.trim() || isStreaming}
              aria-label="Send message"
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.4rem] transition ${
                input.trim() && !isStreaming
                  ? "signal-button"
                  : "cursor-not-allowed bg-white/[0.04] text-slate-600"
              }`}
            >
              <svg
                viewBox="0 0 20 20"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
              >
                <path d="M4 10h12M11 5l5 5-5 5" />
              </svg>
            </button>
          </div>
          <p className="mt-1.5 text-[0.63rem] text-slate-600">
            Enter to send · Shift+Enter for newline
          </p>
        </div>
      </div>
    </>
  );
}
