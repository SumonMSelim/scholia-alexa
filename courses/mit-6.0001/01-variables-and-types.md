---
concept: variables-and-types
citation: Lecture 1, Guttag ch. 2.1
---

## Objects, values and types

Everything a Python program manipulates is an object. Every object has a type, and the type decides what you can do with it. Scalar objects are indivisible: int for whole numbers, float for real numbers, bool for True and False, and NoneType with its single value None. Strings are not scalar; they are sequences of characters. Use type(x) to ask what something is.

## Binding names to values

A variable is a name bound to a value. The statement pi = 3.14 does not store a number in a box; it binds the name pi to the object 3.14. Rebinding with pi = 22 / 7 makes the name point at a different object, and the old object is unchanged. Names should describe the role of the value so the program reads like prose.

## Operators and conversion

Arithmetic operators behave according to the operand types: 3 / 2 gives a float, 3 // 2 gives the int 1, and 3 % 2 gives the remainder. Mixing int and float produces a float. To cross types explicitly, cast with int("3"), float(4) or str(7). Casting is how you turn input() text, which is always a string, into a number you can compute with.
