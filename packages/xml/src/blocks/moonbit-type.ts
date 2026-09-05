import {
  type TypeExpr,
  FuncType,
  HoleType,
  NamedType,
  SelfType,
  TupleType,
  generic,
  intersectionOf,
  named,
  unbounded,
  unionOf,
} from "./ast";
import { ParseError } from "../dom";

const IDENT = /[A-Za-z][A-Za-z0-9_]*|_[A-Za-z0-9_]+/;

type AtomKind = "plain" | "group" | "tuple" | "empty";

interface Atom {
  expr: TypeExpr;
  kind: AtomKind;
}

/**
 * Parse a MoonBit type expression.
 *
 *   Double
 *   Array[T]
 *   (Double) -> Unit
 *   (Int, String) -> Bool
 *   () -> Double
 *   (Int, String)
 *   Int | Int64
 *   _
 *   Self
 */
export function parseMoonbitType(src: string): TypeExpr {
  return new TypeParser(src).parse();
}

class TypeParser {
  private i = 0;

  constructor(private readonly src: string) {}

  parse(): TypeExpr {
    if (this.src.trim().length === 0) {
      return unbounded();
    }
    const expr = this.parseUnion();
    this.skip();
    if (this.i < this.src.length) {
      this.fail(`unexpected \`${this.src.slice(this.i)}\``);
    }
    return expr;
  }

  private parseUnion(): TypeExpr {
    const parts = [this.parseIntersection()];
    while (this.eat("|")) {
      parts.push(this.parseIntersection());
    }
    return unionOf(parts);
  }

  private parseIntersection(): TypeExpr {
    const parts = [this.parseFun()];
    while (this.eat("&")) {
      parts.push(this.parseFun());
    }
    return intersectionOf(parts);
  }

  private parseFun(): TypeExpr {
    const left = this.parsePostfix();
    if (this.eat("->")) {
      return new FuncType(paramsFromArrowLeft(left), this.parseFun());
    }
    return unwrapAtom(left);
  }

  private parsePostfix(): Atom {
    const atom = this.parseAtom();
    while (this.eat("?")) {
      atom.expr = generic("Option", [unwrapAtom(atom)]);
      atom.kind = "plain";
    }
    return atom;
  }

  private parseAtom(): Atom {
    if (this.atHole()) {
      this.i += 1;
      return { expr: new HoleType(), kind: "plain" };
    }
    if (this.eat("(")) {
      if (this.eat(")")) {
        return { expr: named("Unit"), kind: "empty" };
      }
      const first = this.parseUnion();
      if (this.eat(")")) {
        return { expr: first, kind: "group" };
      }
      if (!this.eat(",")) {
        this.fail("expected `,` or `)`");
      }
      const elems = [first];
      if (!this.startsWith(")")) {
        elems.push(this.parseUnion());
        while (this.eat(",")) {
          if (this.startsWith(")")) {
            break;
          }
          elems.push(this.parseUnion());
        }
      }
      if (!this.eat(")")) {
        this.fail("expected `)`");
      }
      return { expr: new TupleType(elems), kind: "tuple" };
    }
    const name = this.parseName();
    if (name === "Self") {
      return { expr: new SelfType(), kind: "plain" };
    }
    if (this.eat("[")) {
      const args = [this.parseUnion()];
      while (this.eat(",")) {
        if (this.startsWith("]")) {
          break;
        }
        args.push(this.parseUnion());
      }
      if (!this.eat("]")) {
        this.fail("expected `]`");
      }
      return { expr: new NamedType(name, null, args), kind: "plain" };
    }
    return { expr: new NamedType(name, null, []), kind: "plain" };
  }

  private parseName(): string {
    this.skip();
    const start = this.i;
    const first = this.src.slice(this.i).match(IDENT);
    if (!first || first.index !== 0) {
      this.fail("expected type name");
    }
    this.i += first[0].length;
    while (this.src[this.i] === ".") {
      this.i += 1;
      const part = this.src.slice(this.i).match(IDENT);
      if (!part || part.index !== 0) {
        this.fail("expected identifier after `.`");
      }
      this.i += part[0].length;
    }
    return this.src.slice(start, this.i);
  }

  private atHole(): boolean {
    this.skip();
    if (this.src[this.i] !== "_") {
      return false;
    }
    const next = this.src[this.i + 1];
    return next === undefined || !/[A-Za-z0-9_]/.test(next);
  }

  private skip(): void {
    while (this.i < this.src.length && /\s/.test(this.src[this.i]!)) {
      this.i += 1;
    }
  }

  private startsWith(value: string): boolean {
    this.skip();
    return this.src.startsWith(value, this.i);
  }

  private eat(value: string): boolean {
    if (this.startsWith(value)) {
      this.i += value.length;
      return true;
    }
    return false;
  }

  private fail(message: string): never {
    throw ParseError.new(`${message} in MoonBit type \`${this.src}\``);
  }
}

function paramsFromArrowLeft(left: Atom): TypeExpr[] {
  switch (left.kind) {
    case "empty":
      return [];
    case "tuple":
      return left.expr.kind === "tuple" ? left.expr.elems : [left.expr];
    case "group":
    case "plain":
      return [left.expr];
  }
}

function unwrapAtom(atom: Atom): TypeExpr {
  return atom.kind === "empty" ? named("Unit") : atom.expr;
}
