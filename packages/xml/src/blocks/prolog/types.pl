%% Type compatibility and inference for catalog blocks.
%%
%% Loaded into Trealla (WASM) once; every block type program uses this
%% module. Type variables are attributed variables. Unification runs
%% attr_unify_hook/2 (SWI-style) via Trealla's verify_attributes/3.
%%
%% Type terms (raw names are camelCase atoms):
%%   double, float, int, int64, uint, uint64, string, bool, byte, char, unit, self
%%   array(T)
%%   fn(Args, Ret)      % (T1, T2) -> R
%%   tuple(Elems)
%%   union(A, B)
%%   inter(A, B)
%%   top                % unconstrained type variable
%%
%% Block <type> programs run after declared port types and grounded
%% inputs have been unified. Type variables from <var> are in scope.
%% Extra predicates: compatible/2, unify_type/2, constrain/2, meet/3, join/3.
%% Port values are variables In_<name> and Out_<name>.

:- module(type, [
    attr_unify_hook/2,
    verify_attributes/3,
    setup_var/2,
    constrain/2,
    constrain_join/2,
    unify_type/2,
    compatible/2,
    meet/3,
    join/3,
    read_type/2,
    connectable/1,
    ground_ty/1,
    assert_ancestors/1,
    clear_ancestors/0
]).

:- use_module(library(atts)).
:- use_module(library(lists)).

:- attribute type/1.
:- dynamic ancestor/2.

%% Trealla library(atts) is SICStus-shaped. Bridge to SWI's
%% attr_unify_hook(+AttValue, +Other) as requested by the catalog.

verify_attributes(Var, Other, Goals) :-
    ( get_attr(Var, type, AttValue) ->
        Goals = [attr_unify_hook(AttValue, Other)]
    ; Goals = []
    ).

%% attr_unify_hook(+AttValue, +Other)
%% Called when an attributed type variable is unified.
attr_unify_hook(AttValue, Other) :-
    ( var(Other) ->
        ( get_attr(Other, type, OtherAtt) ->
            meet(AttValue, OtherAtt, Merged),
            put_attr(Other, type, Merged)
        ; put_attr(Other, type, AttValue)
        )
    ; meet(AttValue, Other, Merged),
      ( var(Other) ->
          put_attr(Other, type, Merged)
      ; true
      )
    ).

%% setup_var(?Var, +Constraint)
%% Constraint is `none` or a Prolog term such as extends(rec(Var)).
setup_var(Var, none) :-
    put_attr(Var, type, top).
setup_var(Var, Constraint) :-
    Constraint \= none,
    put_attr(Var, type, constraint(Constraint)).

%% constrain(+VarOrType, +Type)
%% Accumulate Type onto a type variable (meet / intersection).
constrain(Var, Type) :-
    var(Var),
    !,
    ( get_attr(Var, type, Old) ->
        meet(Old, Type, New),
        put_attr(Var, type, New)
    ; put_attr(Var, type, Type)
    ).
constrain(Existing, Type) :-
    unify_type(Existing, Type).

%% constrain_join(+VarOrType, +Type)
%% Like constrain/2 but joins (union) successive groundings — varargs.
constrain_join(Var, Type) :-
    var(Var),
    !,
    ( get_attr(Var, type, Old) ->
        join(Old, Type, New),
        put_attr(Var, type, New)
    ; put_attr(Var, type, Type)
    ).
constrain_join(Existing, Type) :-
    unify_type(Existing, Type).

%% unify_type(?A, ?B)
unify_type(A, B) :-
    A == B, !.
unify_type(A, B) :-
    var(A), !,
    constrain(A, B).
unify_type(A, B) :-
    var(B), !,
    constrain(B, A).
unify_type(array(T), array(U)) :-
    !,
    unify_type(T, U).
unify_type(fn(As, R), fn(Bs, S)) :-
    !,
    unify_args(As, Bs),
    unify_type(R, S).
unify_type(tuple(As), tuple(Bs)) :-
    !,
    unify_args(As, Bs).
unify_type(union(A, B), T) :-
    !,
    ( unify_type(A, T) ; unify_type(B, T) ).
unify_type(T, union(A, B)) :-
    !,
    unify_type(union(A, B), T).
unify_type(inter(A, B), T) :-
    !,
    unify_type(A, T),
    unify_type(B, T).
