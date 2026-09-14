"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Copy,
  Trash2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import type { Block } from "@/lib/types";
import { useBuilder } from "@/lib/store";
import { BlockRenderer, BlockTypeIcon } from "./BlockRenderer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CanvasBlock({
  block,
  index,
  total,
}: {
  block: Block;
  index: number;
  total: number;
}) {
  const selectedId = useBuilder((s) => s.selectedId);
  const select = useBuilder((s) => s.select);
  const removeBlock = useBuilder((s) => s.removeBlock);
  const duplicateBlock = useBuilder((s) => s.duplicateBlock);
  const moveBlock = useBuilder((s) => s.moveBlock);
  const showPreview = useBuilder((s) => s.showPreview);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id, disabled: showPreview });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const selected = selectedId === block.id && !showPreview;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-lg transition-all",
        selected
          ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
          : "ring-1 ring-transparent hover:ring-primary/30",
        isDragging && "opacity-50",
      )}
      onClick={(e) => {
        e.stopPropagation();
        select(block.id);
      }}
    >
      {/* Toolbar */}
      {!showPreview && (
        <div
          className={cn(
            "absolute -top-3 left-3 z-20 flex items-center gap-0.5 rounded-md border bg-background shadow-sm transition-opacity",
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing p-1.5 text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <span className="flex items-center gap-1 px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <BlockTypeIcon type={block.type} />
            {block.type}
          </span>
          <div className="mx-1 h-4 w-px bg-border" />
          <button
            type="button"
            className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
            onClick={() => moveBlock(block.id, index - 1)}
            disabled={index === 0}
            aria-label="Move up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
            onClick={() => moveBlock(block.id, index + 1)}
            disabled={index === total - 1}
            aria-label="Move down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="p-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => duplicateBlock(block.id)}
            aria-label="Duplicate"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="p-1.5 text-muted-foreground hover:text-destructive"
            onClick={() => removeBlock(block.id)}
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg">
        <BlockRenderer block={block} />
      </div>
    </div>
  );
}

export function EmptyCanvasHint() {
  const addBlock = useBuilder((s) => s.addBlock);
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-20 text-center">
      <p className="text-muted-foreground">Your canvas is empty</p>
      <p className="text-xs text-muted-foreground mt-1">
        Drag a block from the left, or click one to add it.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={() => addBlock("hero")}
      >
        Add a Hero section
      </Button>
    </div>
  );
}
