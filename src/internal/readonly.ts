/**
 * Read-only by veto at the command stack. The wrappers are set on this instance's
 * services only, never on a prototype, so other bpmn-js instances on the page are untouched.
 */

interface CommandStackLike {
  execute(command: string, context?: unknown): void;
  undo(): void;
  redo(): void;
  canExecute(command: string, context?: unknown): boolean;
}

interface Cancellable {
  cancel?(): void;
  close?(): void;
  activate?(...args: unknown[]): unknown;
}

export interface ReadOnlyService {
  setReadOnly(value: boolean): void;
  isReadOnly(): boolean;
}

class ReadOnlyServiceImpl implements ReadOnlyService {
  static $inject = ["commandStack", "injector"];
  private enabled = false;
  private readonly directEditing: Cancellable | null;
  private readonly contextPad: Cancellable | null;
  private readonly dragging: Cancellable | null;

  constructor(commandStack: CommandStackLike, injector: { get(name: string, strict?: boolean): unknown }) {
    const execute = commandStack.execute.bind(commandStack);
    const undo = commandStack.undo.bind(commandStack);
    const redo = commandStack.redo.bind(commandStack);
    const canExecute = commandStack.canExecute.bind(commandStack);
    commandStack.execute = (command, context) => {
      if (!this.enabled) execute(command, context);
    };
    commandStack.undo = () => {
      if (!this.enabled) undo();
    };
    commandStack.redo = () => {
      if (!this.enabled) redo();
    };
    commandStack.canExecute = (command, context) => !this.enabled && canExecute(command, context);

    this.directEditing = (injector.get("directEditing", false) as Cancellable | null) ?? null;
    this.contextPad = (injector.get("contextPad", false) as Cancellable | null) ?? null;
    this.dragging = (injector.get("dragging", false) as Cancellable | null) ?? null;
    const de = this.directEditing;
    if (de?.activate) {
      const activate = de.activate.bind(de);
      de.activate = (...args: unknown[]) => (this.enabled ? undefined : activate(...args));
    }
  }

  setReadOnly(value: boolean): void {
    this.enabled = value;
    if (value) {
      this.directEditing?.cancel?.();
      this.contextPad?.close?.();
      this.dragging?.cancel?.();
    }
  }

  isReadOnly(): boolean {
    return this.enabled;
  }
}

export const ReadOnlyModule = {
  __init__: ["bpmnCanvasReadOnly"],
  bpmnCanvasReadOnly: ["type", ReadOnlyServiceImpl],
};