unify_type(T, inter(A, B)) :-
    !,
    ( unify_type(T, A) ; unify_type(T, B) ).
unify_type(fn(As, unit), array(fn(As, unit))) :-
    !.
unify_type(A, B) :-
    ancestor(A, B), !.
unify_type(A, B) :-
    A = B.

unify_args([], []) :- !.
unify_args([A|As], [B|Bs]) :-
    unify_type(A, B),
    unify_args(As, Bs).

%% compatible(+Formal, +Actual)
%% Actual may be passed where Formal is required. The source (Actual)
%% must not still contain free type variables.
compatible(Formal, Actual) :-
    copy_term(Formal-Actual, F-A),
    read_type(A, AR),
    ground_ty(AR),
    unify_type(F, A).

%% meet(+A, +B, -M)  greatest lower bound (intersection)
meet(top, T, T) :- !.
meet(T, top, T) :- !.
meet(T, T, T) :- !.
meet(constraint(C), T, R) :-
    !,
    satisfy_constraint(C, T),
    meet(top, T, R).
meet(T, constraint(C), R) :-
    !,
    meet(constraint(C), T, R).
meet(inter(A, B), T, R) :-
    !,
    meet(A, T, R1),
    meet(B, R1, R).
meet(T, inter(A, B), R) :-
    !,
    meet(inter(A, B), T, R).
meet(array(T), array(U), array(V)) :-
    !,
    meet(T, U, V).
meet(fn(As, R), fn(Bs, S), fn(As, P)) :-
    As == Bs, !,
    meet(R, S, P).
meet(A, B, A) :-
    ancestor(A, B), !.
meet(A, B, B) :-
    ancestor(B, A), !.
meet(A, B, inter(A, B)).

%% join(+A, +B, -J)  least upper bound (union)
join(top, T, T) :- !.
join(T, top, T) :- !.
join(T, T, T) :- !.
join(union(A, B), T, R) :-
    !,
    join(A, T, R1),
    join(B, R1, R).
join(T, union(A, B), R) :-
    !,
    join(union(A, B), T, R).
join(A, B, B) :-
    ancestor(A, B), !.
join(A, B, A) :-
    ancestor(B, A), !.
join(A, B, union(A, B)).

satisfy_constraint(extends(Bound), Actual) :-
    copy_term(Bound, Bound1),
    ( ancestor(Actual, Bound1) ->
        true
    ; Bound1 = Actual
    ; unify_type(Actual, Bound1)
    ).

%% read_type(+Term, -Type)
%% Project an attributed variable to its accumulated type term.
%% Unconstrained variables become `top` (a type hole in XML).
read_type(Term, Type) :-
    var(Term), !,
    ( get_attr(Term, type, T0), T0 \= top ->
        read_type(T0, Type)
    ; Type = top
    ).
read_type(array(A), array(B)) :-
    !,
    read_type(A, B).
read_type(fn(As, R), fn(Bs, S)) :-
    !,
    maplist(read_type, As, Bs),
    read_type(R, S).
read_type(tuple(As), tuple(Bs)) :-
    !,
    maplist(read_type, As, Bs).
read_type(inter(A, B), inter(C, D)) :-
    !,
    read_type(A, C),
    read_type(B, D).
read_type(union(A, B), union(C, D)) :-
    !,
    read_type(A, C),
    read_type(B, D).
read_type(constraint(_), top) :- !.
read_type(T, T).

connectable(Term) :-
    read_type(Term, Type),
    ground_ty(Type).

ground_ty(T) :-
    var(T), !, fail.
ground_ty(top) :-
    !, fail.
ground_ty(constraint(_)) :-
    !, fail.
ground_ty(array(T)) :-
    !,
    ground_ty(T).
ground_ty(fn(As, R)) :-
    !,
    maplist(ground_ty, As),
    ground_ty(R).
ground_ty(tuple(As)) :-
    !,
    maplist(ground_ty, As).
ground_ty(inter(A, B)) :-
    !,
    ground_ty(A),
    ground_ty(B).
ground_ty(union(A, B)) :-
    !,
    ground_ty(A),
    ground_ty(B).
ground_ty(_).

assert_ancestors([]).
assert_ancestors([Child-Parent|Rest]) :-
    assertz(ancestor(Child, Parent)),
    assert_ancestors(Rest).

clear_ancestors :-
    retractall(ancestor(_, _)).
