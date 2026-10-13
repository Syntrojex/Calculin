/**
 * Precedence-aware parenthesis stripping.
 *
 * mathjs's toString() uses parenthesis:"keep" by default — it prints exactly
 * the ParenthesisNodes present in the tree. Removing *every* ParenthesisNode
 * (as the old helper did) therefore silently changes meaning:
 * "1*(a+b)" printed as "1*a+b". This helper removes only parentheses that are
 * redundant for the surrounding operator, and keeps the ones that matter.
 */
import { ParenthesisNode, type MathNode } from "mathjs";

type AnyNode = MathNode & { fn?: unknown; content?: MathNode; map: (cb: (child: MathNode, path: string) => MathNode) => MathNode };

function opName(n: AnyNode): string | null {
  return n.type === "OperatorNode" ? String(n.fn) : null;
}

function needsParens(content: AnyNode, parentOp: string | null, idx: number): boolean {
  const c = opName(content);
  if (!c) return false;
  if (!parentOp || parentOp === "function") return false;
  switch (parentOp) {
    case "add": return false;
    case "subtract": return idx === 1 && (c === "add" || c === "subtract");
    case "multiply": return c === "add" || c === "subtract";
    case "divide":
      if (idx === 0) return c === "add" || c === "subtract";
      return true;
    case "pow": return true;
    case "unaryMinus":
    case "unaryPlus": return c === "add" || c === "subtract" || c === "unaryMinus" || c === "unaryPlus";
    default: return true;
  }
}

function strip(node: AnyNode, parentOp: string | null, idx: number): MathNode {
  if (node.type === "ParenthesisNode") {
    const inner = strip(node.content as AnyNode, null, 0) as AnyNode;
    return needsParens(inner, parentOp, idx) ? new ParenthesisNode(inner) : inner;
  }
  if (typeof node.map === "function") {
    const me = node.type === "OperatorNode" ? String(node.fn) : node.type === "FunctionNode" ? "function" : "other";
    return node.map((child, path) => {
      const m = /\[(\d+)\]/.exec(path);
      return strip(child as AnyNode, me, m ? Number(m[1]) : 0);
    });
  }
  return node;
}

export function stripParens(node: MathNode): MathNode {
  return strip(node as AnyNode, null, 0);
}
