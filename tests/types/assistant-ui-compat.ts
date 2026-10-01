// Compile-time proof that the structural adapter types fit the real assistant-ui API.
// Run with: npm run typecheck:compat
import type { ComponentProps } from "react";
import type { Toolkit, ToolCallMessagePartComponent } from "@assistant-ui/react";
import { createBpmnToolkit, type ToolCallPartLike } from "../../src/assistant-ui/index.js";

const toolkit = createBpmnToolkit({
  toolNames: ["draw_process"],
  resolveArtifact: async () => null,
});

// 1. Our entries are accepted where assistant-ui expects a Toolkit.
export const asToolkit: Toolkit = toolkit;

// 2. Real assistant-ui part props are assignable to our structural part.
export const assignable = (p: ComponentProps<ToolCallMessagePartComponent>): ToolCallPartLike => p;
