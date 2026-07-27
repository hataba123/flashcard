export interface Deck {
  id: string;
  name: string;
  description: string | null;
  desiredRetention: number;
  dailyNewCardLimit: number;
  isCore: boolean;
  isArchived: boolean;
}

export interface Note {
  id: string;
  deckId: string;
  noteType: 'Basic' | 'BasicAndReverse' | 'Cloze';
  fieldsJson: string;
  tagsJson: string;
}

export interface ExcelImportResult {
  importedNotes: number;
  createdCards: number;
  skippedRows: number;
  errors: string[];
  scannedRows: number;
  recognizedHeaders: number;
  recognizedBlocks: number;
}
export interface ExcelImportPreview {
  rows: Array<{ front: string; back: string; tags: string[]; noteType: string }>;
  validRows: number;
  skippedRows: number;
  errors: string[];
  scannedRows: number;
  recognizedHeaders: number;
}
