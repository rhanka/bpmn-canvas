/** Ambient shapes of the pinned upstream lint package. Static imports only;
 * no dynamic module loading and no network access anywhere in this boundary. */
declare module "bpmnlint" {
  export interface LintReporter {
    report(id: string, message: string, path?: readonly string[] | Record<string, unknown>): void;
  }
  export interface ModdleNode {
    readonly $type?: unknown;
    readonly $descriptor?: unknown;
    readonly [key: string]: unknown;
  }
  export interface RuleInstance {
    check(node: ModdleNode, reporter: LintReporter): void;
  }
  export type RuleFactory = (options: unknown) => RuleInstance;
  export interface Resolver {
    resolveRule(pkg: string, ruleName: string): RuleFactory | undefined;
    resolveConfig(pkg: string, configName: string): unknown;
  }
  export interface LintRawFinding {
    readonly id?: string;
    readonly message?: string;
    readonly path?: unknown;
    readonly category?: string;
    readonly [key: string]: unknown;
  }
  export type LintResults = Record<string, LintRawFinding[]>;
  export class Linter {
    applyRule(root: unknown, definition: { name: string; category: string; config: unknown; rule: RuleInstance }): LintRawFinding[];
    constructor(options: { config?: unknown; resolver: Resolver });
    lint(moddleRoot: unknown, config?: unknown): Promise<LintResults>;
  }
}

declare module "bpmnlint/config/recommended.js" {
  const config: { readonly rules: Readonly<Record<string, unknown>> };
  export default config;
}

declare module "bpmnlint/rules/*.js" {
  import type { RuleFactory } from "bpmnlint";
  const factory: RuleFactory;
  export default factory;
}
