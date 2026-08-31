/**
 * Catalog type aliases used by AssemblyScript block functions.
 * Compact XML `c` is this function type — not a boxed GC ref.
 */
export const TYPE_ALIASES_AS = `/** Compact catalog \`c\` — a function, not a boxed GC ref. */
type c<T> = (v: T) => void;
type c1<T> = c<T>;
type c2<T1, T2> = (a: T1, b: T2) => void;
type s<R> = () => R;
type f1<T, R> = (v: T) => R;
type f2<T1, T2, R> = (a: T1, b: T2) => R;
`;
