const exampleSeparatorPattern = /\s+([—–])\s*/gu;

export function formatCardTextForDisplay(text: string): string {
  return text.replace(exampleSeparatorPattern, '\n$1 ');
}
