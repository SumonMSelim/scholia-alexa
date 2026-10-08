---
concept: recursion
citation: Lecture 6, Guttag ch. 4.3
---

## Recursive definitions

A recursive function solves a problem by calling itself on a smaller version of the same problem. The definition has two parts: one or more base cases that can be answered directly, and a recursive case that reduces the input and combines the result of the smaller call. Factorial is the classic example: 1 when n is 1, otherwise n times factorial of n minus 1.

## Base cases and termination

Every recursive call must move towards a base case, or the function recurses forever and eventually raises a RecursionError. When writing a recursive function, state the base case first, then check that each recursive call strictly shrinks the problem.

## Recursion versus iteration

Any recursion can be rewritten with a loop and vice versa, but some problems such as the Towers of Hanoi or walking a nested structure are far easier to express recursively. Each pending call keeps its own scope on the call stack, which is why the variables of different calls do not interfere.
