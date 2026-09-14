"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Block,
  BlockType,
  ChatMessage,
  EditMode,
  PreviewDevice,
  SeoConfig,
  WordPressConfig,
} from "./types";
import { createBlock, defaultBlocks } from "./blocks";
import { DEFAULT_SEO } from "./seo";

interface BuilderState {
  // project
  projectName: string;
  mode: EditMode;
  previewDevice: PreviewDevice;
  blocks: Block[];
  selectedId: string | null;
  customCode: string;
  seo: SeoConfig;
  showPreview: boolean;
  // chat
  chatOpen: boolean;
  messages: ChatMessage[];
  chatLoading: boolean;
  // wordpress
  wordpress: WordPressConfig;
  wpConnected: boolean;
  // orchestration
  activeView: "builder" | "dashboard";
  serverProjectId: string | null;
  serverSyncing: boolean;
  // wordpress import reference — the WP post the current builder project
  // was imported from (so "push back" updates the same post). Cleared on reset.
  wpPostId: number | null;

  // actions
  setProjectName: (n: string) => void;
  setMode: (m: EditMode) => void;
  setPreviewDevice: (d: PreviewDevice) => void;
  togglePreview: () => void;
  select: (id: string | null) => void;
  addBlock: (type: BlockType, index?: number) => void;
  removeBlock: (id: string) => void;
  duplicateBlock: (id: string) => void;
  moveBlock: (id: string, to: number) => void;
  updateBlockProps: (id: string, patch: Partial<Block["props"]>) => void;
  updateBlockStyle: (id: string, patch: Partial<Block["style"]>) => void;
  replaceBlocks: (blocks: Block[]) => void;
  setCustomCode: (code: string) => void;
  updateSeo: (patch: Partial<SeoConfig>) => void;
  resetProject: () => void;

  setChatOpen: (open: boolean) => void;
  setChatLoading: (b: boolean) => void;
  addMessage: (m: ChatMessage) => void;
  clearMessages: () => void;

  setWordPress: (patch: Partial<WordPressConfig>) => void;
  setWpConnected: (b: boolean) => void;

  setActiveView: (v: "builder" | "dashboard") => void;
  setServerProjectId: (id: string | null) => void;
  setServerSyncing: (b: boolean) => void;
  setWpPostId: (id: number | null) => void;
}

function genId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export const useBuilder = create<BuilderState>()(
  persist(
    (set, get) => ({
      projectName: "Untitled Project",
      mode: "dragdrop",
      previewDevice: "desktop",
      blocks: defaultBlocks(),
      selectedId: null,
      customCode: "<!-- Write your custom HTML here -->\n<h1>Hello world</h1>\n<p>Edit me in Code mode.</p>",
      seo: DEFAULT_SEO,
      showPreview: false,
      chatOpen: false,
      messages: [
        {
          id: genId(),
          role: "assistant",
          content:
            "Hi! I'm your AI co-pilot for Forge. I can generate blocks, write copy, or improve your SEO. Try: *Add a pricing section* or *Improve my meta description*.",
          createdAt: Date.now(),
        },
      ],
      chatLoading: false,

      wordpress: { siteUrl: "", username: "", appPassword: "" },
      wpConnected: false,

      activeView: "builder",
      serverProjectId: null,
      serverSyncing: false,
      wpPostId: null,

      setProjectName: (n) => set({ projectName: n }),
      setMode: (m) => set({ mode: m }),
      setPreviewDevice: (d) => set({ previewDevice: d }),
      togglePreview: () => set((s) => ({ showPreview: !s.showPreview })),
      select: (id) => set({ selectedId: id }),

      addBlock: (type, index) =>
        set((s) => {
          const block = createBlock(type);
          const blocks = [...s.blocks];
          if (typeof index === "number") blocks.splice(index, 0, block);
          else blocks.push(block);
          return { blocks, selectedId: block.id };
        }),

      removeBlock: (id) =>
        set((s) => ({
          blocks: s.blocks.filter((b) => b.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
        })),

      duplicateBlock: (id) =>
        set((s) => {
          const idx = s.blocks.findIndex((b) => b.id === id);
          if (idx === -1) return {};
          const orig = s.blocks[idx];
          const copy: Block = {
            ...structuredClone(orig),
            id: `b_${Math.random().toString(36).slice(2, 10)}`,
          };
          const blocks = [...s.blocks];
          blocks.splice(idx + 1, 0, copy);
          return { blocks, selectedId: copy.id };
        }),

      moveBlock: (id, to) =>
        set((s) => {
          const from = s.blocks.findIndex((b) => b.id === id);
          if (from === -1) return {};
          const blocks = [...s.blocks];
          const [item] = blocks.splice(from, 1);
          blocks.splice(Math.max(0, Math.min(to, blocks.length)), 0, item);
          return { blocks };
        }),

      updateBlockProps: (id, patch) =>
        set((s) => ({
          blocks: s.blocks.map((b) =>
            b.id === id ? { ...b, props: { ...b.props, ...patch } } : b,
          ),
        })),

      updateBlockStyle: (id, patch) =>
        set((s) => ({
          blocks: s.blocks.map((b) =>
            b.id === id ? { ...b, style: { ...b.style, ...patch } } : b,
          ),
        })),

      replaceBlocks: (blocks) => set({ blocks, selectedId: null }),
      setCustomCode: (code) => set({ customCode: code }),
      updateSeo: (patch) => set((s) => ({ seo: { ...s.seo, ...patch } })),

      resetProject: () =>
        set({
          projectName: "Untitled Project",
          blocks: defaultBlocks(),
          selectedId: null,
          mode: "dragdrop",
          seo: DEFAULT_SEO,
          customCode:
            "<!-- Write your custom HTML here -->\n<h1>Hello world</h1>",
          serverProjectId: null,
          wpPostId: null,
        }),

      setChatOpen: (open) => set({ chatOpen: open }),
      setChatLoading: (b) => set({ chatLoading: b }),
      addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
      clearMessages: () =>
        set({
          messages: [
            {
              id: genId(),
              role: "assistant",
              content: "Conversation cleared. How can I help you build?",
              createdAt: Date.now(),
            },
          ],
        }),

      setWordPress: (patch) =>
        set((s) => ({
          wordpress: { ...s.wordpress, ...patch },
          wpConnected: patch.siteUrl !== undefined ? false : s.wpConnected,
        })),
      setWpConnected: (b) => set({ wpConnected: b }),

      setActiveView: (v) => set({ activeView: v }),
      setServerProjectId: (id) => set({ serverProjectId: id }),
      setServerSyncing: (b) => set({ serverSyncing: b }),
      setWpPostId: (id) => set({ wpPostId: id }),
    }),
    {
      name: "forge-builder-v1",
      partialize: (s) => ({
        projectName: s.projectName,
        blocks: s.blocks,
        customCode: s.customCode,
        seo: s.seo,
        mode: s.mode,
        wordpress: s.wordpress,
      }),
    },
  ),
);
