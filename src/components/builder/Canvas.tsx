"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useBuilder } from "@/lib/store";
import type { Block, BlockType } from "@/lib/types";
import { CanvasBlock, EmptyCanvasHint } from "./CanvasBlock";
import { BlockTypeIcon } from "./BlockRenderer";
import { cn } from "@/lib/utils";

const PALETTE_DRAGGABLE_PREFIX = "palette:";

function PaletteDraggable({ type }: { type: BlockType }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${PALETTE_DRAGGABLE_PREFIX}${type}`,
    data: { type },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      className={cn(
        "flex w-full items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-left text-xs font-medium transition-colors hover:border-primary/50 hover:bg-accent",
        isDragging && "opacity-40",
      )}
    >
      <span className="text-muted-foreground">
        <BlockTypeIcon type={type} />
      </span>
      <span className="capitalize">{type}</span>
    </button>
  );
}

export function PaletteDraggableItem({ type }: { type: BlockType }) {
  return <PaletteDraggable type={type} />;
}

function CanvasDropZone() {
  const blocks = useBuilder((s) => s.blocks);
  const select = useBuilder((s) => s.select);
  const showPreview = useBuilder((s) => s.showPreview);
  const previewDevice = useBuilder((s) => s.previewDevice);
  const { setNodeRef, isOver } = useDroppable({ id: "canvas-root" });

  const widthClass =
    previewDevice === "mobile"
      ? "max-w-[390px]"
      : previewDevice === "tablet"
      ? "max-w-[820px]"
      : "max-w-full";

  return (
    <div
      className="flex flex-1 justify-center overflow-y-auto bg-muted/30 p-4 md:p-8"
      onClick={() => select(null)}
    >
      <div
        className={cn(
          "w-full transition-all duration-300",
          widthClass,
          showPreview ? "" : "min-h-[60vh]",
        )}
      >
        <div
          ref={setNodeRef}
          className={cn(
            "min-h-full rounded-xl border bg-background shadow-sm transition-colors",
            isOver && !showPreview ? "border-primary border-dashed" : "border-border",
            showPreview ? "overflow-hidden" : "",
          )}
        >
          <SortableContext
            items={blocks.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className={cn("flex flex-col", showPreview ? "" : "gap-2 p-2")}>
              {blocks.length === 0 ? (
                <div className="p-4">
                  <EmptyCanvasHint />
                </div>
              ) : (
                blocks.map((b, i) => (
                  <CanvasBlock
                    key={b.id}
                    block={b}
                    index={i}
                    total={blocks.length}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </div>
      </div>
    </div>
  );
}

export function Canvas() {
  const blocks = useBuilder((s) => s.blocks);
  const addBlock = useBuilder((s) => s.addBlock);
  const moveBlock = useBuilder((s) => s.moveBlock);
  const [activeDrag, setActiveDrag] = React.useState<{
    type: BlockType;
    isPalette: boolean;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith(PALETTE_DRAGGABLE_PREFIX)) {
      setActiveDrag({
        type: id.slice(PALETTE_DRAGGABLE_PREFIX.length) as BlockType,
        isPalette: true,
      });
    } else {
      const block = blocks.find((b) => b.id === id);
      if (block) setActiveDrag({ type: block.type, isPalette: false });
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over) return;

    // Dropping a palette item onto the canvas
    if (
      typeof active.id === "string" &&
      active.id.startsWith(PALETTE_DRAGGABLE_PREFIX)
    ) {
      const type = active.id.slice(PALETTE_DRAGGABLE_PREFIX.length) as BlockType;
      // If over a specific block, insert before it; else append.
      if (
        typeof over.id === "string" &&
        !over.id.startsWith(PALETTE_DRAGGABLE_PREFIX) &&
        over.id !== "canvas-root"
      ) {
        const idx = blocks.findIndex((b) => b.id === over.id);
        addBlock(type, idx === -1 ? undefined : idx);
      } else {
        addBlock(type);
      }
      return;
    }

    // Reordering existing blocks
    if (active.id !== over.id && over.id !== "canvas-root") {
      const to = blocks.findIndex((b) => b.id === over.id);
      if (to !== -1) {
        moveBlock(String(active.id), to);
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      <CanvasDropZone />
      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <div className="pointer-events-none flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs font-medium shadow-lg">
            <span className="text-muted-foreground">
              <BlockTypeIcon type={activeDrag.type} />
            </span>
            <span className="capitalize">{activeDrag.type}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export type { Block };
