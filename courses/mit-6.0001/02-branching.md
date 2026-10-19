---
concept: branching
citation: Lecture 2, Guttag ch. 2.2
---

## Boolean conditions

A condition is an expression that evaluates to True or False. Comparison operators such as ==, !=, <, and >= produce booleans, and the logical operators and, or and not combine them. Note that == tests equality while = assigns; confusing the two is a classic early error.

## if, elif and else

Branching lets a program choose a path. The if statement tests a condition and runs its block only when the condition is True. An elif clause is tested only when every earlier condition in the chain was False, so at most one branch of an if-elif-else chain runs. The else clause catches every remaining case and needs no condition.

## Blocks and indentation

Python uses indentation, not braces, to mark which statements belong to a branch. Every line indented under the if runs together as one block. A statement that is dedented back to the level of the if runs after the whole chain, no matter which branch was taken. Nested conditionals are simply blocks inside blocks.
