import type { Attribute } from "./blocks/ast";

export class ParseError extends Error {
  file?: string;
  row?: number;
  col?: number;

  constructor(message: string, file?: string, row?: number, col?: number) {
    super(formatParseError(message, file, row, col));
    this.name = "ParseError";
    this.file = file;
    this.row = row;
    this.col = col;
  }

  static new(message: string): ParseError {
    return new ParseError(message);
  }
}

function formatParseError(message: string, file?: string, row?: number, col?: number): string {
  if (file !== undefined && row !== undefined && col !== undefined) {
    return `${file}:${row}:${col}: ${message}`;
  }
  if (file !== undefined) {
    return `${file}: ${message}`;
  }
  return message;
}

/** Element wrapper that owns the source file name and parse errors. */
export class XmlElem {
  constructor(
    readonly file: string,
    readonly node: Element,
  ) {}

  static parse(file: string, xml: string, rootTag: string): XmlElem {
    const document = new DOMParser().parseFromString(xml, "application/xml");
    const parserError = document.querySelector("parsererror");
    if (parserError) {
      throw new ParseError(parserError.textContent?.trim() || "XML parse error", file);
    }
    const root = new XmlElem(file, document.documentElement);
    if (root.tag !== rootTag) {
      root.fail(`expected <${rootTag}>, found <${root.tag}>`);
    }
    return root;
  }

  get tag(): string {
    return this.node.tagName;
  }

  text(): string {
    return (this.node.textContent ?? "").trim();
  }

  opt(name: string): string | undefined {
    return this.node.hasAttribute(name) ? (this.node.getAttribute(name) ?? undefined) : undefined;
  }

  req(name: string): string {
    const value = this.opt(name);
    if (value === undefined) {
      this.fail(`missing \`${name}\` attribute`);
    }
    return value;
  }

  num(name: string, required: boolean): number | undefined {
    const raw = this.opt(name);
    if (raw === undefined) {
      if (required) {
        this.fail(`missing \`${name}\` attribute`);
      }
      return undefined;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      this.fail(`invalid \`${name}\` \`${raw}\``);
    }
    return value;
  }

  index(): number {
    const raw = this.opt("index");
    if (raw === undefined) {
      return 0;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      this.fail(`invalid \`index\` \`${raw}\``);
    }
    return value;
  }

  kids(): XmlElem[] {
    return [...this.node.children]
      .filter((child): child is Element => child.nodeType === 1)
      .map((child) => new XmlElem(this.file, child));
  }

  named(tag: string): XmlElem[] {
    return this.kids().filter((child) => child.tag === tag);
  }

  attributes(): Attribute[] {
    return this.named("attribute").map((child) => ({
      name: child.req("name"),
      value: child.text(),
    }));
  }

  fail(message: string): never {
    throw new ParseError(message, this.file);
  }
}

const PAD = "    ";

export class XmlWriter {
  readonly lines: string[] = [];

  line(text: string): this {
    this.lines.push(text);
    return this;
  }

  toString(): string {
    return `${this.lines.join("\n")}\n`;
  }

  static pad(level: number): string {
    return PAD.repeat(level);
  }

  static escapeAttr(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  static escapeText(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  static attr(name: string, value: string | number | undefined): string {
    if (value === undefined) {
      return "";
    }
    return ` ${name}="${XmlWriter.escapeAttr(String(value))}"`;
  }
}
