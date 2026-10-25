/*
 * math_lib.h — public API of the demo math library.
 *
 * This header intentionally carries Doxygen-style comments so the
 * parser must extract prototypes, param docs and return docs.
 */
#ifndef MATH_LIB_H
#define MATH_LIB_H

#include <stddef.h>

/**
 * Add two integers.
 * @param a first operand
 * @param b second operand
 * @return the sum of a and b
 */
int ml_add(int a, int b);

/* Compute a * b. */
int ml_multiply(int a, int b);

/**
 * Clamp a value into [lo, hi].
 * @param value the number to clamp
 * @param lo    lower bound (inclusive)
 * @param hi    upper bound (inclusive)
 * @retval clamped value
 */
double ml_clamp(double value, double lo, double hi);

/** Repeat a string `n` times. Caller frees the result. */
char *ml_repeat(const char *text, size_t n);

/** Sum the first `count` elements of `data`. */
long ml_sum(const int *data, size_t count);

/** Number of entries in the lookup table. */
extern const size_t ML_TABLE_SIZE;

#endif /* MATH_LIB_H */
