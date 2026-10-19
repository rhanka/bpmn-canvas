declare module "saxen" {
  export function decode(value: string): string;
  export class Parser {
    constructor(options?: { proxy?: boolean });
    ns(map: Record<string, string>): this;
    on(event: "openTag", callback: (name: string, attributes: () => Record<string, string>, decode: (value: string) => string, selfClosing: boolean) => void): this;
    on(event: "closeTag", callback: (name: string, decode: (value: string) => string, selfClosing: boolean) => void): this;
    on(event: "error", callback: (error: Error) => void): this;
    on(name: string, callback: (...args: any[]) => void): this;
    parse(text: string): Error | undefined;
    stop(): void;
  }
}
