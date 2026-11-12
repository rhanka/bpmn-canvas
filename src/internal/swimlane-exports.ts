import type { BusinessPolicy } from "./business-policy.js";
import { createLayout } from "./swimlaneLayout.js";

/** Badge size of the legacy layout module for its base callers: the injected policy gives every value. */
export function appBoxSizeLayout(name: string, width: number, policy?: BusinessPolicy): [number, number] { return createLayout(policy).badgeSize(name, width); }
