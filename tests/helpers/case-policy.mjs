import ts from "typescript";

// Parse tokens and constant property names; comments and ordinary strings are
// not operations. Resolve constants so bracket access cannot hide a method.
export function casePolicyViolations(source) {
  const file = ts.createSourceFile("policy.ts", source, ts.ScriptTarget.Latest, true);
  const constants = new Map();
  const violations = [];
  function constant(node, active = new Set()) {
    if (!node) return undefined;
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isParenthesizedExpression(node)) return constant(node.expression, active);
    if (ts.isIdentifier(node) && constants.has(node.text) && !active.has(node.text)) {
      return constant(constants.get(node.text), new Set([...active, node.text]));
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = constant(node.left, active), right = constant(node.right, active);
      if (left !== undefined && right !== undefined) return left + right;
    }
    if (ts.isTemplateExpression(node)) {
      let value = node.head.text;
      for (const span of node.templateSpans) {
        const part = constant(span.expression, active);
        if (part === undefined) return undefined;
        value += part + span.literal.text;
      }
      return value;
    }
    return undefined;
  }
  function collect(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) constants.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  }
  collect(file);
  const banned = name => name === "toUpperCase" || name === "toLowerCase" || name === "localeCompare" || name === "normalize" || name === "Intl" || name?.startsWith("toLocale");
  const memberName = node => ts.isPropertyAccessExpression(node) ? node.name.text
    : ts.isElementAccessExpression(node) ? constant(node.argumentExpression) : undefined;
  function visit(node) {
    let reason;
    if (banned(memberName(node))) reason = "platform-unicode";
    if (ts.isIdentifier(node) && node.text === "Intl") reason = "platform-intl";
    if (ts.isBindingElement(node)) {
      const name = node.propertyName ?? node.name;
      const key = ts.isIdentifier(name) ? name.text : ts.isComputedPropertyName(name) ? constant(name.expression) : constant(name);
      if (banned(key)) reason = "platform-unicode";
    }
    if (ts.isRegularExpressionLiteral(node) && /i/.test(node.text.slice(node.text.lastIndexOf("/") + 1))) reason = "regex-ignore-case";
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) &&
      (ts.isIdentifier(node.expression) ? node.expression.text === "RegExp" : memberName(node.expression) === "RegExp")) {
      const flags = constant(node.arguments?.[1]);
      if (flags?.includes("i")) reason = "regex-ignore-case";
    }
    if (reason) violations.push({ offset: node.getStart(file), reason });
    ts.forEachChild(node, visit);
  }
  visit(file);
  return violations;
}
