p='src/features/export/exportWriter.ts'
s=open(p).read()

# 1. Fix sanitiseFilename: strip traversal components.
old_san = '''export function sanitizeFilename(name: string): string {
  // 1. Strip anything that looks like a path, so `../evil` cannot escape.
  let out = name.replace(/[\\\\/]/g, '_');
  // 2. Remove path traversal components entirely rather than substituting, so
  //    `..` cannot be smuggled back in by a later join.
  out = out.split(/[\\\\/]/).pop() ?? '';
'''
new_san = '''export function sanitizeFilename(name: string): string {
  // 1. Split on path separators so traversal components can be dropped.
  const parts = name.split(/[\\\\/]/);
  // 2. Drop `.` and `..` segments entirely, so `../evil` cannot escape.
  const kept = parts.filter((part) => part && part !== '.' && part !== '..');
  // 3. Join the survivors with `_`, then strip any remaining separators.
  let out = kept.join('_').replace(/[\\\\/]/g, '_');
'''
assert old_san in s
s=s.replace(old_san,new_san)

# 2. confirmed flag: small plans don't need the large-export gate, so they are
#    confirmed by default (startWriting requires confirmed).
old_conf = '''  // `EXP-10`: large exports get a second confirmation.
  if (needsExportConfirmation(plan)) {
    run = confirmAccepted(run);
  }
'''
new_conf = '''  // `EXP-10`: large exports get a second confirmation; small ones are confirmed
  // by default so `startWriting` (which requires `confirmed`) can proceed.
  if (needsExportConfirmation(plan)) {
    // Only confirmed if the user accepts; otherwise the run stays in `picking`.
  } else {
    run = confirmAccepted(run);
  }
'''
assert old_conf in s
s=s.replace(old_conf,new_conf)

open(p,'w').write(s)
print("done")
EOF