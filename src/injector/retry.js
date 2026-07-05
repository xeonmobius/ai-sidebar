export function buildTxtRetryFile(file) {
  const base = file.name.replace(/\.(md|markdown|pdf|html|htm)$/i, '');
  return new File([file], `${base}.txt`, { type: 'text/plain' });
}
