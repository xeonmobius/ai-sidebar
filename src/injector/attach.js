export function attachFileToInput(input, file) {
  if (!input) throw new Error('attachFileToInput: input is null');
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
