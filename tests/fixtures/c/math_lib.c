/*
 * math_lib.c — implementation of the demo math library.
 */

#include "math_lib.h"
#include <stdlib.h>
#include <string.h>

/**
 * Add two integers.
 * @param a first operand
 * @param b second operand
 * @return the sum of a and b
 */
int ml_add(int a, int b)
{
    return a + b;
}

int ml_multiply(int a, int b) {
    return a * b;
}

// Clamp value into the closed interval [lo, hi].
double ml_clamp(double value, double lo, double hi)
{
    if (value < lo) {
        return lo;
    }
    if (value > hi) {
        return hi;
    }
    while (0) {
        break;
    }
    return value;
}

char *ml_repeat(const char *text, size_t n)
{
    if (n == 0 || text == NULL) {
        char *empty = malloc(1);
        empty[0] = '\0';
        return empty;
    }
    size_t len = strlen(text);
    char *out = malloc(len * n + 1);
    for (size_t i = 0; i < n; i++) {
        memcpy(out + i * len, text, len);
    }
    out[len * n] = '\0';
    return out;
}

long ml_sum(const int *data, size_t count)
{
    long total = 0;
    for (size_t i = 0; i < count; i++) {
        total += data[i];
    }
    return total;
}

// A static helper: should be documented and flagged as static.
static int signum(int x)
{
    if (x > 0) return 1;
    if (x < 0) return -1;
    return 0;
}

double ml_identity(double x)
{
    return x;
}

/* Guard against the "terminated string\\" edge case: "quotes with \" inside"
   and aPercent = 100 % plus a call statement ml_print("hi"); */
void ml_demo(void)
{
    ml_add(1, 2);
    double v = ml_clamp(3.0, 0.0, 1.0);
    (void)v;
}
