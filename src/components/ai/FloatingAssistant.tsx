"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Send, Loader2, Eraser, MessageSquare } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useBuilder } from "@/lib/store";
import { buildPageContext } from "@/lib/ai-context";
import { createBlock } from "@/lib/blocks";
import type { Block, BlockStyle, BlockType, ChatMessage } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ForgeAction {
  kind: "add_blocks" | "update_seo";
  blocks?: { type: BlockType; props?: Record<string, unknown>; style?: BlockStyle }[];
  seo?: Record<string, unknown>;
}

function extractAction(reply: string): { action: ForgeAction | null; text: string } {
  const match = reply.match(/```forge-action\s*([\s\S]*?)```/i);
  if (!match) return { action: null, text: reply };
  const text = reply.replace(match[0], "").trim();
  try {
    const action = JSON.parse(match[1].trim()) as ForgeAction;
    return { action, text };
  } catch {
    return { action: null, text };
  }
}

const QUICK_PROMPTS = [
  "Add a pricing section",
  "Improve my meta description",
  "Write a hero headline for a SaaS",
  "Add a testimonials section",
];

function genId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function FloatingAssistant() {
  const open = useBuilder((s) => s.chatOpen);
  const setOpen = useBuilder((s) => s.setChatOpen);
  const messages = useBuilder((s) => s.messages);
  const addMessage = useBuilder((s) => s.addMessage);
  const clearMessages = useBuilder((s) => s.clearMessages);
  const chatLoading = useBuilder((s) => s.chatLoading);
  const setChatLoading = useBuilder((s) => s.setChatLoading);

  const blocks = useBuilder((s) => s.blocks);
  const seo = useBuilder((s) => s.seo);
  const replaceBlocks = useBuilder((s) => s.replaceBlocks);
  const updateSeo = useBuilder((s) => s.updateSeo);

  const [input, setInput] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" });
  }, [messages, open]);

  function applyAction(action: ForgeAction) {
    if (action.kind === "add_blocks" && Array.isArray(action.blocks)) {
      const newBlocks: Block[] = action.blocks
        .filter((b) => b && b.type)
        .map((b) => {
          const block = createBlock(b.type);
          if (b.props) block.props = { ...block.props, ...b.props };
          if (b.style) block.style = { ...block.style, ...b.style };
          return block;
        });
      if (newBlocks.length > 0) {
        replaceBlocks([...blocks, ...newBlocks]);
        toast.success(`Added ${newBlocks.length} block${newBlocks.length > 1 ? "s" : ""}`);
      }
    } else if (action.kind === "update_seo" && action.seo) {
      updateSeo(action.seo as Parameters<typeof updateSeo>[0]);
      toast.success("Updated SEO settings");
    }
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || chatLoading) return;

    const userMsg: ChatMessage = {
      id: genId(),
      role: "user",
      content,
      createdAt: Date.now(),
    };
    addMessage(userMsg);
    setInput("");
    setChatLoading(true);

    try {
      const context = buildPageContext(blocks, seo);
      const history = [...messages, userMsg]
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, context }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat failed");
      const reply: string = data.reply ?? "";
      const { action, text } = extractAction(reply);
      addMessage({
        id: genId(),
        role: "assistant",
        content: text || reply,
        createdAt: Date.now(),
      });
      if (action) applyAction(action);
    } catch (e) {
      addMessage({
        id: genId(),
        role: "assistant",
        content: `⚠️ ${e instanceof Error ? e.message : "Something went wrong."}`,
        createdAt: Date.now(),
      });
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <>
      {/* Floating bubble */}
      <motion.button
        type="button"
        onClick={() => setOpen(!open)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:scale-105 transition-transform"
        whileTap={{ scale: 0.92 }}
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span
              key="x"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
            >
              <X className="h-6 w-6" />
            </motion.span>
          ) : (
            <motion.span
              key="spark"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
            >
              <Sparkles className="h-6 w-6" />
            </motion.span>
          )}
        </AnimatePresence>
        {!open && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
        )}
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="fixed bottom-24 right-5 z-50 flex h-[32rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
          >
            {/* header */}
            <div className="flex items-center justify-between border-b bg-gradient-to-r from-primary to-primary/80 px-4 py-2.5 text-primary-foreground">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                <div>
                  <p className="text-sm font-semibold leading-none">Forge AI</p>
                  <p className="text-[10px] opacity-80">
                    Your design & SEO co-pilot
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary-foreground hover:bg-white/15"
                onClick={clearMessages}
                title="Clear conversation"
              >
                <Eraser className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* messages */}
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 p-3" ref={scrollRef}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "flex",
                      m.role === "user" ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed",
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {m.role === "assistant" ? (
                        <div className="chat-markdown">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                    </div>
                  </div>
                )}

                {messages.length <= 1 && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[10px] font-medium uppercase text-muted-foreground">
                      Quick actions
                    </p>
                    {QUICK_PROMPTS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => send(q)}
                        className="block w-full rounded-md border bg-background px-2.5 py-1.5 text-left text-[11px] hover:border-primary/50 hover:bg-accent"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* input */}
            <div className="border-t p-2.5">
              <div className="flex items-end gap-1.5">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  placeholder="Ask AI to build, write, or optimize…"
                  className="min-h-[36px] max-h-24 resize-none text-xs"
                  rows={1}
                  disabled={chatLoading}
                />
                <Button
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => send(input)}
                  disabled={chatLoading || !input.trim()}
                >
                  {chatLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground">
                <MessageSquare className="h-2.5 w-2.5" />
                AI can add blocks & update SEO automatically
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
