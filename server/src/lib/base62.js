const A = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export function encode(n) {
  n = BigInt(n); let s = '';
  do { s = A[Number(n % 62n)] + s; n /= 62n; } while (n > 0n);
  return s;
}