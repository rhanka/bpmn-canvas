// bpmn-auto-layout ships no type declarations. Only the entry the layout uses is declared.
declare module "bpmn-auto-layout" {
  export function layoutProcess(xml: string): Promise<string>;
}
